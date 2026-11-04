import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { debates } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { getAuthenticatedUser } from "@/lib/auth";
import { hasPreFlightVarAccess, SubscriptionTier } from "@/lib/debate-state";
import { stressTestDraft } from "@/lib/ai-referee";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await ensureTablesExist();
    const { id } = await params;

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required for Pre-Flight VAR scan" },
        { status: 401 }
      );
    }

    const debateList = await db
      .select()
      .from(debates)
      .where(eq(debates.id, id))
      .limit(1);

    if (debateList.length === 0) {
      return NextResponse.json(
        { error: "Debate not found" },
        { status: 404 }
      );
    }

    const debate = debateList[0];

    // Pre-Flight VAR is strictly forbidden in SUNDAY_BOUNTY tournament play (100% unassisted)
    if (debate.mode === "SUNDAY_BOUNTY") {
      return NextResponse.json(
        {
          error: "Pre-Flight VAR check is strictly disabled in Sunday Scholar Bounty mode to ensure 100% unassisted tournament play.",
          modeBlocked: true,
        },
        { status: 403 }
      );
    }

    // Verify user is PREMIUM tier
    const userTier = (user.tier as SubscriptionTier) || "FREE";
    if (!hasPreFlightVarAccess(userTier)) {
      return NextResponse.json(
        {
          error: "Pre-Flight VAR check requires a PREMIUM subscription tier. Upgrade your account to privately scan draft turns before submission.",
          upgradeRequired: true,
        },
        { status: 403 }
      );
    }

    // Check if user is a participant in this debate
    if (user.id !== debate.pro_user_id && user.id !== debate.con_user_id) {
      return NextResponse.json(
        { error: "Only active participants in this debate can run Pre-Flight VAR checks." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { draftText } = body;

    if (!draftText || typeof draftText !== "string" || draftText.trim().length === 0) {
      return NextResponse.json(
        { error: "draftText is required" },
        { status: 400 }
      );
    }

    // Execute stress test with debate context as a philosophical treatise against an opposing debater
    const analysis = await stressTestDraft(
      draftText,
      `Debate Turn for "${debate.topic}"`,
      "Hostile Philosophical Opponent"
    );

    return NextResponse.json(
      {
        debateId: id,
        motionTopic: debate.topic,
        analysis,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
