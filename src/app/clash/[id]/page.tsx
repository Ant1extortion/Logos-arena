"use client";

import { useEffect, useState, useRef, useTransition, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Swords,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Send,
  Lock,
  Unlock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Share2,
  ExternalLink,
  Brain,
  Trophy,
  ArrowLeft,
  RefreshCw,
  Info,
  Check,
  Sparkles,
} from "lucide-react";
import { StressTestResult } from "@/lib/referee-types";
import { useAntiCheat } from "@/lib/use-anti-cheat";
import { RefereeTurnEvaluation, FinalAutopsy } from "@/lib/referee-types";

interface TurnRecord {
  id: string;
  round_number: number;
  side: "PRO" | "CON";
  author_name: string;
  steelman_summary: string | null;
  argument_text: string;
  referee_json: string | null;
  hp_deducted: number;
  clash_awarded: number;
  integrity_score: number;
  integrity_flags: string | null;
  blitz_required: number | null;
  blitz_question: string | null;
  blitz_answer: string | null;
  blitz_passed: number | null;
  created_at: string;
}

interface DebateData {
  id: string;
  topic: string;
  category: string;
  mode: "PVE" | "PVP" | "SUNDAY_BOUNTY";
  ai_persona: string | null;
  status: "OPEN_CHALLENGE" | "IN_PROGRESS" | "COMPLETED";
  is_ranked: number;
  current_round: number;
  current_turn: "PRO" | "CON";
  pro_user_id: string;
  pro_name: string;
  pro_tier: string;
  pro_hp: number;
  pro_clash_points: number;
  pro_integrity: number;
  con_user_id: string | null;
  con_name: string | null;
  con_tier: string;
  con_hp: number;
  con_clash_points: number;
  con_integrity: number;
  winner: string | null;
  final_autopsy_json: string | null;
  collusion_flag: string | null;
}

interface UserAuth {
  id: string;
  display_name: string;
  email: string;
  tier: string;
}

