import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ensureTablesExist } from "@/db/init";
import { db } from "@/db";
import { users, debates, turns } from "@/db/schema";
import { POST as authPost, GET as authGet } from "@/app/api/auth/route";
import { POST as debatesPost } from "@/app/api/debates/route";
import { PATCH as debateIdPatch } from "@/app/api/debates/[id]/route";
import { POST as steelmanPost } from "@/app/api/debates/[id]/steelman/route";
import { POST as turnPost } from "@/app/api/debates/[id]/turn/route";
import { POST as blitzPost } from "@/app/api/debates/[id]/blitz/route";

function createJsonRequest(url: string, method: string, body?: unknown, token?: string, headers: Record<string, string> = {}): NextRequest {
  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...headers,
  };
  if (token) {
    reqHeaders["authorization"] = `Bearer ${token}`;
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Next.js API Routes Integration Tests", () => {
  beforeEach(async () => {
    await ensureTablesExist();
    // Clean up test tables
    await db.delete(turns);
    await db.delete(debates);
    await db.delete(users);
  });

  describe("1. Database Auto-Initialization", () => {
    it("ensures tables exist without errors", async () => {
      await expect(ensureTablesExist()).resolves.toBeUndefined();
    });
  });

  describe("2. Auth API (/api/auth)", () => {
    it("signs up a new user and returns session token", async () => {
      const req = createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "debater1@logos.arena",
        display_name: "Debater One",
        passcode: "securePass123",
        device_hash: "dev_hash_1",
      });

      const res = await authPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe("debater1@logos.arena");
      expect(data.user.tier).toBe("FREE");
      expect(data.sessionToken).toBeDefined();
    });

    it("logs in and invalidates old concurrent session tokens", async () => {
      // 1. Signup
      const signupReq = createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "debater2@logos.arena",
        display_name: "Debater Two",
        passcode: "securePass456",
        device_hash: "dev_hash_laptop",
      });
      const signupRes = await authPost(signupReq);
      const signupData = await signupRes.json();
      const firstSessionToken = signupData.sessionToken;

      // Verify first session is valid
      const getReq1 = createJsonRequest("http://localhost:3000/api/auth", "GET", undefined, firstSessionToken);
      const getRes1 = await authGet(getReq1);
      expect(getRes1.status).toBe(200);

      // 2. Login on second device (e.g. phone)
      const loginReq = createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "login",
        email: "debater2@logos.arena",
        passcode: "securePass456",
        device_hash: "dev_hash_phone",
      });
      const loginRes = await authPost(loginReq);
      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      const secondSessionToken = loginData.sessionToken;
      expect(secondSessionToken).not.toBe(firstSessionToken);

      // 3. Verify old session token is now invalid (401)
      const getReqOld = createJsonRequest("http://localhost:3000/api/auth", "GET", undefined, firstSessionToken);
      const getResOld = await authGet(getReqOld);
      expect(getResOld.status).toBe(401);

      // Verify new session token works
      const getReqNew = createJsonRequest("http://localhost:3000/api/auth", "GET", undefined, secondSessionToken);
      const getResNew = await authGet(getReqNew);
      expect(getResNew.status).toBe(200);
    });
  });

  describe("3. Debates Creation & Quota Enforcement (/api/debates)", () => {
    it("creates a PVE debate and enforces monthly FREE quota (3 debates)", async () => {
      // Create user
      const signupReq = createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "freeuser@logos.arena",
        display_name: "Free Debater",
        passcode: "pass123",
        device_hash: "dev_quota_1",
      });
      const signupRes = await authPost(signupReq);
      const { sessionToken } = await signupRes.json();

      // Create 3 debates (allowed under FREE tier)
      for (let i = 1; i <= 3; i++) {
        const createReq = createJsonRequest("http://localhost:3000/api/debates", "POST", {
          topic: `Motion ${i}: Free Will and Determinism`,
          category: "Metaphysics",
          mode: "PVE",
          ai_persona: "aquinas",
          device_hash: "dev_quota_1",
        }, sessionToken);

        const res = await debatesPost(createReq);
        expect(res.status).toBe(201);
      }

      // 4th debate should be rejected (403 Quota exceeded)
      const excessReq = createJsonRequest("http://localhost:3000/api/debates", "POST", {
        topic: "Motion 4: Divine Simplicity",
        category: "Theology",
        mode: "PVE",
        ai_persona: "aquinas",
        device_hash: "dev_quota_1",
      }, sessionToken);

      const excessRes = await debatesPost(excessReq);
      expect(excessRes.status).toBe(403);
      const excessData = await excessRes.json();
      expect(excessData.quotaExceeded).toBe(true);
    });

    it("enforces device_hash quota to prevent multi-account smurfing on free tier", async () => {
      // User 1 uses 3 debates on dev_shared
      const signup1 = await authPost(createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "smurf1@logos.arena",
        display_name: "Smurf One",
        passcode: "pass123",
        device_hash: "dev_shared",
      }));
      const { sessionToken: token1 } = await signup1.json();

      for (let i = 0; i < 3; i++) {
        await debatesPost(createJsonRequest("http://localhost:3000/api/debates", "POST", {
          topic: `Smurf Topic ${i}`,
          mode: "PVE",
          device_hash: "dev_shared",
        }, token1));
      }

      // User 2 signs up with a different email but the same device_hash
      const signup2 = await authPost(createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "smurf2@logos.arena",
        display_name: "Smurf Two",
        passcode: "pass123",
        device_hash: "dev_shared",
      }));
      const { sessionToken: token2 } = await signup2.json();

      // User 2 tries to create debate on the same device
      const smurfDebateRes = await debatesPost(createJsonRequest("http://localhost:3000/api/debates", "POST", {
        topic: "Smurf Attempt Debate",
        mode: "PVE",
        device_hash: "dev_shared",
      }, token2));

      expect(smurfDebateRes.status).toBe(403);
      const err = await smurfDebateRes.json();
      expect(err.error).toContain("device");
    });
  });

  describe("4. PVP Challenges & Collusion Detection (/api/debates/[id])", () => {
    it("detects self-play collusion when joining PVP challenge from same device/user", async () => {
      // User creates PVP debate
      const signup = await authPost(createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "pvp_creator@logos.arena",
        display_name: "PVP Creator",
        passcode: "pass123",
        device_hash: "dev_collusion_hash",
      }));
      const { sessionToken } = await signup.json();

      const createRes = await debatesPost(createJsonRequest("http://localhost:3000/api/debates", "POST", {
        topic: "Does Consciousness Require a Ground?",
        category: "Philosophy of Mind",
        mode: "PVP",
        device_hash: "dev_collusion_hash",
      }, sessionToken));
      const { debate } = await createRes.json();
      expect(debate.status).toBe("OPEN_CHALLENGE");

      // Creator tries to join own debate
      const joinReq = createJsonRequest(`http://localhost:3000/api/debates/${debate.id}`, "PATCH", {
        device_hash: "dev_collusion_hash",
      }, sessionToken);

      const joinRes = await debateIdPatch(joinReq, { params: Promise.resolve({ id: debate.id }) });
      expect(joinRes.status).toBe(200);
      const joinData = await joinRes.json();
      expect(joinData.collusionDetected).toBe(true);
      expect(joinData.debate.is_ranked).toBe(0);
      expect(joinData.debate.collusion_flag).toBe("SELF_PLAY_DETECTED");
      expect(joinData.debate.status).toBe("IN_PROGRESS");
    });
  });

  describe("5. Steelman Summary Endpoint (/api/debates/[id]/steelman)", () => {
    it("validates steelman summaries rejecting high verbatim overlap", async () => {
      const signup = await authPost(createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "steelman_tester@logos.arena",
        display_name: "Steelman Tester",
        passcode: "pass123",
      }));
      const { sessionToken } = await signup.json();

      const createRes = await debatesPost(createJsonRequest("http://localhost:3000/api/debates", "POST", {
        topic: "Moral Realism",
        mode: "PVE",
      }, sessionToken));
      const { debate } = await createRes.json();

      const opponentArg = "The cosmological argument establishes that every contingent entity necessitates an unconditioned sustaining prime cause.";

      // 1. Verbatim copy should fail
      const badReq = createJsonRequest(`http://localhost:3000/api/debates/${debate.id}/steelman`, "POST", {
        opponentArgument: opponentArg,
        steelmanSummary: opponentArg,
      }, sessionToken);
      const badRes = await steelmanPost(badReq, { params: Promise.resolve({ id: debate.id }) });
      const badData = await badRes.json();
      expect(badData.valid).toBe(false);

      // 2. Charitable rephrasing should pass
      const goodReq = createJsonRequest(`http://localhost:3000/api/debates/${debate.id}/steelman`, "POST", {
        opponentArgument: opponentArg,
        steelmanSummary: "My interlocutor argues that contingent beings cannot explain their existence, requiring an ultimate foundation.",
      }, sessionToken);
      const goodRes = await steelmanPost(goodReq, { params: Promise.resolve({ id: debate.id }) });
      const goodData = await goodRes.json();
      expect(goodData.valid).toBe(true);
    });
  });

  describe("6. Anti-Cheat Turn & Blitz Mechanics (/api/debates/[id]/turn & blitz)", () => {
    it("triggers BLITZ_REQUIRED when integrityScore < 75 or mode is SUNDAY_BOUNTY", async () => {
      const signup = await authPost(createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "bounty_hunter@logos.arena",
        display_name: "Bounty Hunter",
        passcode: "pass123",
      }));
      const { sessionToken } = await signup.json();

      // Create SUNDAY_BOUNTY debate
      const createRes = await debatesPost(createJsonRequest("http://localhost:3000/api/debates", "POST", {
        topic: "Sunday Scholar Trophy Motion",
        mode: "SUNDAY_BOUNTY",
        ai_persona: "sunday_grandmaster",
      }, sessionToken));
      const { debate } = await createRes.json();

      // Submit turn - in SUNDAY_BOUNTY mode, Blitz is ALWAYS required
      const turnReq = createJsonRequest(`http://localhost:3000/api/debates/${debate.id}/turn`, "POST", {
        argumentText: "The ontological status of objective moral truths requires a transcendent normative anchor.",
        telemetry: {
          totalKeystrokes: 120,
          backspaceCount: 15,
          cursorJumpCount: 1,
          midSentencePauses: 2,
          sentenceEndPauses: 3,
          tabSwitches: 0,
          secondsAwayFromTab: 0,
        },
      }, sessionToken);

      const turnRes = await turnPost(turnReq, { params: Promise.resolve({ id: debate.id }) });
      expect(turnRes.status).toBe(200);
      const turnData = await turnRes.json();
      expect(turnData.status).toBe("BLITZ_REQUIRED");
      expect(turnData.blitzQuestion).toBeDefined();
      expect(turnData.timeLimitSeconds).toBe(25);
      expect(turnData.turnId).toBeDefined();

      // Now answer the blitz cross-examination promptly (< 28s)
      const blitzReq = createJsonRequest(`http://localhost:3000/api/debates/${debate.id}/blitz`, "POST", {
        turnId: turnData.turnId,
        blitzAnswer: "The normative anchor avoids incoherence by defining the transcendent good as intrinsically non-contingent.",
        elapsedSeconds: 11.5,
      }, sessionToken);

      const blitzRes = await blitzPost(blitzReq, { params: Promise.resolve({ id: debate.id }) });
      expect(blitzRes.status).toBe(200);
      const blitzResult = await blitzRes.json();
      expect(blitzResult.passed).toBe(true);
      expect(blitzResult.aiTurn).toBeDefined(); // Auto-generated AI Persona counter-turn!
    });

    it("penalizes 25 Logic HP and flags BLITZ_FAILED when blitz timer expires (> 28s)", async () => {
      const signup = await authPost(createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "slow_debater@logos.arena",
        display_name: "Slow Debater",
        passcode: "pass123",
      }));
      const { sessionToken } = await signup.json();

      // Create regular PVE debate with high paste attempts to trigger Blitz (integrity < 75)
      const createRes = await debatesPost(createJsonRequest("http://localhost:3000/api/debates", "POST", {
        topic: "Epistemology",
        mode: "PVE",
        ai_persona: "aquinas",
      }, sessionToken));
      const { debate } = await createRes.json();

      const turnReq = createJsonRequest(`http://localhost:3000/api/debates/${debate.id}/turn`, "POST", {
        argumentText: "Knowledge is justified true belief without Gettier counter-examples.",
        telemetry: {
          totalKeystrokes: 100,
          pasteAttempts: 2, // -40 integrity -> score = 60 (< 75 -> blitz triggered)
          tabSwitches: 1,
          backspaceCount: 5,
          cursorJumpCount: 0,
          midSentencePauses: 0,
          sentenceEndPauses: 0,
          secondsAwayFromTab: 0,
        },
      }, sessionToken);

      const turnRes = await turnPost(turnReq, { params: Promise.resolve({ id: debate.id }) });
      const turnData = await turnRes.json();
      expect(turnData.status).toBe("BLITZ_REQUIRED");

      // Submit after 30 seconds (> 28s limit)
      const blitzReq = createJsonRequest(`http://localhost:3000/api/debates/${debate.id}/blitz`, "POST", {
        turnId: turnData.turnId,
        blitzAnswer: "I took too long to formulate this answer.",
        elapsedSeconds: 30.5,
      }, sessionToken);

      const blitzRes = await blitzPost(blitzReq, { params: Promise.resolve({ id: debate.id }) });
      expect(blitzRes.status).toBe(200);
      const blitzResult = await blitzRes.json();
      expect(blitzResult.passed).toBe(false);
      expect(blitzResult.hpPenalty).toBe(25);
      expect(blitzResult.turn.integrity_flags).toContain("BLITZ_FAILED");
    });

    it("processes a clean PVE turn without Blitz directly, generating AI counter-reply", async () => {
      const signup = await authPost(createJsonRequest("http://localhost:3000/api/auth", "POST", {
        action: "signup",
        email: "clean_debater@logos.arena",
        display_name: "Clean Debater",
        passcode: "pass123",
      }));
      const { sessionToken } = await signup.json();

      const createRes = await debatesPost(createJsonRequest("http://localhost:3000/api/debates", "POST", {
        topic: "Teleological Argument",
        mode: "PVE",
        ai_persona: "aquinas",
      }, sessionToken));
      const { debate } = await createRes.json();

      const turnReq = createJsonRequest(`http://localhost:3000/api/debates/${debate.id}/turn`, "POST", {
        argumentText: "The fine-tuning of initial cosmological constants provides inductive evidence for an intelligent designer.",
        telemetry: {
          totalKeystrokes: 150,
          backspaceCount: 12,
          editRatio: 0.08,
          cursorJumpCount: 1,
          midSentencePauses: 2,
          sentenceEndPauses: 3,
          tabSwitches: 0,
          secondsAwayFromTab: 0,
        },
      }, sessionToken);

      const turnRes = await turnPost(turnReq, { params: Promise.resolve({ id: debate.id }) });
      expect(turnRes.status).toBe(200);
      const turnData = await turnRes.json();
      expect(turnData.status).toBe("COMPLETED_TURN");
      expect(turnData.aiTurn).toBeDefined();
      expect(turnData.aiTurn.author_name).toBe("aquinas");
      expect(turnData.debate.current_round).toBe(2);
      expect(turnData.debate.current_turn).toBe("PRO");
    });
  });
});
