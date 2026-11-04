import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { debates, users, sundayTournaments } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { getAuthenticatedUser } from "@/lib/auth";
import { TIER_LIMITS, SubscriptionTier } from "@/lib/debate-state";

export async function GET(req: NextRequest) {
  try {
    await ensureTablesExist();
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode");
    const status = searchParams.get("status");
    const leaderboard = searchParams.get("leaderboard");

    // Sunday Tournament Leaderboard requested
    if (leaderboard === "sunday" || leaderboard === "true") {
      const topScholars = await db
        .select({
          id: users.id,
          display_name: users.display_name,
          tier: users.tier,
          verified_wins: users.verified_wins,
          avg_integrity_score: users.avg_integrity_score,
        })
        .from(users)
        .orderBy(desc(users.verified_wins), desc(users.avg_integrity_score))
        .limit(20);

      const activeTournaments = await db
        .select()
        .from(sundayTournaments)
        .orderBy(desc(sundayTournaments.created_at))
        .limit(5);

      return NextResponse.json(
        {
          leaderboard: topScholars,
          tournaments: activeTournaments,
        },
        { status: 200 }
      );
    }

    // List debates
    const query = db.select().from(debates).$dynamic();

    const conditions = [];
    if (mode) {
      conditions.push(eq(debates.mode, mode as "PVE" | "PVP" | "SUNDAY_BOUNTY"));
    }
    if (status) {
      conditions.push(eq(debates.status, status as "OPEN_CHALLENGE" | "IN_PROGRESS" | "COMPLETED"));
    }

    const debateList = conditions.length > 0
      ? await query.where(sql.join(conditions, sql` AND `)).orderBy(desc(debates.created_at)).limit(50)
      : await query.orderBy(desc(debates.created_at)).limit(50);

    return NextResponse.json({ debates: debateList }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTablesExist();
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required to initiate a debate" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      topic,
      category = "Philosophy",
      mode = "PVE",
      ai_persona = "aquinas",
      device_hash,
    } = body;

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json(
        { error: "Motion topic is required" },
        { status: 400 }
      );
    }

    const userTier = (user.tier as SubscriptionTier) || "FREE";
    const userLimit = TIER_LIMITS[userTier].debatesPerMonth;

    // 1. Enforce monthly tier quota for user account
    if (user.debates_used_this_month >= userLimit) {
      return NextResponse.json(
        {
          error: `Monthly debate quota exceeded for ${userTier} tier (${user.debates_used_this_month}/${userLimit}). Upgrade your plan for more debates.`,
          quotaExceeded: true,
        },
        { status: 403 }
      );
    }

    // 2. Enforce monthly tier quota for device_hash (to prevent multi-accounting smurfs)
    const effectiveDeviceHash = device_hash || user.device_hash;
    if (effectiveDeviceHash) {
      const deviceUsers = await db
        .select({
          id: users.id,
          debates_used: users.debates_used_this_month,
          tier: users.tier,
        })
        .from(users)
        .where(eq(users.device_hash, effectiveDeviceHash));

      // Sum of debates used across all accounts sharing this device hash
      const totalDeviceDebatesUsed = deviceUsers.reduce(
        (sum, u) => sum + (u.debates_used || 0),
        0
      );

      // Device cannot exceed the maximum allowance of user's tier
      if (totalDeviceDebatesUsed >= userLimit) {
        return NextResponse.json(
          {
            error: `Monthly debate quota exceeded for this device (${totalDeviceDebatesUsed}/${userLimit}). Upgrade your tier or wait until next month.`,
            quotaExceeded: true,
          },
          { status: 403 }
        );
      }
    }

    // Determine initial debate status
    // PVE and SUNDAY_BOUNTY debates start IN_PROGRESS against AI
    // PVP debates start as OPEN_CHALLENGE waiting for an opponent to join
    const isPvp = mode === "PVP";
    const status = isPvp ? "OPEN_CHALLENGE" : "IN_PROGRESS";
    const debateId = `deb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const [newDebate] = await db
      .insert(debates)
      .values({
        id: debateId,
        topic: topic.trim(),
        category,
        mode,
        ai_persona: isPvp ? null : ai_persona,
        status,
        is_ranked: 1,
        collusion_flag: null,
        current_round: 1,
        current_turn: "PRO",
        pro_user_id: user.id,
        pro_name: user.display_name,
        pro_tier: user.tier,
        pro_device_hash: effectiveDeviceHash || null,
        con_user_id: isPvp ? null : "ai_arbiter",
        con_name: isPvp ? null : ai_persona,
        con_tier: isPvp ? "FREE" : user.tier,
        con_device_hash: null,
        pro_hp: 100,
        con_hp: 100,
        pro_clash_points: 0,
        con_clash_points: 0,
        pro_integrity: 100,
        con_integrity: 100,
        winner: null,
        final_autopsy_json: null,
        created_at: now,
      })
      .returning();

    // Increment user's monthly debate count
    await db
      .update(users)
      .set({
        debates_used_this_month: user.debates_used_this_month + 1,
        device_hash: effectiveDeviceHash || user.device_hash,
      })
      .where(eq(users.id, user.id));

    return NextResponse.json(
      {
        debate: newDebate,
        debatesRemaining: userLimit - (user.debates_used_this_month + 1),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
