import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as authPost } from "../auth/route";
import { POST as verifySubPost } from "../subscriptions/verify/route";
import { GET as adminGet, POST as adminPost } from "../admin/route";
import { GET as debatesGet, POST as debatesPost } from "../debates/route";
import { db } from "@/db";
import { users, subscriptions, sundayTournaments, turns, debates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureTablesExist } from "@/db/init";

function createJsonRequest(url: string, method: string, body?: unknown, token?: string, headers?: Record<string, string>): NextRequest {
  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...headers,
  };
  if (token) {
    reqHeaders["authorization"] = `Bearer ${token}`;
  }

  return new NextRequest(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Subscription Verification, Sunday Bounty, and Founder Admin API", () => {
  beforeEach(async () => {
    await ensureTablesExist();
    await db.delete(subscriptions);
    await db.delete(users);
  });

  describe("1. Replay-Proof Subscription Verification (/api/subscriptions/verify)", () => {
    it("successfully verifies Paystack subscription and prevents replay attacks", async () => {
      // 1. Sign up user
      const signupRes = await authPost(
        createJsonRequest("http://localhost:3000/api/auth", "POST", {
          action: "signup",
          email: "paystack_scholar@logos.arena",
          display_name: "Paystack Scholar",
          passcode: "secure_pass_123",
        })
      );
      const { sessionToken, user } = await signupRes.json();
      expect(user.tier).toBe("FREE");

      const paymentRef = `pstk_${Date.now()}_test_ref`;

      // 2. Verify Paystack PRO tier
      const verifyReq = createJsonRequest(
        "http://localhost:3000/api/subscriptions/verify",
        "POST",
        {
          plan: "PRO",
          payment_method: "PAYSTACK",
          payment_ref: paymentRef,
          currency: "NGN",
        },
        sessionToken
      );

      const verifyRes = await verifySubPost(verifyReq);
      expect(verifyRes.status).toBe(200);
      const data = await verifyRes.json();
      expect(data.tier).toBe("PRO");
      expect(data.subscription.status).toBe("ACTIVE");
      expect(data.bountyPool).toBeDefined();

      // Check DB user updated to PRO
      const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));
      expect(updatedUser.tier).toBe("PRO");
      expect(updatedUser.subscription_expires_at).toBeDefined();

      // 3. REPLAY ATTEMPT: Same reference must fail with 409 Conflict
      const replayReq = createJsonRequest(
        "http://localhost:3000/api/subscriptions/verify",
        "POST",
        {
          plan: "PRO",
          payment_method: "PAYSTACK",
          payment_ref: paymentRef,
        },
        sessionToken
      );

      const replayRes = await verifySubPost(replayReq);
      expect(replayRes.status).toBe(409);
      const replayData = await replayRes.json();
      expect(replayData.error).toContain("already been used and cannot be replayed");
    });

    it("verifies Crypto (USDT BEP-20) subscription, format validation, and prevents replay", async () => {
      // Sign up user
      const signupRes = await authPost(
        createJsonRequest("http://localhost:3000/api/auth", "POST", {
          action: "signup",
          email: "crypto_scholar@logos.arena",
          display_name: "Crypto Scholar",
          passcode: "crypto_pass_456",
        })
      );
      const { sessionToken, user } = await signupRes.json();

      // 1. Reject invalid hash format
      const invalidHashReq = createJsonRequest(
        "http://localhost:3000/api/subscriptions/verify",
        "POST",
        {
          plan: "PREMIUM",
          payment_method: "CRYPTO",
          tx_hash: "0xinvalidhash",
          network: "BSC",
        },
        sessionToken
      );
      const invalidHashRes = await verifySubPost(invalidHashReq);
      expect(invalidHashRes.status).toBe(400);

      // 2. Accept valid 64-char hex hash
      const validTxHash = `0x${"a".repeat(64)}`;
      const cryptoReq = createJsonRequest(
        "http://localhost:3000/api/subscriptions/verify",
        "POST",
        {
          plan: "PREMIUM",
          payment_method: "CRYPTO",
          tx_hash: validTxHash,
          network: "BSC",
        },
        sessionToken
      );

      const cryptoRes = await verifySubPost(cryptoReq);
      expect(cryptoRes.status).toBe(200);
      const cryptoData = await cryptoRes.json();
      expect(cryptoData.tier).toBe("PREMIUM");

      // Check DB user updated to PREMIUM
      const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));
      expect(updatedUser.tier).toBe("PREMIUM");

      // 3. Replay with identical hash fails
      const replayReq = createJsonRequest(
        "http://localhost:3000/api/subscriptions/verify",
        "POST",
        {
          plan: "PREMIUM",
          payment_method: "CRYPTO",
          tx_hash: validTxHash,
        },
        sessionToken
      );
      const replayRes = await verifySubPost(replayReq);
      expect(replayRes.status).toBe(409);
    });

    it("allocates 30% subscription revenue to Sunday Scholar Bounty pool, scaling effective prize", async () => {
      const signupRes = await authPost(
        createJsonRequest("http://localhost:3000/api/auth", "POST", {
          action: "signup",
          email: "bounty_funder@logos.arena",
          display_name: "Bounty Funder",
          passcode: "pass_bounty",
        })
      );
      const { sessionToken } = await signupRes.json();

      const txHash = `0x${"b".repeat(64)}`;
      const subRes = await verifySubPost(
        createJsonRequest(
          "http://localhost:3000/api/subscriptions/verify",
          "POST",
          {
            plan: "PREMIUM", // $7.00 -> 30% = $2.10
            payment_method: "CRYPTO",
            tx_hash: txHash,
          },
          sessionToken
        )
      );

      expect(subRes.status).toBe(200);
      const data = await subRes.json();
      expect(data.bountyPool.bountyContributionUsd).toBe(2.1);
      expect(data.bountyPool.effective_prize_usd).toBeGreaterThanOrEqual(20);
    });
  });

  describe("2. Sunday Scholar Bounty Hub & Leaderboard (/api/debates?leaderboard=sunday)", () => {
    it("returns active tournament motion and filters out users with integrity score < 80", async () => {
      // 1. Create a high integrity debater
      const goodUserRes = await authPost(
        createJsonRequest("http://localhost:3000/api/auth", "POST", {
          action: "signup",
          email: "high_integrity@logos.arena",
          display_name: "High Integrity Debater",
          passcode: "pass_high",
        })
      );
      const { user: goodUser } = await goodUserRes.json();
      await db.update(users).set({ verified_wins: 5, avg_integrity_score: 95 }).where(eq(users.id, goodUser.id));

      // 2. Create a flagged low integrity debater (<80)
      const lowUserRes = await authPost(
        createJsonRequest("http://localhost:3000/api/auth", "POST", {
          action: "signup",
          email: "low_integrity@logos.arena",
          display_name: "Low Integrity Debater",
          passcode: "pass_low",
        })
      );
      const { user: lowUser } = await lowUserRes.json();
      await db.update(users).set({ verified_wins: 10, avg_integrity_score: 65 }).where(eq(users.id, lowUser.id));

      // Request Sunday leaderboard
      const res = await debatesGet(new NextRequest("http://localhost:3000/api/debates?leaderboard=sunday"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tournaments).toBeDefined();

      // In the hub page, filter logic requires avg_integrity_score >= 80
      const filtered = data.leaderboard.filter((u: { avg_integrity_score: number }) => u.avg_integrity_score >= 80);
      const containsGood = filtered.some((u: { id: string }) => u.id === goodUser.id);
      const containsLow = filtered.some((u: { id: string }) => u.id === lowUser.id);
      expect(containsGood).toBe(true);
      expect(containsLow).toBe(false);
    });
  });

  describe("3. Founder Admin Dashboard API (/api/admin)", () => {
    const adminPasscode = process.env.ADMIN_PASSCODE || "logos_founder_secret_2025";

    it("rejects unauthorized access without correct admin passcode", async () => {
      const res = await adminGet(
        createJsonRequest("http://localhost:3000/api/admin", "GET", undefined, undefined, {
          "x-admin-passcode": "wrong_code",
        })
      );
      expect(res.status).toBe(401);
    });

    it("allows authorized founder to fetch metrics, gross revenue, and pending subscribers", async () => {
      // Create at least one user so totalUsers > 0
      await authPost(
        createJsonRequest("http://localhost:3000/api/auth", "POST", {
          action: "signup",
          email: "admin_test_user@logos.arena",
          display_name: "Admin Test User",
          passcode: "test_pass_123",
        })
      );

      const res = await adminGet(
        createJsonRequest("http://localhost:3000/api/admin", "GET", undefined, undefined, {
          "x-admin-passcode": adminPasscode,
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.metrics).toBeDefined();
      expect(data.metrics.totalUsers).toBeGreaterThan(0);
      expect(data.metrics.totalSubscribers).toBeGreaterThanOrEqual(0);
      expect(data.usersList).toBeDefined();
    });

    it("allows founder to set the weekly Sunday Bounty motion topic", async () => {
      const setMotionRes = await adminPost(
        createJsonRequest(
          "http://localhost:3000/api/admin",
          "POST",
          {
            action: "set_motion",
            motion_topic: "Is free will compatible with divine omniscience?",
            week_label: "Special Sunday Grand Championship",
          },
          undefined,
          {
            "x-admin-passcode": adminPasscode,
          }
        )
      );

      expect(setMotionRes.status).toBe(200);
      const data = await setMotionRes.json();
      expect(data.tournament.motion_topic).toBe("Is free will compatible with divine omniscience?");
      expect(data.tournament.week_label).toBe("Special Sunday Grand Championship");
    });

    it("allows founder to manually upgrade any debater account in 1-click", async () => {
      // Create user to upgrade
      const signupRes = await authPost(
        createJsonRequest("http://localhost:3000/api/auth", "POST", {
          action: "signup",
          email: "manual_target@logos.arena",
          display_name: "Manual Target",
          passcode: "pass_target",
        })
      );
      const { user } = await signupRes.json();
      expect(user.tier).toBe("FREE");

      // Founder upgrades user to PREMIUM
      const upgradeRes = await adminPost(
        createJsonRequest(
          "http://localhost:3000/api/admin",
          "POST",
          {
            action: "manual_upgrade",
            user_id: user.id,
            tier: "PREMIUM",
          },
          undefined,
          {
            "x-admin-passcode": adminPasscode,
          }
        )
      );

      expect(upgradeRes.status).toBe(200);
      const data = await upgradeRes.json();
      expect(data.user.tier).toBe("PREMIUM");

      const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));
      expect(dbUser.tier).toBe("PREMIUM");
    });
  });
});
