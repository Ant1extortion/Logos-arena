import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { debates, turns, users } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { getAuthenticatedUser } from "@/lib/auth";
import { detectPvPCollusion, COLLUSION_FLAG } from "@/lib/anti-cheat";
import { TIER_LIMITS, SubscriptionTier } from "@/lib/debate-state";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await ensureTablesExist();
    const { id } = await params;

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

    const debateTurns = await db
      .select()
      .from(turns)
      .where(eq(turns.debate_id, id))
      .orderBy(asc(turns.created_at));

    // Calculate integrity metrics
    const proTurns = debateTurns.filter((t) => t.side === "PRO");
    const conTurns = debateTurns.filter((t) => t.side === "CON");

    const proAvgIntegrity =
      proTurns.length > 0
        ? Math.round(
            proTurns.reduce((acc, t) => acc + (t.integrity_score || 100), 0) /
              proTurns.length
          )
        : debate.pro_integrity;

    const conAvgIntegrity =
      conTurns.length > 0
        ? Math.round(
            conTurns.reduce((acc, t) => acc + (t.integrity_score || 100), 0) /
              conTurns.length
          )
        : debate.con_integrity;

    return NextResponse.json(
      {
        debate: {
          ...debate,
          pro_integrity: proAvgIntegrity,
          con_integrity: conAvgIntegrity,
        },
        turns: debateTurns,
        integrityMetrics: {
          proAvgIntegrity,
          conAvgIntegrity,
          proTurnsCount: proTurns.length,
          conTurnsCount: conTurns.length,
          collusionDetected: debate.collusion_flag === COLLUSION_FLAG,
          isRanked: debate.is_ranked === 1,
        },
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

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    await ensureTablesExist();
    const { id } = await params;

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required to join debate" },
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

    if (debate.status !== "OPEN_CHALLENGE") {
      return NextResponse.json(
        { error: "Debate is not accepting challengers (already in progress or completed)" },
        { status: 400 }
      );
    }

    // Check if user is trying to join their own debate
    const isSameUser = debate.pro_user_id === user.id;

    // Check monthly quota for joining user
    const userTier = (user.tier as SubscriptionTier) || "FREE";
    const userLimit = TIER_LIMITS[userTier].debatesPerMonth;
    if (user.debates_used_this_month >= userLimit) {
      return NextResponse.json(
        {
          error: `Monthly debate quota exceeded for ${userTier} tier (${user.debates_used_this_month}/${userLimit}).`,
          quotaExceeded: true,
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const conDeviceHash = body.device_hash || user.device_hash || null;

    // Extract IPs from request headers
    const forwarded = req.headers.get("x-forwarded-for");
    const conIp = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "127.0.0.1";

    // Run PvP Collusion / Anti-Smurf Check
    // If both players share the same device fingerprint or IP address, or is same user
    const collusionDetected =
      isSameUser ||
      detectPvPCollusion(
        debate.pro_device_hash,
        conDeviceHash,
        null,
        conIp
      );

    const updateData: {
      con_user_id: string;
      con_name: string;
      con_tier: string;
      con_device_hash: string | null;
      status: "IN_PROGRESS";
      is_ranked?: number;
      collusion_flag?: string | null;
    } = {
      con_user_id: user.id,
      con_name: user.display_name,
      con_tier: user.tier,
      con_device_hash: conDeviceHash,
      status: "IN_PROGRESS",
    };

    if (collusionDetected) {
      updateData.is_ranked = 0;
      updateData.collusion_flag = COLLUSION_FLAG;
    }

    const [updatedDebate] = await db
      .update(debates)
      .set(updateData)
      .where(eq(debates.id, id))
      .returning();

    // Increment CON user's monthly debate usage
    await db
      .update(users)
      .set({
        debates_used_this_month: user.debates_used_this_month + 1,
        device_hash: conDeviceHash || user.device_hash,
      })
      .where(eq(users.id, user.id));

    return NextResponse.json(
      {
        debate: updatedDebate,
        collusionDetected,
        message: collusionDetected
          ? "Collusion/Self-play detected: Match marked unranked (no verified wins awarded)."
          : "Successfully joined debate.",
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
