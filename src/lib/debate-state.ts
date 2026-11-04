export type SubscriptionTier = "FREE" | "PRO" | "PREMIUM";
export type DebateSide = "PRO" | "CON";
export type DebateStatus = "OPEN_CHALLENGE" | "IN_PROGRESS" | "COMPLETED";

export interface DebateState {
  currentRound: number;
  currentTurn: DebateSide;
  status: DebateStatus;
}

export interface TierQuotaLimits {
  debatesPerMonth: number;
  studioScansPerMonth: number;
  hasPreFlightVar: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierQuotaLimits> = {
  FREE: {
    debatesPerMonth: 3,
    studioScansPerMonth: 1,
    hasPreFlightVar: false,
  },
  PRO: {
    debatesPerMonth: 30,
    studioScansPerMonth: 10,
    hasPreFlightVar: false,
  },
  PREMIUM: {
    debatesPerMonth: 100,
    studioScansPerMonth: 50,
    hasPreFlightVar: true,
  },
};

/**
 * 3-round state machine:
 * Round 1 PRO -> Round 1 CON ->
 * Round 2 PRO -> Round 2 CON ->
 * Round 3 PRO -> Round 3 CON ->
 * COMPLETED
 */
export function getNextDebateState(currentState: DebateState): DebateState {
  if (currentState.status === "COMPLETED") {
    return currentState;
  }

  const { currentRound, currentTurn } = currentState;

  if (currentTurn === "PRO") {
    return {
      currentRound,
      currentTurn: "CON",
      status: "IN_PROGRESS",
    };
  }

  // currentTurn === "CON"
  if (currentRound < 3) {
    return {
      currentRound: currentRound + 1,
      currentTurn: "PRO",
      status: "IN_PROGRESS",
    };
  }

  // After Round 3 CON
  return {
    currentRound: 3,
    currentTurn: "CON",
    status: "COMPLETED",
  };
}

/**
 * Check whether a user can initiate or join a debate based on monthly usage quota.
 */
export function canUserDebate(tier: SubscriptionTier, debatesUsedThisMonth: number): boolean {
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.FREE;
  return debatesUsedThisMonth < limits.debatesPerMonth;
}

/**
 * Check whether a user can run a Sermon/Essay stress-test scan based on monthly usage quota.
 */
export function canUserScan(tier: SubscriptionTier, scansUsedThisMonth: number): boolean {
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.FREE;
  return scansUsedThisMonth < limits.studioScansPerMonth;
}

/**
 * Check whether a user has access to the Pre-Flight VAR check feature.
 */
export function hasPreFlightVarAccess(tier: SubscriptionTier): boolean {
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.FREE;
  return limits.hasPreFlightVar;
}

/**
 * Dynamic Sunday Bounty calculation:
 * Base $20, capped at $100: Math.min(100, Math.max(20, 20 + revenuePoolUsd))
 */
export function calculateSundayBounty(revenuePoolUsd: number): number {
  return Math.min(100, Math.max(20, 20 + revenuePoolUsd));
}
