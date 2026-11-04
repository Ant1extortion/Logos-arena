import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { debates, turns, users } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  verifyBlitzAnswer,
  generatePersonaReply,
  judgeTurn,
  generateFinalAutopsy,
} from "@/lib/ai-referee";
import { getNextDebateState } from "@/lib/debate-state";

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
        { error: "Authentication required to submit Blitz response" },
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

    const body = await req.json();
    const { turnId, blitzAnswer, elapsedSeconds = 0 } = body;

    if (!turnId) {
      return NextResponse.json(
        { error: "turnId is required" },
        { status: 400 }
      );
    }

    // Find the pending turn
    const turnList = await db
      .select()
      .from(turns)
      .where(eq(turns.id, turnId))
      .limit(1);

    if (turnList.length === 0) {
      return NextResponse.json(
        { error: "Turn not found" },
        { status: 404 }
      );
    }

    const turn = turnList[0];

    if (turn.debate_id !== id) {
      return NextResponse.json(
        { error: "Turn does not match this debate" },
        { status: 400 }
      );
    }

    if (turn.blitz_passed !== null && turn.blitz_passed !== undefined) {
      return NextResponse.json(
        { error: "Blitz response has already been submitted for this turn" },
        { status: 400 }
      );
    }

    // Verify 25-second Blitz answer
    const blitzVerification = await verifyBlitzAnswer(
      turn.argument_text,
      turn.blitz_question || "",
      blitzAnswer || "",
      Number(elapsedSeconds)
    );

    const passed = blitzVerification.passed;
    const blitzPassedValue = passed ? 1 : 0;

    // Per user instructions: "if failed or expired, docks 25 Logic HP and flags the turn BLITZ_FAILED"
    const blitzHpPenalty = passed ? 0 : 25;
    const additionalHpDeducted = blitzHpPenalty;
    const updatedHpDeducted = turn.hp_deducted + additionalHpDeducted;

    // Update integrity flags if failed
    let integrityFlagsList: string[] = [];
    if (turn.integrity_flags) {
      try {
        integrityFlagsList = JSON.parse(turn.integrity_flags);
      } catch {
        integrityFlagsList = [turn.integrity_flags];
      }
    }
    if (!passed) {
      integrityFlagsList.push("BLITZ_FAILED");
    }

    // Update turn record
    const [updatedTurn] = await db
      .update(turns)
      .set({
        blitz_answer: blitzAnswer || null,
        blitz_passed: blitzPassedValue,
        hp_deducted: updatedHpDeducted,
        integrity_flags: JSON.stringify(integrityFlagsList),
      })
      .where(eq(turns.id, turnId))
      .returning();

    // Now finalize turn and advance debate state
    const currentSide = turn.side;
    let newProHp = debate.pro_hp;
    let newConHp = debate.con_hp;
    let newProClash = debate.pro_clash_points;
    let newConClash = debate.con_clash_points;

    if (currentSide === "PRO") {
      newProHp = Math.max(0, newProHp - updatedHpDeducted);
      newProClash += turn.clash_awarded;
    } else {
      newConHp = Math.max(0, newConHp - updatedHpDeducted);
      newConClash += turn.clash_awarded;
    }

    // Transition state
    const nextState = getNextDebateState({
      currentRound: debate.current_round,
      currentTurn: debate.current_turn,
      status: debate.status,
    });

    let isCompleted = nextState.status === "COMPLETED" || newProHp <= 0 || newConHp <= 0;
    let finalWinner = debate.winner;
    let finalAutopsyJson = debate.final_autopsy_json;

    if (newProHp <= 0 && newConHp > 0) {
      isCompleted = true;
      finalWinner = "CON";
    } else if (newConHp <= 0 && newProHp > 0) {
      isCompleted = true;
      finalWinner = "PRO";
    }

    const updatedDebateRecord = {
      ...debate,
      pro_hp: newProHp,
      con_hp: newConHp,
      pro_clash_points: newProClash,
      con_clash_points: newConClash,
      current_round: nextState.currentRound,
      current_turn: nextState.currentTurn,
      status: (isCompleted ? "COMPLETED" : nextState.status) as "OPEN_CHALLENGE" | "IN_PROGRESS" | "COMPLETED",
      winner: finalWinner,
      final_autopsy_json: finalAutopsyJson,
    };

    let aiTurnRecord = null;

    // Retrieve all turns up to now for context
    const existingTurns = await db
      .select()
      .from(turns)
      .where(eq(turns.debate_id, id))
      .orderBy(asc(turns.created_at));

    // If mode is PVE or SUNDAY_BOUNTY and debate is not completed, auto-generate AI Persona counter-turn!
    if (
      !isCompleted &&
      (debate.mode === "PVE" || debate.mode === "SUNDAY_BOUNTY") &&
      nextState.currentTurn === "CON"
    ) {
      const personaId = debate.ai_persona || "aquinas";
      const personaReply = await generatePersonaReply({
        personaId,
        motionTopic: debate.topic,
        currentSide: "CON",
        roundNumber: nextState.currentRound,
        opponentArgument: turn.argument_text,
        debateHistory: existingTurns,
      });

      const aiRefereeEval = await judgeTurn({
        motionTopic: debate.topic,
        currentSide: "CON",
        authorName: debate.con_name || personaId,
        argumentText: personaReply.argumentText,
        opponentLastArgument: turn.argument_text,
        steelmanSummary: personaReply.steelmanSummary,
      });

      const aiTurnId = `turn_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const aiTurnNow = new Date().toISOString();

      const [insertedAiTurn] = await db
        .insert(turns)
        .values({
          id: aiTurnId,
          debate_id: id,
          round_number: nextState.currentRound,
          side: "CON",
          author_name: debate.con_name || personaId,
          steelman_summary: personaReply.steelmanSummary,
          argument_text: personaReply.argumentText,
          referee_json: JSON.stringify(aiRefereeEval),
          hp_deducted: aiRefereeEval.hpDeducted,
          clash_awarded: aiRefereeEval.clashAwarded,
          telemetry_json: JSON.stringify({ mode: debate.mode, totalKeystrokes: 500, editRatio: 0.1 }),
          integrity_score: 100,
          integrity_flags: null,
          blitz_required: 0,
          blitz_question: null,
          blitz_answer: null,
          blitz_passed: 1,
          created_at: aiTurnNow,
        })
        .returning();

      aiTurnRecord = insertedAiTurn;

      newConHp = Math.max(0, newConHp - aiRefereeEval.hpDeducted);
      newConClash += aiRefereeEval.clashAwarded;

      const postAiState = getNextDebateState({
        currentRound: nextState.currentRound,
        currentTurn: "CON",
        status: "IN_PROGRESS",
      });

      if (postAiState.status === "COMPLETED" || newProHp <= 0 || newConHp <= 0) {
        isCompleted = true;
      }

      updatedDebateRecord.current_round = postAiState.currentRound;
      updatedDebateRecord.current_turn = postAiState.currentTurn;
      updatedDebateRecord.con_hp = newConHp;
      updatedDebateRecord.con_clash_points = newConClash;
      updatedDebateRecord.status = (isCompleted ? "COMPLETED" : postAiState.status) as "OPEN_CHALLENGE" | "IN_PROGRESS" | "COMPLETED";
    }

    // If debate is completed, compute final autopsy and winner
    if (isCompleted) {
      const allTurns = [
        ...existingTurns.filter((t) => t.id !== updatedTurn.id),
        updatedTurn,
        ...(aiTurnRecord ? [aiTurnRecord] : []),
      ];

      const autopsy = await generateFinalAutopsy(
        updatedDebateRecord,
        allTurns
      );

      finalWinner = autopsy.winner;
      finalAutopsyJson = JSON.stringify(autopsy);
      updatedDebateRecord.winner = finalWinner;
      updatedDebateRecord.final_autopsy_json = finalAutopsyJson;

      if (debate.is_ranked === 1) {
        if (finalWinner === "PRO" && debate.pro_user_id) {
          await db
            .update(users)
            .set({ verified_wins: user.verified_wins + 1 })
            .where(eq(users.id, debate.pro_user_id));
        } else if (finalWinner === "CON" && debate.con_user_id && debate.mode === "PVP") {
          const [conUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, debate.con_user_id));
          if (conUser) {
            await db
              .update(users)
              .set({ verified_wins: conUser.verified_wins + 1 })
              .where(eq(users.id, conUser.id));
          }
        }
      }
    }

    // Save final debate updates
    await db
      .update(debates)
      .set({
        pro_hp: updatedDebateRecord.pro_hp,
        con_hp: updatedDebateRecord.con_hp,
        pro_clash_points: updatedDebateRecord.pro_clash_points,
        con_clash_points: updatedDebateRecord.con_clash_points,
        current_round: updatedDebateRecord.current_round,
        current_turn: updatedDebateRecord.current_turn,
        status: updatedDebateRecord.status,
        winner: updatedDebateRecord.winner,
        final_autopsy_json: updatedDebateRecord.final_autopsy_json,
      })
      .where(eq(debates.id, id));

    return NextResponse.json(
      {
        status: "BLITZ_EVALUATED",
        passed,
        reason: blitzVerification.reason,
        hpPenalty: blitzHpPenalty,
        turn: updatedTurn,
        aiTurn: aiTurnRecord,
        debate: updatedDebateRecord,
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
