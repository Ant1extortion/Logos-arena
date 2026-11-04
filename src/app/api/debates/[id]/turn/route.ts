import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { debates, turns, users } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { getAuthenticatedUser } from "@/lib/auth";
import { evaluateKeystrokeTelemetry, TelemetryPayload } from "@/lib/anti-cheat";
import {
  judgeTurn,
  generateBlitzQuestion,
  generatePersonaReply,
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
        { error: "Authentication required to submit turn" },
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

    if (debate.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: `Debate is not in progress (current status: ${debate.status})` },
        { status: 400 }
      );
    }

    // Determine expected side and debater
    const expectedSide = debate.current_turn; // 'PRO' | 'CON'
    const expectedUserId =
      expectedSide === "PRO" ? debate.pro_user_id : debate.con_user_id;

    if (user.id !== expectedUserId) {
      return NextResponse.json(
        {
          error: `It is not your turn. Current turn belongs to ${expectedSide} (${
            expectedSide === "PRO" ? debate.pro_name : debate.con_name
          })`,
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      argumentText,
      steelmanSummary,
      telemetry,
    }: {
      argumentText: string;
      steelmanSummary?: string;
      telemetry?: Partial<TelemetryPayload>;
    } = body;

    if (!argumentText || typeof argumentText !== "string" || argumentText.trim().length === 0) {
      return NextResponse.json(
        { error: "argumentText is required" },
        { status: 400 }
      );
    }

    // Retrieve previous turns
    const existingTurns = await db
      .select()
      .from(turns)
      .where(eq(turns.debate_id, id))
      .orderBy(asc(turns.created_at));

    const opponentLastTurn =
      existingTurns.length > 0
        ? existingTurns[existingTurns.length - 1]
        : null;

    // 1. Evaluate Keystroke Telemetry
    const telemetryWithMode: TelemetryPayload = {
      totalKeystrokes: telemetry?.totalKeystrokes ?? argumentText.length,
      backspaceCount: telemetry?.backspaceCount ?? 0,
      editRatio: telemetry?.editRatio ?? 0.05,
      cursorJumpCount: telemetry?.cursorJumpCount ?? 0,
      midSentencePauses: telemetry?.midSentencePauses ?? 0,
      sentenceEndPauses: telemetry?.sentenceEndPauses ?? 0,
      tabSwitches: telemetry?.tabSwitches ?? 0,
      secondsAwayFromTab: telemetry?.secondsAwayFromTab ?? 0,
      pasteAttempts: telemetry?.pasteAttempts ?? 0,
      ...telemetry,
      mode: debate.mode,
    };
    const telemetryEval = evaluateKeystrokeTelemetry(
      telemetryWithMode,
      argumentText.length
    );

    // 2. Run judgeTurn() with referee checks
    const refereeEval = await judgeTurn({
      motionTopic: debate.topic,
      currentSide: expectedSide,
      authorName: user.display_name,
      argumentText: argumentText.trim(),
      opponentLastArgument: opponentLastTurn?.argument_text,
      steelmanSummary,
    });

    // Determine if Blitz check is required:
    // Required if telemetryEval.requiresBlitzCheck (always in SUNDAY_BOUNTY or integrityScore < 75)
    const turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    if (telemetryEval.requiresBlitzCheck) {
      const blitzQ = await generateBlitzQuestion(argumentText, debate.topic);

      // Create a pending turn with blitz_required = 1 and blitz_passed = null
      await db.insert(turns).values({
        id: turnId,
        debate_id: id,
        round_number: debate.current_round,
        side: expectedSide,
        author_name: user.display_name,
        steelman_summary: steelmanSummary || null,
        argument_text: argumentText.trim(),
        referee_json: JSON.stringify(refereeEval),
        hp_deducted: refereeEval.hpDeducted,
        clash_awarded: refereeEval.clashAwarded,
        telemetry_json: JSON.stringify(telemetryWithMode),
        integrity_score: telemetryEval.integrityScore,
        integrity_flags: telemetryEval.flags.length > 0 ? JSON.stringify(telemetryEval.flags) : null,
        blitz_required: 1,
        blitz_question: blitzQ.question,
        blitz_answer: null,
        blitz_passed: null,
        created_at: now,
      });

      return NextResponse.json(
        {
          status: "BLITZ_REQUIRED",
          turnId,
          blitzQuestion: blitzQ.question,
          targetedPremise: blitzQ.targetedPremise,
          timeLimitSeconds: 25,
        },
        { status: 200 }
      );
    }

    // 3. Blitz is NOT required - finalize turn immediately
    const [insertedTurn] = await db
      .insert(turns)
      .values({
        id: turnId,
        debate_id: id,
        round_number: debate.current_round,
        side: expectedSide,
        author_name: user.display_name,
        steelman_summary: steelmanSummary || null,
        argument_text: argumentText.trim(),
        referee_json: JSON.stringify(refereeEval),
        hp_deducted: refereeEval.hpDeducted,
        clash_awarded: refereeEval.clashAwarded,
        telemetry_json: JSON.stringify(telemetryWithMode),
        integrity_score: telemetryEval.integrityScore,
        integrity_flags: telemetryEval.flags.length > 0 ? JSON.stringify(telemetryEval.flags) : null,
        blitz_required: 0,
        blitz_question: null,
        blitz_answer: null,
        blitz_passed: 1,
        created_at: now,
      })
      .returning();

    // Update HP and clash points
    let newProHp = debate.pro_hp;
    let newConHp = debate.con_hp;
    let newProClash = debate.pro_clash_points;
    let newConClash = debate.con_clash_points;

    if (expectedSide === "PRO") {
      newProHp = Math.max(0, newProHp - refereeEval.hpDeducted);
      newProClash += refereeEval.clashAwarded;
    } else {
      newConHp = Math.max(0, newConHp - refereeEval.hpDeducted);
      newConClash += refereeEval.clashAwarded;
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

    // Check for knockout
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

    // 4. If mode is PVE or SUNDAY_BOUNTY and debate is not completed, auto-generate AI Persona counter-turn!
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
        opponentArgument: argumentText.trim(),
        debateHistory: [...existingTurns, insertedTurn],
      });

      const aiRefereeEval = await judgeTurn({
        motionTopic: debate.topic,
        currentSide: "CON",
        authorName: debate.con_name || personaId,
        argumentText: personaReply.argumentText,
        opponentLastArgument: argumentText.trim(),
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

    // 5. If debate is completed, compute final autopsy and winner
    if (isCompleted) {
      const allTurns = [
        ...existingTurns,
        insertedTurn,
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

      // Award verified win to user if ranked and won
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
        status: "COMPLETED_TURN",
        turn: insertedTurn,
        aiTurn: aiTurnRecord,
        debate: updatedDebateRecord,
        refereeEvaluation: refereeEval,
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
