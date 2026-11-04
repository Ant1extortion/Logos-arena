import { describe, it, expect } from "vitest";
import {
  getNextDebateState,
  canUserDebate,
  canUserScan,
  hasPreFlightVarAccess,
  calculateSundayBounty,
  TIER_LIMITS,
  DebateState,
} from "../debate-state";

describe("Debate State Machine", () => {
  it("progresses correctly through 3 rounds (6 turns) to COMPLETED", () => {
    let state: DebateState = {
      currentRound: 1,
      currentTurn: "PRO",
      status: "OPEN_CHALLENGE",
    };

    // Round 1 PRO -> Round 1 CON
    state = getNextDebateState(state);
    expect(state).toEqual({
      currentRound: 1,
      currentTurn: "CON",
      status: "IN_PROGRESS",
    });

    // Round 1 CON -> Round 2 PRO
    state = getNextDebateState(state);
    expect(state).toEqual({
      currentRound: 2,
      currentTurn: "PRO",
      status: "IN_PROGRESS",
    });

    // Round 2 PRO -> Round 2 CON
    state = getNextDebateState(state);
    expect(state).toEqual({
      currentRound: 2,
      currentTurn: "CON",
      status: "IN_PROGRESS",
    });

    // Round 2 CON -> Round 3 PRO
    state = getNextDebateState(state);
    expect(state).toEqual({
      currentRound: 3,
      currentTurn: "PRO",
      status: "IN_PROGRESS",
    });

    // Round 3 PRO -> Round 3 CON
    state = getNextDebateState(state);
    expect(state).toEqual({
      currentRound: 3,
      currentTurn: "CON",
      status: "IN_PROGRESS",
    });

    // Round 3 CON -> COMPLETED
    state = getNextDebateState(state);
    expect(state).toEqual({
      currentRound: 3,
      currentTurn: "CON",
      status: "COMPLETED",
    });

    // Idempotent when already COMPLETED
    const afterCompleted = getNextDebateState(state);
    expect(afterCompleted).toEqual(state);
  });
});

describe("Tier Quota Limits and Feature Access", () => {
  it("defines the correct quotas per tier", () => {
    expect(TIER_LIMITS.FREE).toEqual({
      debatesPerMonth: 3,
      studioScansPerMonth: 1,
      hasPreFlightVar: false,
    });
    expect(TIER_LIMITS.PRO).toEqual({
      debatesPerMonth: 30,
      studioScansPerMonth: 10,
      hasPreFlightVar: false,
    });
    expect(TIER_LIMITS.PREMIUM).toEqual({
      debatesPerMonth: 100,
      studioScansPerMonth: 50,
      hasPreFlightVar: true,
    });
  });

  describe("canUserDebate", () => {
    it("handles FREE tier quota correctly (limit 3)", () => {
      expect(canUserDebate("FREE", 0)).toBe(true);
      expect(canUserDebate("FREE", 2)).toBe(true);
      expect(canUserDebate("FREE", 3)).toBe(false);
      expect(canUserDebate("FREE", 5)).toBe(false);
    });

    it("handles PRO tier quota correctly (limit 30)", () => {
      expect(canUserDebate("PRO", 29)).toBe(true);
      expect(canUserDebate("PRO", 30)).toBe(false);
    });

    it("handles PREMIUM tier quota correctly (limit 100)", () => {
      expect(canUserDebate("PREMIUM", 99)).toBe(true);
      expect(canUserDebate("PREMIUM", 100)).toBe(false);
    });
  });

  describe("canUserScan", () => {
    it("handles FREE tier quota correctly (limit 1)", () => {
      expect(canUserScan("FREE", 0)).toBe(true);
      expect(canUserScan("FREE", 1)).toBe(false);
    });

    it("handles PRO tier quota correctly (limit 10)", () => {
      expect(canUserScan("PRO", 9)).toBe(true);
      expect(canUserScan("PRO", 10)).toBe(false);
    });

    it("handles PREMIUM tier quota correctly (limit 50)", () => {
      expect(canUserScan("PREMIUM", 49)).toBe(true);
      expect(canUserScan("PREMIUM", 50)).toBe(false);
    });
  });

  describe("hasPreFlightVarAccess", () => {
    it("grants Pre-Flight VAR check only to PREMIUM users", () => {
      expect(hasPreFlightVarAccess("FREE")).toBe(false);
      expect(hasPreFlightVarAccess("PRO")).toBe(false);
      expect(hasPreFlightVarAccess("PREMIUM")).toBe(true);
    });
  });
});

describe("Sunday Scholar Bounty Calculation", () => {
  it("defaults to $20 when revenue pool is 0 or negative", () => {
    expect(calculateSundayBounty(0)).toBe(20);
    expect(calculateSundayBounty(-10)).toBe(20);
  });

  it("scales dynamically with revenue pool added to base $20", () => {
    expect(calculateSundayBounty(15)).toBe(35);
    expect(calculateSundayBounty(50)).toBe(70);
    expect(calculateSundayBounty(80)).toBe(100);
  });

  it("caps bounty at $100 even if revenue pool is higher", () => {
    expect(calculateSundayBounty(100)).toBe(100);
    expect(calculateSundayBounty(500)).toBe(100);
  });
});
