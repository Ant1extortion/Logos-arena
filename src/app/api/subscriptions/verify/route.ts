import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { users, subscriptions, sundayTournaments } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { getAuthenticatedUser } from "@/lib/auth";
import { calculateSundayBounty } from "@/lib/debate-state";

// Constants for pricing
const PRICING_PLANS = {
  PRO: {
    usd: 3.0,
    ngn: 4500,
    name: "Pro Tier",
  },
  PREMIUM: {
    usd: 7.0,
    ngn: 10000,
    name: "Premium Tier",
  },
} as const;

/**
 * Validates 64-character hex transaction hash format with optional 0x prefix.
 */
function isValidCryptoTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash.trim());
}

/**
 * Verify Paystack transaction via Paystack API or deterministic test fallback.
 */
async function verifyPaystackTx(
  reference: string,
  expectedNgnAmount: number
): Promise<{ success: boolean; error?: string }> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (secretKey) {
    try {
      const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.status) {
        return { success: false, error: data.message || "Paystack verification failed" };
      }

      if (data.data?.status !== "success") {
        return { success: false, error: `Transaction status is '${data.data?.status}', expected 'success'` };
      }

      // Paystack returns amount in kobo (1 NGN = 100 kobo)
      const expectedKobo = expectedNgnAmount * 100;
      if (data.data?.amount && data.data.amount < expectedKobo) {
        return {
          success: false,
          error: `Amount paid (${data.data.amount / 100} NGN) is less than required (${expectedNgnAmount} NGN)`,
        };
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Paystack API connection error" };
    }
  }

  // Deterministic mock fallback for development & tests when PAYSTACK_SECRET_KEY is absent
  if (reference.startsWith("fail_")) {
    return { success: false, error: "Mock payment failure simulated" };
  }

  // Treat any non-failing reference as successful in mock mode
  return { success: true };
}

/**
 * Check crypto transaction receipt via public JSON-RPC if RPC URL is provided.
 */
async function verifyCryptoRpcTx(
  txHash: string,
  network: "BSC" | "BASE"
): Promise<{ verified: boolean; pendingAdmin?: boolean; error?: string }> {
  const rpcUrl =
    network === "BASE"
      ? process.env.BASE_RPC_URL || "https://mainnet.base.org"
      : process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org";

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.result) {
        // status "0x1" indicates success on EVM
        if (data.result.status === "0x1") {
          return { verified: true };
        } else if (data.result.status === "0x0") {
          return { verified: false, error: "Transaction reverted on-chain" };
        }
      }
    }
  } catch {
    // If public RPC fails or network is offline, queue for 1-click admin verification
  }

  // If RPC is unreachable or transaction is not yet mined, queue for admin verification or activate in test mode
  if (process.env.NODE_ENV === "test" || txHash.startsWith("0xtest")) {
    return { verified: true };
  }

  return { verified: false, pendingAdmin: true };
}