export default function ClashArenaPage() {
  const { id } = useParams() as { id: string };

  const [debate, setDebate] = useState<DebateData | null>(null);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [user, setUser] = useState<UserAuth | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stepper / Turn State
  const [argumentInput, setArgumentInput] = useState("");
  const [steelmanInput, setSteelmanInput] = useState("");
  const [steelmanUnlocked, setSteelmanUnlocked] = useState(false);
  const [steelmanValidating, setSteelmanValidating] = useState(false);
  const [steelmanFeedback, setSteelmanFeedback] = useState<string | null>(null);
  const [isPendingTurn, startTransition] = useTransition();

  // Expanded VAR Details map
  const [expandedVar, setExpandedVar] = useState<Record<string, boolean>>({});

  // Blitz Modal State
  const [showBlitzModal, setShowBlitzModal] = useState(false);
  const [blitzTurnId, setBlitzTurnId] = useState<string | null>(null);
  const [blitzQuestion, setBlitzQuestion] = useState<string>("");
  const [blitzAnswer, setBlitzAnswer] = useState<string>("");
  const [blitzTimeRemaining, setBlitzTimeRemaining] = useState<number>(25);
  const [blitzSubmitting, setBlitzSubmitting] = useState(false);
  const [blitzResultNotice, setBlitzResultNotice] = useState<string | null>(null);
  const blitzTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Share Copy Feedback
  const [copiedLink, setCopiedLink] = useState(false);

  // Pre-Flight VAR State (PREMIUM feature)
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState<StressTestResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // Anti-cheat hook for the debate argument box
  const antiCheat = useAntiCheat({
    mode: debate?.mode || "PVP",
  });

  // Anti-cheat hook for Blitz input box
  const blitzAntiCheat = useAntiCheat({
    mode: debate?.mode || "PVP",
  });

  // Fetch current user session
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // not logged in
    }
  };

  // Fetch debate data & turns
  const fetchDebateData = useCallback(async () => {
    try {
      const res = await fetch(`/api/debates/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setErrorMsg("Debate not found in the Colosseum archives.");
        } else {
          setErrorMsg("Failed to retrieve clash state.");
        }
        return;
      }
      const data = await res.json();
      setDebate(data.debate);
      setTurns(data.turns || []);
    } catch {
      setErrorMsg("Error contacting the arena server.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSession();
    fetchDebateData();
    const interval = setInterval(fetchDebateData, 4000);
    return () => clearInterval(interval);
  }, [fetchDebateData]);

  // Handle joining open WhatsApp PvP challenge
  const handleJoinDebate = async () => {
    try {
      const res = await fetch(`/api/debates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_hash: antiCheat.deviceHash,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to join clash");
        return;
      }
      fetchDebateData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error joining debate");
    }
  };

  // Determine if Steelman is mandatory: Rounds 2 and 3 require Steelman lock
  const requiresSteelman = Boolean(
    debate && debate.current_round >= 2 && turns.length > 0 && !steelmanUnlocked
  );

  // Validate Steelman before argument unlock
  const handleValidateSteelman = async () => {
    if (!steelmanInput.trim()) return;
    setSteelmanValidating(true);
    setSteelmanFeedback(null);
    try {
      const res = await fetch(`/api/debates/${id}/steelman`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steelmanSummary: steelmanInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSteelmanFeedback(data.error || "Steelman evaluation failed.");
        return;
      }

      if (data.valid) {
        setSteelmanUnlocked(true);
        setSteelmanFeedback(`Steelman Accepted (${data.score}/100): ${data.feedback}`);
      } else {
        setSteelmanFeedback(`Steelman Rejected: ${data.feedback}`);
      }
    } catch (err: unknown) {
      setSteelmanFeedback(err instanceof Error ? err.message : "Validation error");
    } finally {
      setSteelmanValidating(false);
    }
  };

  // Blitz Timer Logic (25-second countdown)
  const startBlitzCountdown = (turnId: string, question: string) => {
    setBlitzTurnId(turnId);
    setBlitzQuestion(question);
    setBlitzAnswer("");
    setBlitzTimeRemaining(25);
    setShowBlitzModal(true);

    if (blitzTimerRef.current) clearInterval(blitzTimerRef.current);

    const startTime = Date.now();
    blitzTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, 25 - elapsed);
      setBlitzTimeRemaining(remaining);

      if (remaining <= 0) {
        if (blitzTimerRef.current) clearInterval(blitzTimerRef.current);
        handleBlitzSubmitDirect(turnId, 25, "");
      }
    }, 500);
  };

  const handleBlitzSubmitDirect = async (turnId: string, elapsedSecs: number, answerText: string) => {
    if (blitzTimerRef.current) clearInterval(blitzTimerRef.current);
    setBlitzSubmitting(true);
    try {
      const res = await fetch(`/api/debates/${id}/blitz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnId,
          blitzAnswer: answerText,
          elapsedSeconds: elapsedSecs,
        }),
      });
      const data = await res.json();
      setShowBlitzModal(false);
      if (data.passed) {
        setBlitzResultNotice(`Blitz Cross-Examination Passed! 0 HP penalty.`);
      } else {
        setBlitzResultNotice(
          `Blitz Failed (-25 HP deducted): ${data.reason || "Time expired or premise dropped."}`
        );
      }
      fetchDebateData();
    } catch {
      setShowBlitzModal(false);
    } finally {
      setBlitzSubmitting(false);
    }
  };

  const handleManualBlitzSubmit = () => {
    if (!blitzTurnId) return;
    const elapsed = 25 - blitzTimeRemaining;
    handleBlitzSubmitDirect(blitzTurnId, elapsed, blitzAnswer);
  };

  // Submit standard turn
  const handleSubmitTurn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!argumentInput.trim()) return;

    startTransition(async () => {
      try {
        const telemetry = antiCheat.getTelemetry();
        const res = await fetch(`/api/debates/${id}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            argumentText: argumentInput.trim(),
            steelmanSummary: steelmanInput.trim() || undefined,
            telemetry,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Failed to submit argument");
          return;
        }

        // Reset input fields
        setArgumentInput("");
        setSteelmanInput("");
        setSteelmanUnlocked(false);
        antiCheat.resetTelemetry();

        // Check if Blitz is triggered
        if (data.status === "BLITZ_REQUIRED") {
          startBlitzCountdown(data.turnId, data.blitzQuestion);
        } else {
          fetchDebateData();
        }
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Error submitting turn");
      }
    });
  };

  const toggleVarExplanation = (turnId: string) => {
    setExpandedVar((prev) => ({
      ...prev,
      [turnId]: !prev[turnId],
    }));
  };

  const handleShareToWhatsApp = () => {
    if (!debate) return;
    const shareUrl = `${window.location.origin}/clash/${debate.id}`;
    const text = `⚖️ LOGOS ARENA CLASH VERDICT: "${debate.topic}"\nWinner: ${
      debate.winner === "PRO" ? debate.pro_name : debate.con_name
    } | Final Integrity: ${debate.pro_integrity}%\nWatch the autopsy: ${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleShareToX = () => {
    if (!debate) return;
    const shareUrl = `${window.location.origin}/clash/${debate.id}`;
    const text = `AI Referee Verdict rendered in LogosArena: "${debate.topic.substring(0, 70)}..."\n🏆 Winner: ${
      debate.winner === "PRO" ? debate.pro_name : debate.con_name
    }\nInspect the VAR scorecard & Cognitive Autopsy:`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(
        shareUrl
      )}`,
      "_blank"
    );
  };

  const handleCopyChallengeLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleRunPreflightCheck = async () => {
    if (!argumentInput.trim()) return;
    setPreflightLoading(true);
    setPreflightError(null);
    try {
      const res = await fetch(`/api/debates/${id}/preflight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftText: argumentInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreflightError(data.error || "Pre-flight scan failed.");
        return;
      }
      setPreflightResult(data.analysis);
    } catch (err: unknown) {
      setPreflightError(err instanceof Error ? err.message : "Error contacting referee");
    } finally {
      setPreflightLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
        <p className="text-sm tracking-wide font-medium">Entering the Colosseum Arena...</p>
      </div>
    );
  }

  if (errorMsg || !debate) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-300 space-y-4">
        <AlertTriangle className="w-10 h-10 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-100">{errorMsg || "Debate Not Found"}</h2>
        <Link
          href="/"
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 px-4 py-2 rounded-xl text-xs font-semibold text-amber-400 flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Arena Lobby
        </Link>
      </div>
    );
  }

  const isUserPro = user && user.id === debate.pro_user_id;
  const isUserCon = user && user.id === debate.con_user_id;
  const isUserTurn =
    debate.status === "IN_PROGRESS" &&
    ((debate.current_turn === "PRO" && isUserPro) || (debate.current_turn === "CON" && isUserCon));

  let finalAutopsy: FinalAutopsy | null = null;
  if (debate.final_autopsy_json) {
    try {
      finalAutopsy = JSON.parse(debate.final_autopsy_json);
    } catch {
      // parse fail fallback
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col pb-24">
      {/* ============================================================
          1. STICKY TOP SCOREBOARD
          ============================================================ */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-xl">
        <div className="max-w-4xl mx-auto space-y-2.5">
          {/* Top meta bar */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-slate-400 hover:text-amber-400 flex items-center gap-1 transition-colors font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Colosseum
              </Link>
              <Link
                href="/studio"
                className="hidden sm:flex text-slate-400 hover:text-amber-400 items-center gap-1 transition-colors font-medium"
              >
                <Sparkles className="w-3 h-3 text-amber-400" /> Studio
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                ROUND {debate.current_round}/3
              </span>
              <span className="bg-amber-400/10 text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                {debate.mode}
              </span>
            </div>

            {/* Live Human Integrity Pulse Indicator */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full text-[11px]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-400 hidden sm:inline">Human Integrity:</span>
              <span className="font-bold text-emerald-400">{debate.pro_integrity || 100}%</span>
            </div>
          </div>

          {/* Motion Topic Banner */}
          <div className="text-center px-2">
            <h1 className="text-xs sm:text-sm font-bold text-slate-200 line-clamp-1 italic">
              &ldquo;{debate.topic}&rdquo;
            </h1>
          </div>

          {/* Pro vs Con HP & Score Bars */}
          <div className="grid grid-cols-2 gap-3 items-center pt-1">
            {/* PRO SIDE */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-bold text-emerald-400 truncate">{debate.pro_name}</span>
                  <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-1 rounded uppercase">
                    {debate.pro_tier}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span className="font-bold text-emerald-400">{debate.pro_hp}</span>
                  <span className="text-slate-500 text-[10px]">HP</span>
                </div>
              </div>
              {/* Animated Logic HP Bar (100 HP) */}
              <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-700 ease-out shadow-sm shadow-emerald-400/50"
                  style={{ width: `${Math.max(0, Math.min(100, debate.pro_hp))}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Clash: +{debate.pro_clash_points} pts</span>
                {debate.current_turn === "PRO" && debate.status === "IN_PROGRESS" && (
                  <span className="text-amber-400 font-bold animate-pulse">Debating...</span>
                )}
              </div>
            </div>

            {/* CON SIDE */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-bold text-amber-400 truncate">
                    {debate.con_name || "Waiting for Challenger"}
                  </span>
                  <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-1 rounded uppercase">
                    {debate.con_tier}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span className="font-bold text-amber-400">{debate.con_hp}</span>
                  <span className="text-slate-500 text-[10px]">HP</span>
                </div>
              </div>
              {/* Animated Logic HP Bar (100 HP) */}
              <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-700 ease-out shadow-sm shadow-amber-400/50"
                  style={{ width: `${Math.max(0, Math.min(100, debate.con_hp))}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Clash: +{debate.con_clash_points} pts</span>
                {debate.current_turn === "CON" && debate.status === "IN_PROGRESS" && (
                  <span className="text-amber-400 font-bold animate-pulse">Debating...</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Arena Arena Viewport */}
      <main className="max-w-3xl mx-auto w-full px-4 pt-6 space-y-6 flex-1">
        {/* Anti-cheat Toast Notification */}
        {antiCheat.toastMessage && (
          <div className="sticky top-28 z-50 bg-rose-950/90 border border-rose-500 text-rose-200 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{antiCheat.toastMessage}</span>
          </div>
        )}

        {/* Blitz Notification Toast */}
        {blitzResultNotice && (
          <div className="bg-slate-900 border border-amber-400/40 text-amber-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between">
            <span>{blitzResultNotice}</span>
            <button
              onClick={() => setBlitzResultNotice(null)}
              className="text-slate-400 hover:text-slate-200 font-bold text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Open PvP Challenge Join Callout */}
        {debate.status === "OPEN_CHALLENGE" && (
          <section className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <Swords className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-100">Open WhatsApp Disputation Challenge</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                {debate.pro_name} has formulated this motion and awaits an intellectual challenger to defend the CON position.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              <button
                onClick={handleCopyChallengeLink}
                className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                <span>{copiedLink ? "Link Copied!" : "Share Link to WhatsApp"}</span>
              </button>

              {!isUserPro && (
                <button
                  onClick={handleJoinDebate}
                  className="w-full sm:w-auto bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wide transition-all shadow-md shadow-emerald-400/20"
                >
                  Accept & Dispute Motion as CON
                </button>
              )}
            </div>
          </section>
        )}

        {/* ============================================================
            2. OPPONENT & DEBATER TURN CARDS WITH SELECT-NONE & VAR BADGES
            ============================================================ */}
        <section className="space-y-5">
          {turns.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 text-center space-y-2">
              <Brain className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">The Sand is Clean</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Round 1 begins. {debate.pro_name} (PRO) has the opening statement.
              </p>
            </div>
          ) : (
            turns.map((turn) => {
              const isPro = turn.side === "PRO";
              let refereeData: RefereeTurnEvaluation | null = null;
              if (turn.referee_json) {
                try {
                  refereeData = JSON.parse(turn.referee_json);
                } catch {
                  // ignore
                }
              }

              const isExpanded = Boolean(expandedVar[turn.id]);
              const fallacies = refereeData?.fallacies || [];
              const citations = refereeData?.citations || [];

              return (
                <article
                  key={turn.id}
                  className={`rounded-2xl border transition-all ${
                    isPro
                      ? "bg-slate-900/80 border-emerald-500/30"
                      : "bg-slate-900/80 border-amber-500/30"
                  } p-4 sm:p-5 shadow-lg relative`}
                >
                  {/* Turn Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-black text-[11px] px-2 py-0.5 rounded uppercase tracking-wider ${
                          isPro
                            ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30"
                            : "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                        }`}
                      >
                        {turn.side} • ROUND {turn.round_number}
                      </span>
                      <span className="font-bold text-slate-200">{turn.author_name}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
                      <span>-{turn.hp_deducted} HP</span>
                      <span className="text-emerald-400">+{turn.clash_awarded} clash</span>
                    </div>
                  </div>

                  {/* Steelman block if provided */}
                  {turn.steelman_summary && (
                    <div className="mb-3 p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase text-[10px]">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Steelman Synthesis of Adversary:</span>
                      </div>
                      <p className="text-slate-300 italic">&ldquo;{turn.steelman_summary}&rdquo;</p>
                    </div>
                  )}

                  {/* Opponent Argument Text: select-none applied to prevent external copy-pasting */}
                  <div className="select-none text-xs sm:text-sm text-slate-200 leading-relaxed font-serif whitespace-pre-wrap">
                    {turn.argument_text}
                  </div>

                  {/* VAR & Source Verification Annotations Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                    {/* VAR Fallacy Badges (Rose / Amber) */}
                    {fallacies.map((fal, fIdx) => (
                      <button
                        key={`${turn.id}_fal_${fIdx}`}
                        type="button"
                        onClick={() => toggleVarExplanation(turn.id)}
                        className="group inline-flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 text-rose-400 px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                        title="Click to view Referee VAR analysis"
                      >
                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                        <span>VAR: {fal.name}</span>
                        <span className="text-rose-500 font-mono text-[10px]">(-{fal.hpPenalty} HP)</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3 text-rose-400 ml-0.5" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-rose-400 ml-0.5" />
                        )}
                      </button>
                    ))}

                    {/* Source Verification Emerald Pills */}
                    {citations.map((cite, cIdx) => (
                      <div
                        key={`${turn.id}_cite_${cIdx}`}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border ${
                          cite.verdict === "VERIFIED"
                            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                            : cite.verdict === "FABRICATED"
                            ? "bg-rose-500/10 border-rose-500/40 text-rose-400"
                            : "bg-amber-500/10 border-amber-500/40 text-amber-400"
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>
                          {cite.source}: {cite.verdict}
                        </span>
                      </div>
                    ))}

                    {/* Clean / No Fallacies Indicator */}
                    {fallacies.length === 0 && (
                      <span className="text-[11px] text-emerald-400/90 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Valid Inferential Structure
                      </span>
                    )}

                    {/* Blitz Outcome Pill */}
                    {turn.blitz_passed === 1 && (
                      <span className="text-[10px] bg-amber-400/10 border border-amber-400/30 text-amber-300 px-2 py-0.5 rounded font-bold ml-auto">
                        Blitz Passed (25s)
                      </span>
                    )}
                    {turn.blitz_passed === 0 && (
                      <span className="text-[10px] bg-rose-500/10 border border-rose-500/30 text-rose-400 px-2 py-0.5 rounded font-bold ml-auto">
                        Blitz Failed (-25 HP)
                      </span>
                    )}
                  </div>

                  {/* Expandable Referee VAR Explanation Drawer */}
                  {isExpanded && refereeData && (
                    <div className="mt-3 p-3.5 bg-slate-950 border border-rose-500/30 rounded-xl space-y-2 text-xs">
                      <div className="font-bold text-rose-400 flex items-center gap-1.5">
                        <Info className="w-4 h-4" />
                        <span>Referee Forensic VAR Autopsy:</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">{refereeData.refereeCommentary}</p>

                      <div className="space-y-1.5 pt-1">
                        {refereeData.fallacies.map((f, i) => (
                          <div key={i} className="bg-slate-900 p-2 rounded border border-slate-800">
                            <div className="font-bold text-rose-300 text-[11px]">
                              {f.name} ({f.code}): -{f.hpPenalty} HP
                            </div>
                            <div className="text-slate-400 text-[11px] mt-0.5">{f.explanation}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>

        {/* ============================================================
            3. POST-DEBATE "COGNITIVE AUTOPSY" VERDICT CARD
            ============================================================ */}
        {debate.status === "COMPLETED" && (
          <section className="bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950/30 border border-amber-400/40 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-lg text-slate-100 tracking-wide">
                  COGNITIVE AUTOPSY & VERDICT
                </h3>
              </div>
              <span className="bg-amber-400 text-slate-950 font-black px-2.5 py-0.5 rounded text-xs uppercase tracking-wider">
                Official
              </span>
            </div>

            {/* Winner Announcement Banner */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl text-center space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Declared Colosseum Victor
              </span>
              <div className="text-2xl font-black text-amber-400 tracking-tight">
                {debate.winner === "PRO"
                  ? `${debate.pro_name} (PRO)`
                  : debate.winner === "CON"
                  ? `${debate.con_name} (CON)`
                  : "Stalemate / Draw"}
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto pt-1">
                {finalAutopsy?.decisiveBlow ||
                  "Decided by inferential deductive rigor, logical fallacy HP preservation, and empirical citation integrity."}
              </p>
            </div>

            {/* Scorecard Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Pro Final HP</div>
                <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                  {debate.pro_hp} / 100
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Con Final HP</div>
                <div className="text-base font-black text-amber-400 font-mono mt-0.5">
                  {debate.con_hp} / 100
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Clash Accuracy</div>
                <div className="text-base font-black text-slate-200 font-mono mt-0.5">
                  {Math.round(
                    ((debate.pro_clash_points + debate.con_clash_points) /
                      Math.max(1, (debate.pro_clash_points + debate.con_clash_points) * 1.2)) *
                      100
                  )}
                  %
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Human Integrity</div>
                <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                  {debate.pro_integrity || 100}%
                </div>
              </div>
            </div>

            {/* Autopsy Synthesis */}
            {finalAutopsy?.finalSynthesis && (
              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-slate-300">Philosophical Synthesis:</div>
                <p className="text-slate-400 leading-relaxed font-serif">
                  {finalAutopsy.finalSynthesis}
                </p>
              </div>
            )}

            {/* One-Tap Viral Share Buttons (WhatsApp & X) */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={handleShareToWhatsApp}
                className="w-full sm:flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Share2 className="w-4 h-4" /> Share Verdict to WhatsApp
              </button>

              <button
                type="button"
                onClick={handleShareToX}
                className="w-full sm:flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 font-bold px-4 py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
              >
                <ExternalLink className="w-4 h-4" /> Share Scorecard to X
              </button>
            </div>
          </section>
        )}

        {/* ============================================================
            4. STEELMAN LOCK & ANTI-CHEAT ARGUMENT BOX
            ============================================================ */}
        {debate.status === "IN_PROGRESS" && isUserTurn && (
          <form
            onSubmit={handleSubmitTurn}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <Brain className="w-4 h-4 text-amber-400" />
                <span>
                  Your Turn: Submit Argument ({debate.current_turn} • Round {debate.current_round})
                </span>
              </div>

              {/* Keystroke Integrity Verified Pulse Badge */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-medium">Keystroke Integrity: Verified</span>
              </div>
            </div>

            {/* Steelman Lock Input (Rounds 2 & 3) */}
            {requiresSteelman && (
              <div className="space-y-2 p-4 bg-slate-950/80 border border-amber-500/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    {steelmanUnlocked ? (
                      <Unlock className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Lock className="w-4 h-4 text-amber-400" />
                    )}
                    <span>Steelman Lock: Summarize Opponent&apos;s Premise First</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">
                    Mandatory for Round {debate.current_round}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400">
                  Before formulating your counter-argument, you must state your adversary&apos;s strongest premise charitably in your own words.
                </p>

                <textarea
                  rows={2}
                  value={steelmanInput}
                  onChange={(e) => setSteelmanInput(e.target.value)}
                  placeholder="In charitable formulation, my interlocutor argues that..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-amber-400 outline-none"
                />

                {steelmanFeedback && (
                  <div
                    className={`text-[11px] p-2 rounded ${
                      steelmanUnlocked
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {steelmanFeedback}
                  </div>
                )}

                {!steelmanUnlocked && (
                  <button
                    type="button"
                    onClick={handleValidateSteelman}
                    disabled={steelmanValidating || !steelmanInput.trim()}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wide transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {steelmanValidating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Validating Steelman...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Validate Steelman to Unlock Argument Box</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Anti-Cheat Protected Argument Box */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Defend Your Thesis (External Paste Disabled)
              </label>
              <textarea
                rows={5}
                required
                disabled={requiresSteelman && !steelmanUnlocked}
                value={argumentInput}
                onChange={(e) => setArgumentInput(e.target.value)}
                onPaste={antiCheat.handlers.onPaste}
                onCopy={antiCheat.handlers.onCopy}
                onDrop={antiCheat.handlers.onDrop}
                onKeyDown={antiCheat.handlers.onKeyDown}
                placeholder={
                  requiresSteelman && !steelmanUnlocked
                    ? "Pass the Steelman validation above to unlock your counter-argument box..."
                    : "Formulate your premises, deductions, and substantiations. Keep logical fallacies to zero to preserve Logic HP."
                }
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl p-3.5 text-xs sm:text-sm text-slate-100 placeholder-slate-600 outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>

            {/* Pre-Flight VAR Trigger for PREMIUM Users (Non-Sunday Bounty) */}
            {debate.mode !== "SUNDAY_BOUNTY" && (
              <div className="pt-1">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleRunPreflightCheck}
                    disabled={preflightLoading || !argumentInput.trim()}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-400/10 border border-amber-400/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40"
                  >
                    {preflightLoading ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" /> Running Pre-Flight VAR...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-400" /> Run Pre-Flight VAR Check (PREMIUM)
                      </>
                    )}
                  </button>

                  <span className="text-[10px] text-slate-500">
                    Private scan before official submission
                  </span>
                </div>

                {preflightError && (
                  <div className="mt-2 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded">
                    {preflightError}
                  </div>
                )}

                {preflightResult && (
                  <div className="mt-2 p-3 bg-slate-950 border border-amber-500/30 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-amber-400">
                      <span>Pre-Flight VAR Score: {preflightResult.overall_rigor_score}/100</span>
                      <button
                        type="button"
                        onClick={() => setPreflightResult(null)}
                        className="text-slate-500 hover:text-slate-300 font-mono text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-slate-300 text-[11px]">{preflightResult.executive_verdict}</p>
                    {preflightResult.logical_weaknesses.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-rose-400">
                          Fallacy Warning:
                        </span>
                        <div className="text-[11px] text-rose-300 bg-slate-900 p-2 rounded border border-rose-500/20">
                          {preflightResult.logical_weaknesses[0].fallacy_name}: {preflightResult.logical_weaknesses[0].critique}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                <Clock className="w-3.5 h-3.5" />
                <span>AI VAR Referee reviews turn upon dispatch</span>
              </div>

              <button
                type="submit"
                disabled={isPendingTurn || (requiresSteelman && !steelmanUnlocked) || !argumentInput.trim()}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-400/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPendingTurn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Scrutinizing Logic...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Dispatch Argument</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Turn Waiting State for Spectators / Other side */}
        {debate.status === "IN_PROGRESS" && !isUserTurn && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center text-xs text-slate-400 space-y-1">
            <span className="font-semibold text-slate-300">
              Awaiting {debate.current_turn === "PRO" ? debate.pro_name : debate.con_name}&apos;s turn...
            </span>
            <p className="text-[11px] text-slate-500">
              The Colosseum sands await the next formal syllogism.
            </p>
          </div>
        )}
      </main>

      {/* ============================================================
          5. 25-SECOND BLITZ CROSS-EXAMINATION MODAL
          ============================================================ */}
      {showBlitzModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-500 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Urgent Header */}
            <div className="flex items-center justify-between pb-2 border-b border-rose-500/30">
              <div className="flex items-center gap-2 text-rose-400 font-black text-sm tracking-wide">
                <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce" />
                <span>REFEREE BLITZ CROSS-EXAMINATION</span>
              </div>
              {/* Countdown badge */}
              <div
                className={`font-mono font-black text-base px-2.5 py-0.5 rounded-lg border ${
                  blitzTimeRemaining <= 10
                    ? "bg-rose-500 text-slate-950 border-rose-400 animate-pulse"
                    : "bg-slate-950 text-rose-400 border-rose-500/50"
                }`}
              >
                0:{blitzTimeRemaining.toString().padStart(2, "0")}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 leading-tight">
                Integrity score check triggered. Prove you comprehend and formulated this argument in real time within 25 seconds:
              </p>
              {/* Surprise question */}
              <div className="bg-slate-950 p-3 rounded-xl border border-rose-500/30 text-xs font-semibold text-amber-300 italic">
                &ldquo;{blitzQuestion}&rdquo;
              </div>
            </div>

            {/* Response Textarea */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Immediate Real-Time Clarification (No Pasting)
              </label>
              <textarea
                rows={3}
                autoFocus
                value={blitzAnswer}
                onChange={(e) => setBlitzAnswer(e.target.value)}
                onPaste={blitzAntiCheat.handlers.onPaste}
                onCopy={blitzAntiCheat.handlers.onCopy}
                placeholder="Clarify your premise directly and concisely..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-mono">
                Failure docks 25 Logic HP
              </span>
              <button
                type="button"
                onClick={handleManualBlitzSubmit}
                disabled={blitzSubmitting || !blitzAnswer.trim()}
                className="bg-rose-500 hover:bg-rose-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {blitzSubmitting ? "Judging..." : "Submit Proof"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
