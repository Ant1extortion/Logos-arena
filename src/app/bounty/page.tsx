"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Swords,
  ShieldCheck,
  Flame,
  Award,
  Zap,
  Clock,
  Sparkles,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Info,
} from "lucide-react";

interface ScholarEntry {
  id: string;
  display_name: string;
  tier: "FREE" | "PRO" | "PREMIUM";
  verified_wins: number;
  avg_integrity_score: number;
  blitz_passed_ratio?: number;
}

interface TournamentData {
  id: string;
  week_label: string;
  motion_topic: string;
  status: "QUALIFIERS_OPEN" | "FINALS_LIVE" | "COMPLETED";
  base_prize_usd: number;
  revenue_pool_usd: number;
  effective_prize_usd: number;
}

export default function BountyHubPage() {
  const router = useRouter();
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [leaderboard, setLeaderboard] = useState<ScholarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLaunching, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchBountyData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/debates?leaderboard=sunday");
      if (res.ok) {
        const data = await res.json();
        // Leaderboard filter: strictly require avg_integrity_score >= 80
        const validLeaderboard = (data.leaderboard || []).filter(
          (debater: ScholarEntry) => (debater.avg_integrity_score ?? 100) >= 80
        );
        setLeaderboard(validLeaderboard);

        if (data.tournaments && data.tournaments.length > 0) {
          setTournament(data.tournaments[0]);
        } else {
          // Fallback tournament data if none created yet
          setTournament({
            id: "default_bounty",
            week_label: "Current Weekly Cycle",
            motion_topic: "Can objective morality exist without a transcendent divine lawgiver?",
            status: "QUALIFIERS_OPEN",
            base_prize_usd: 20,
            revenue_pool_usd: 55,
            effective_prize_usd: 75,
          });
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBountyData();
  }, []);

  const handleEnterQualifier = () => {
    if (!tournament) return;
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/debates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: tournament.motion_topic,
            category: "Theology & Ethics",
            mode: "SUNDAY_BOUNTY",
            ai_persona: "sunday_grandmaster",
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Failed to enter Sunday Bounty qualifier");
          return;
        }

        router.push(`/clash/${data.debate.id}`);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Error contacting arena arbiter");
      }
    });
  };

  const prizeAmount = tournament?.effective_prize_usd ?? 75;
  const progressPercent = Math.min(100, Math.max(0, ((prizeAmount - 20) / (100 - 20)) * 100));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      {/* Navigation Header */}
      <header className="max-w-5xl mx-auto w-full px-4 py-4 flex items-center justify-between border-b border-slate-800">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-100 flex items-center gap-2">
              LOGOS<span className="text-amber-400">ARENA</span>
            </h1>
            <p className="text-[10px] text-slate-400 tracking-wider uppercase font-semibold">
              Sunday Scholar Bounty Hub
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold transition-colors"
          >
            <span>Pricing</span>
          </Link>
          <Link
            href="/studio"
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors font-semibold"
          >
            <span>Stress Studio</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span>Colosseum Lobby</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto w-full px-4 pt-8 space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-400/30 text-amber-300 px-3.5 py-1 rounded-full text-xs font-semibold">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Weekly Academic Grant & Dialectical Bounty</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-100 max-w-2xl mx-auto leading-tight">
            Sunday Scholar <span className="text-amber-400">Bounty Tournament</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
            100% skill-based grant awarded every Sunday. Self-funded by 30% of platform subscription revenue, evaluated under the uncompromising Grandmaster Arbiter.
          </p>
        </div>

        {/* 1. DYNAMIC PRIZE POOL PROGRESS BAR ($20 to $100 Cap) */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border border-amber-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest block">
                {tournament?.week_label || "Active Tournament Cycle"}
              </span>
              <h3 className="text-3xl sm:text-4xl font-black text-slate-100 flex items-center gap-3 mt-1">
                <span>${prizeAmount} USD</span>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-bold">
                  Guaranteed Payout
                </span>
              </h3>
            </div>

            <div className="text-left sm:text-right text-xs space-y-1">
              <span className="text-slate-400 block">Base Floor: <strong className="text-slate-200">$20 USD</strong></span>
              <span className="text-slate-400 block">Weekly Hard Cap: <strong className="text-slate-200">$100 USD</strong></span>
              <span className="text-amber-300/80 font-mono text-[11px] block">
                Funded by 30% of annual subscriptions
              </span>
            </div>
          </div>

          {/* Progress Bar Container */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">$20 Floor</span>
              <span className="text-amber-400 font-bold">Dynamic Pool: ${prizeAmount}</span>
              <span className="text-slate-400">$100 Cap</span>
            </div>

            <div className="w-full bg-slate-950 h-3.5 rounded-full p-0.5 border border-slate-800 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 h-full rounded-full transition-all duration-700 shadow-md"
                style={{ width: `${Math.max(5, progressPercent)}%` }}
              ></div>
            </div>
          </div>

          {/* Motion Card */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs text-amber-400 font-bold uppercase tracking-wider">
              <Flame className="w-4 h-4" />
              <span>Official Motion for This Sunday&apos;s Disputation:</span>
            </div>
            <p className="text-base sm:text-lg font-serif text-slate-100 font-semibold leading-relaxed">
              &ldquo;{tournament?.motion_topic || "Can objective morality exist without a transcendent divine lawgiver?"}&rdquo;
            </p>
          </div>

          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Enter Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={handleEnterQualifier}
              disabled={isLaunching}
              className="w-full sm:w-auto flex-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-black px-6 py-4 rounded-xl text-sm tracking-wide uppercase transition-all shadow-xl shadow-amber-400/20 flex items-center justify-center gap-2"
            >
              {isLaunching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Summoning Grandmaster Arbiter...</span>
                </>
              ) : (
                <>
                  <Swords className="w-4 h-4" />
                  <span>Enter Sunday Qualifier (${prizeAmount} USD Bounty)</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* 2. ANTI-CHEAT & TOURNAMENT RULES */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h4 className="font-extrabold text-base text-slate-100">
              Sunday Bounty Rules & Integrity Protocol
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                <span>100% Skill-Based Grant</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                LogosArena awards Sunday grants purely based on philosophical clash, dialectical rigor, and unassisted scholarly defense. Not a game of chance.
              </p>
            </div>

            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="font-bold text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>Zero Copy-Paste & LLM Guard</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Steelman trigram overlaps &gt; 65% are immediately rejected. Live keystroke timing, cadence variance, and paste frequency are scored forensically.
              </p>
            </div>

            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Mandatory 25s Blitz Cross-Exam</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                In tournament mode, every turn triggers an instantaneous 25-second surprise cross-examination question. Debaters exceeding 28s receive an immediate 25 HP penalty.
              </p>
            </div>
          </div>
        </section>

        {/* 3. RANKED QUALIFIER LEADERBOARD (Strict Integrity >= 80 filter) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h4 className="font-bold text-base sm:text-lg text-slate-100">
                Ranked Qualifier Leaderboard
              </h4>
            </div>
            <span className="text-xs text-slate-500">
              Only verified debaters with Integrity ≥ 80%
            </span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Loading qualified scholars...
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center space-y-2">
              <Award className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm font-medium">No verified qualifiers in this cycle yet.</p>
              <p className="text-slate-500 text-xs">
                Launch a qualifier clash above to stake your claim on the leaderboard.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-mono text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Debater</th>
                    <th className="py-3 px-4">Tier</th>
                    <th className="py-3 px-4 text-center">Verified Wins</th>
                    <th className="py-3 px-4 text-right">Integrity Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {leaderboard.map((scholar, idx) => (
                    <tr key={scholar.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-100">
                        {scholar.display_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-bold text-amber-300">
                          {scholar.tier}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-emerald-400">
                        {scholar.verified_wins}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        {scholar.avg_integrity_score}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