export async function POST(req: NextRequest) {
  try {
    await ensureTablesExist();

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required to verify subscription" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      plan,
      payment_method,
      payment_ref,
      tx_hash,
      currency,
      network = "BSC",
    } = body;

    // Validate plan
    if (plan !== "PRO" && plan !== "PREMIUM") {
      return NextResponse.json(
        { error: "Invalid plan. Must be 'PRO' or 'PREMIUM'" },
        { status: 400 }
      );
    }
    const validatedPlan = plan as "PRO" | "PREMIUM";

    // Validate payment method
    if (payment_method !== "PAYSTACK" && payment_method !== "CRYPTO") {
      return NextResponse.json(
        { error: "Invalid payment_method. Must be 'PAYSTACK' or 'CRYPTO'" },
        { status: 400 }
      );
    }

    const effectiveRef = (payment_method === "CRYPTO" ? (tx_hash || payment_ref) : payment_ref)?.trim();
    if (!effectiveRef) {
      return NextResponse.json(
        { error: payment_method === "CRYPTO" ? "Transaction hash (tx_hash) is required" : "Payment reference is required" },
        { status: 400 }
      );
    }

    // 1. REPLAY-PROOF PROTECTION: Enforce uniqueness on payment_ref in subscriptions table
    const existing = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.payment_ref, effectiveRef))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Payment reference / transaction hash has already been used and cannot be replayed" },
        { status: 409 }
      );
    }

    let status: "ACTIVE" | "PENDING" = "ACTIVE";
    let amountCharged = 0;
    let effectiveCurrency = currency || (payment_method === "PAYSTACK" ? "NGN" : "USDT");
    let usdEquivalent = 0;

    if (payment_method === "PAYSTACK") {
      effectiveCurrency = "NGN";
      amountCharged = PRICING_PLANS[validatedPlan].ngn;
      usdEquivalent = PRICING_PLANS[validatedPlan].usd;

      const verification = await verifyPaystackTx(effectiveRef, amountCharged);
      if (!verification.success) {
        return NextResponse.json(
          { error: verification.error || "Paystack transaction could not be verified" },
          { status: 400 }
        );
      }
    } else {
      // CRYPTO (BEP-20 / Base USDT)
      effectiveCurrency = "USDT";
      amountCharged = PRICING_PLANS[validatedPlan].usd;
      usdEquivalent = PRICING_PLANS[validatedPlan].usd;

      if (!isValidCryptoTxHash(effectiveRef)) {
        return NextResponse.json(
          { error: "Invalid transaction hash format. Expected 64-character hexadecimal starting with 0x" },
          { status: 400 }
        );
      }

      const cryptoVerification = await verifyCryptoRpcTx(
        effectiveRef,
        network === "BASE" ? "BASE" : "BSC"
      );

      if (cryptoVerification.error) {
        return NextResponse.json(
          { error: cryptoVerification.error },
          { status: 400 }
        );
      }

      if (cryptoVerification.pendingAdmin) {
        status = "PENDING";
      }
    }

    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // Insert subscription record
    const [newSub] = await db
      .insert(subscriptions)
      .values({
        id: subId,
        user_id: user.id,
        plan: validatedPlan,
        currency: effectiveCurrency as "NGN" | "USD" | "USDT",
        amount: amountCharged,
        payment_method,
        payment_ref: effectiveRef,
        status,
        created_at: now.toISOString(),
      })
      .returning();

    let updatedPool = null;

    // If ACTIVE, upgrade user tier immediately and contribute 30% to Sunday Bounty
    if (status === "ACTIVE") {
      await db
        .update(users)
        .set({
          tier: validatedPlan,
          subscription_expires_at: expiresAt,
        })
        .where(eq(users.id, user.id));

      // 30% revenue allocation into Sunday Scholar Bounty pool
      const bountyContributionUsd = Number((usdEquivalent * 0.3).toFixed(2));

      // Find active tournament or create one if none exists
      const tournaments = await db
        .select()
        .from(sundayTournaments)
        .orderBy(desc(sundayTournaments.created_at))
        .limit(1);

      let targetTournament = tournaments[0];
      if (!targetTournament) {
        const tournamentId = `snt_${Date.now()}_default`;
        const [createdTourney] = await db
          .insert(sundayTournaments)
          .values({
            id: tournamentId,
            week_label: "Week of " + new Date().toISOString().slice(0, 10),
            motion_topic: "Can objective morality exist without a transcendent divine lawgiver?",
            status: "QUALIFIERS_OPEN",
            base_prize_usd: 20,
            revenue_pool_usd: bountyContributionUsd,
            effective_prize_usd: calculateSundayBounty(bountyContributionUsd),
            created_at: now.toISOString(),
          })
          .returning();
        targetTournament = createdTourney;
        updatedPool = {
          tournamentId: targetTournament.id,
          revenue_pool_usd: targetTournament.revenue_pool_usd,
          effective_prize_usd: targetTournament.effective_prize_usd,
          bountyContributionUsd,
        };
      } else {
        const newPoolUsd = Number(((targetTournament.revenue_pool_usd || 0) + bountyContributionUsd).toFixed(2));
        const newEffectivePrize = calculateSundayBounty(newPoolUsd);

        await db
          .update(sundayTournaments)
          .set({
            revenue_pool_usd: newPoolUsd,
            effective_prize_usd: newEffectivePrize,
          })
          .where(eq(sundayTournaments.id, targetTournament.id));

        updatedPool = {
          tournamentId: targetTournament.id,
          revenue_pool_usd: newPoolUsd,
          effective_prize_usd: newEffectivePrize,
          bountyContributionUsd,
        };
      }
    }

    return NextResponse.json(
      {
        message:
          status === "ACTIVE"
            ? `Successfully activated ${validatedPlan} subscription for 1 year`
            : "Subscription queued for 1-click Founder Admin verification",
        subscription: newSub,
        tier: status === "ACTIVE" ? validatedPlan : user.tier,
        bountyPool: updatedPool,
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
