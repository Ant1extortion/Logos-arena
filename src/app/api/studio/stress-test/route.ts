import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserScan, TIER_LIMITS, SubscriptionTier } from "@/lib/debate-state";
import { stressTestDraft } from "@/lib/ai-referee";

export async function POST(req: NextRequest) {
  try {
    await ensureTablesExist();
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required to run draft stress-test scan" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      draftText,
      documentType = "Sermon",
      targetAudience = "Atheist Skeptic",
      device_hash,
    } = body;

    if (!draftText || typeof draftText !== "string" || draftText.trim().length === 0) {
      return NextResponse.json(
        { error: "draftText is required" },
        { status: 400 }
      );
    }

    const userTier = (user.tier as SubscriptionTier) || "FREE";
    const limits = TIER_LIMITS[userTier] || TIER_LIMITS.FREE;
    const maxScans = limits.studioScansPerMonth;

    // 1. Check user tier scan limit
    if (!canUserScan(userTier, user.studio_scans_used_this_month)) {
      return NextResponse.json(
        {
          error: `Monthly studio scan quota exceeded for ${userTier} tier (${user.studio_scans_used_this_month}/${maxScans}). Upgrade your plan to stress-test more drafts.`,
          quotaExceeded: true,
          scansUsed: user.studio_scans_used_this_month,
          maxScans,
        },
        { status: 403 }
      );
    }

    // 2. Check device_hash quota to prevent multi-account smurfing
    const effectiveDeviceHash = device_hash || user.device_hash;
    if (effectiveDeviceHash) {
      const deviceUsers = await db
        .select({
          id: users.id,
          scans_used: users.studio_scans_used_this_month,
        })
        .from(users)
        .where(eq(users.device_hash, effectiveDeviceHash));

      const totalDeviceScans = deviceUsers.reduce(
        (sum, u) => sum + (u.scans_used || 0),
        0
      );

      if (totalDeviceScans >= maxScans) {
        return NextResponse.json(
          {
            error: `Monthly studio scan quota exceeded for this device (${totalDeviceScans}/${maxScans}). Upgrade your plan or wait until next month.`,
            quotaExceeded: true,
            scansUsed: totalDeviceScans,
            maxScans,
          },
          { status: 403 }
        );
      }
    }

    // 3. Execute stress-test analysis
    const result = await stressTestDraft(draftText, documentType, targetAudience);

    // 4. Increment user's scan count
    const updatedScans = user.studio_scans_used_this_month + 1;
    await db
      .update(users)
      .set({
        studio_scans_used_this_month: updatedScans,
        device_hash: effectiveDeviceHash || user.device_hash,
      })
      .where(eq(users.id, user.id));

    return NextResponse.json(
      {
        result,
        scansUsed: updatedScans,
        scansRemaining: Math.max(0, maxScans - updatedScans),
        maxScans,
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
