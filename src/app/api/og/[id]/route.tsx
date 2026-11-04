import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { debates } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await ensureTablesExist();
    const { id } = await params;

    const debateList = await db
      .select()
      .from(debates)
      .where(eq(debates.id, id))
      .limit(1);

    const debate =
      debateList.length > 0
        ? debateList[0]
        : {
            id,
            topic: "The Great Theological & Philosophical Disputation",
            category: "Philosophy & Theology",
            mode: "PVE",
            pro_name: "Proponent Scholar",
            con_name: "Opponent Thinker",
            pro_hp: 85,
            con_hp: 40,
            pro_clash_points: 35,
            con_clash_points: 15,
            pro_integrity: 98,
            winner: "PRO",
            status: "COMPLETED",
          };

    const isCompleted = debate.status === "COMPLETED";
    const winnerName =
      debate.winner === "PRO"
        ? debate.pro_name
        : debate.winner === "CON"
        ? debate.con_name || "Challenger"
        : null;

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: "#020617", // slate-950
            backgroundImage:
              "radial-gradient(circle at 50% 0%, rgba(245, 158, 11, 0.15) 0%, transparent 60%), radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)",
            padding: "48px 56px",
            fontFamily: "sans-serif",
            color: "#f8fafc",
            border: "12px solid #0f172a",
            boxSizing: "border-box",
          }}
        >
          {/* Top Brand & Integrity Badge Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(245, 158, 11, 0.2)",
                  border: "1px solid rgba(245, 158, 11, 0.5)",
                  color: "#fbbf24",
                  fontSize: "22px",
                  fontWeight: 900,
                }}
              >
                ⚖️
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: 900,
                    letterSpacing: "-0.5px",
                    color: "#f8fafc",
                  }}
                >
                  LOGOS<span style={{ color: "#fbbf24" }}>ARENA</span>
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "#94a3b8",
                    fontWeight: 700,
                  }}
                >
                  Intellectual Colosseum VAR Scorecard
                </span>
              </div>
            </div>

            {/* Human Integrity % Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                padding: "8px 18px",
                borderRadius: "9999px",
              }}
            >
              <span style={{ fontSize: "14px" }}>🛡️</span>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#34d399" }}>
                Human Integrity: {debate.pro_integrity || 100}% Verified
              </span>
            </div>
          </div>

          {/* Center Motion Topic & Winner Callout */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              margin: "24px 0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: "#fbbf24",
                  backgroundColor: "rgba(245, 158, 11, 0.15)",
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                {debate.category || "Theology & Philosophy"} • {debate.mode}
              </span>
              {isCompleted && winnerName && (
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    color: "#020617",
                    backgroundColor: "#fbbf24",
                    padding: "4px 12px",
                    borderRadius: "6px",
                  }}
                >
                  🏆 Winner: {winnerName}
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: "34px",
                fontWeight: 900,
                lineHeight: "1.25",
                color: "#f1f5f9",
                maxHeight: "130px",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              &ldquo;{debate.topic}&rdquo;
            </div>
          </div>

          {/* Bottom Pro vs Con Arena Scoreboard Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              border: "1px solid #334155",
              borderRadius: "20px",
              padding: "24px 32px",
              gap: "36px",
            }}
          >
            {/* Pro Debater */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "#34d399" }}>
                  PRO: {debate.pro_name}
                </span>
                <span style={{ fontSize: "18px", fontWeight: 900, color: "#34d399", fontFamily: "monospace" }}>
                  {debate.pro_hp} HP
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "10px",
                  backgroundColor: "#020617",
                  borderRadius: "9999px",
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, debate.pro_hp))}%`,
                    height: "100%",
                    backgroundColor: "#34d399",
                    borderRadius: "9999px",
                  }}
                />
              </div>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Clash Score: +{debate.pro_clash_points} pts
              </span>
            </div>

            {/* Colosseum VS Medallion */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "#020617",
                border: "2px solid #fbbf24",
                color: "#fbbf24",
                fontSize: "14px",
                fontWeight: 900,
              }}
            >
              VS
            </div>

            {/* Con Debater */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "#fbbf24" }}>
                  CON: {debate.con_name || "Awaiting Challenger"}
                </span>
                <span style={{ fontSize: "18px", fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>
                  {debate.con_hp} HP
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "10px",
                  backgroundColor: "#020617",
                  borderRadius: "9999px",
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, debate.con_hp))}%`,
                    height: "100%",
                    backgroundColor: "#fbbf24",
                    borderRadius: "9999px",
                  }}
                />
              </div>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Clash Score: +{debate.con_clash_points} pts
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error creating OG card";
    return new Response(`Failed to generate image: ${message}`, { status: 500 });
  }
}
