import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql, or } from "drizzle-orm";
import { db } from "@/db";
import { users, subscriptions, sundayTournaments, turns, debates } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { calculateSundayBounty } from "@/lib/debate-state";

/**
 * Validates admin passcode from header (x-admin-passcode) or query param or bearer token.
 */
function verifyAdminAuthorization(req: NextRequest): boolean {
  const expectedPasscode = process.env.ADMIN_PASSCODE || "logos_founder_secret_2025";
  const headerCode = req.headers.get("x-admin-passcode");
  if (headerCode && headerCode === expectedPasscode) return true;

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.substring(7).trim();
    if (bearer === expectedPasscode) return true;
  }

  const { searchParams } = new URL(req.url);
  const queryCode = searchParams.get("passcode");
  if (queryCode && queryCode === expectedPasscode) return true;

  return false;
}

export async function GET(req: NextRequest) {
  try {
    await ensureTablesExist();

    if (!verifyAdminAuthorization(req)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid founder admin passcode" },
        { status: 401 }
      );
    }

    // 1. Total Subscribers & User Counts
    const allUsers = await db.select().from(users);
    const totalUsers = allUsers.length;
    const proUsers = allUsers.filter((u) => u.tier === "PRO").length;
    const premiumUsers = allUsers.filter((u) => u.tier === "PREMIUM").length;
    const totalSubscribers = proUsers + premiumUsers;

    // 2. Subscriptions & Revenue Metrics
    const allSubs = await db.select().from(subscriptions).orderBy(desc(subscriptions.created_at));
    const totalRevenueNgn = allSubs
      .filter((s) => s.currency === "NGN" && s.status === "ACTIVE")
      .reduce((sum, s) => sum + s.amount, 0);

    const totalRevenueUsd = allSubs
      .filter((s) => (s.currency === "USD" || s.currency === "USDT") && s.status === "ACTIVE")
      .reduce((sum, s) => sum + s.amount, 0);

    const pendingSubs = allSubs.filter((s) => s.status === "PENDING");

    // 3. Current Sunday Bounty Pool & Active Tournament
    const activeTourneys = await db
      .select()
      .from(sundayTournaments)
      .orderBy(desc(sundayTournaments.created_at))
      .limit(1);

    const currentTournament = activeTourneys[0] || null;

    // 4. Flagged Anti-Cheat Turns
    // Turns with integrity_score < 80 OR integrity_flags IS NOT NULL OR blitz_passed = 0
    const flaggedTurns = await db
      .select({
        id: turns.id,
        debate_id: turns.debate_id,
        round_number: turns.round_number,
        side: turns.side,
        author_name: turns.author_name,
        argument_text: turns.argument_text,
        integrity_score: turns.integrity_score,
        integrity_flags: turns.integrity_flags,
        blitz_required: turns.blitz_required,
        blitz_passed: turns.blitz_passed,
        created_at: turns.created_at,
      })
      .from(turns)
      .where(
        or(
          sql`${turns.integrity_score} < 80`,
          sql`${turns.integrity_flags} IS NOT NULL`,
          sql`${turns.blitz_passed} = 0`
        )
      )
      .orderBy(desc(turns.created_at))
      .limit(30);

    return NextResponse.json(
      {
        metrics: {
          totalUsers,
          totalSubscribers,
          proUsers,
          premiumUsers,
          totalRevenueNgn,
          totalRevenueUsd,
          pendingSubscriptionsCount: pendingSubs.length,
        },
        currentTournament,
        pendingSubscriptions: pendingSubs,
        flaggedTurns,
        usersList: allUsers.map((u) => ({
          id: u.id,
          email: u.email,
          display_name: u.display_name,
          tier: u.tier,
          debates_used_this_month: u.debates_used_this_month,
          studio_scans_used_this_month: u.studio_scans_used_this_month,
          verified_wins: u.verified_wins,
          avg_integrity_score: u.avg_integrity_score,
          subscription_expires_at: u.subscription_expires_at,
          created_at: u.created_at,
        })),
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

export async function POST(req: NextRequest) {
  try {
    await ensureTablesExist();

    if (!verifyAdminAuthorization(req)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid founder admin passcode" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action } = body;

    // Action 1: Set/Update Sunday Scholar Weekly Motion Topic
    if (action === "set_motion") {
      const { motion_topic, week_label } = body;
      if (!motion_topic || typeof motion_topic !== "string") {
        return NextResponse.json(
          { error: "motion_topic is required" },
          { status: 400 }
        );
      }

      const activeTourneys = await db
        .select()
        .from(sundayTournaments)
        .orderBy(desc(sundayTournaments.created_at))
        .limit(1);

      let tourney = activeTourneys[0];
      const now = new Date().toISOString();

      if (!tourney) {
        const [created] = await db
          .insert(sundayTournaments)
          .values({
            id: `snt_${Date.now()}_admin`,
            week_label: week_label || "Week of " + now.slice(0, 10),
            motion_topic: motion_topic.trim(),
            status: "QUALIFIERS_OPEN",
            base_prize_usd: 20,
            revenue_pool_usd: 0,
            effective_prize_usd: 20,
            created_at: now,
          })
          .returning();
        tourney = created;
      } else {
        const [updated] = await db
          .update(sundayTournaments)
          .set({
            motion_topic: motion_topic.trim(),
            ...(week_label ? { week_label } : {}),
          })
          .where(eq(sundayTournaments.id, tourney.id))
          .returning();
        tourney = updated;
      }

      return NextResponse.json(
        { message: "Weekly Sunday Scholar Bounty motion updated successfully", tournament: tourney },
        { status: 200 }
      );
    }

    // Action 2: 1-Click Manual Upgrade/Override of any user
    if (action === "manual_upgrade") {
      const { user_id, tier } = body;
      if (!user_id || !tier || (tier !== "FREE" && tier !== "PRO" && tier !== "PREMIUM")) {
        return NextResponse.json(
          { error: "user_id and valid tier ('FREE' | 'PRO' | 'PREMIUM') are required" },
          { status: 400 }
        );
      }

      const expiresAt =
        tier === "FREE"
          ? null
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      const [updatedUser] = await db
        .update(users)
        .set({
          tier,
          subscription_expires_at: expiresAt,
        })
        .where(eq(users.id, user_id))
        .returning();

      if (!updatedUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { message: `User ${updatedUser.display_name} upgraded to ${tier}`, user: updatedUser },
        { status: 200 }
      );
    }

    // Action 3: 1-Click Approve Pending Crypto/Paystack Subscription
    if (action === "approve_subscription") {
      const { subscription_id } = body;
      if (!subscription_id) {
        return NextResponse.json(
          { error: "subscription_id is required" },
          { status: 400 }
        );
      }

      const foundSubs = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription_id))
        .limit(1);

      if (foundSubs.length === 0) {
        return NextResponse.json(
          { error: "Subscription not found" },
          { status: 404 }
        );
      }

      const sub = foundSubs[0];
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

      // Mark subscription ACTIVE
      await db
        .update(subscriptions)
        .set({ status: "ACTIVE" })
        .where(eq(subscriptions.id, sub.id));

      // Upgrade user
      await db
        .update(users)
        .set({
          tier: sub.plan,
          subscription_expires_at: expiresAt,
        })
        .where(eq(users.id, sub.user_id));

      // Contribute 30% to active Sunday Tournament
      const usdEquivalent = sub.currency === "NGN" ? (sub.plan === "PRO" ? 3 : 7) : sub.amount;
      const contribution = Number((usdEquivalent * 0.3).toFixed(2));

      const activeTourneys = await db
        .select()
        .from(sundayTournaments)
        .orderBy(desc(sundayTournaments.created_at))
        .limit(1);

      if (activeTourneys.length > 0) {
        const tourney = activeTourneys[0];
        const newPool = Number(((tourney.revenue_pool_usd || 0) + contribution).toFixed(2));
        await db
          .update(sundayTournaments)
          .set({
            revenue_pool_usd: newPool,
            effective_prize_usd: calculateSundayBounty(newPool),
          })
          .where(eq(sundayTournaments.id, tourney.id));
      }

      return NextResponse.json(
        { message: `Subscription ${sub.id} approved and user upgraded to ${sub.plan}` },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Invalid action. Supported actions: 'set_motion', 'manual_upgrade', 'approve_subscription'" },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
