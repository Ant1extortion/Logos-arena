import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { debates, turns } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkSteelman } from "@/lib/ai-referee";

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
        { error: "Authentication required to validate steelman" },
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
    const { steelmanSummary, opponentArgument } = body;

    if (!steelmanSummary || typeof steelmanSummary !== "string") {
      return NextResponse.json(
        { error: "steelmanSummary is required" },
        { status: 400 }
      );
    }

    let targetOpponentArg = opponentArgument;

    // If opponentArgument was not provided, look up the last turn from the opposing side
    if (!targetOpponentArg) {
      const debateTurns = await db
        .select()
        .from(turns)
        .where(eq(turns.debate_id, id))
        .orderBy(asc(turns.created_at));

      if (debateTurns.length > 0) {
        // Last turn belongs to opponent
        targetOpponentArg = debateTurns[debateTurns.length - 1].argument_text;
      } else {
        targetOpponentArg = debate.topic;
      }
    }

    const evaluation = await checkSteelman(targetOpponentArg, steelmanSummary);

    return NextResponse.json(evaluation, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
