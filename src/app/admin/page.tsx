"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Lock,
  Swords,
  Users,
  DollarSign,
  Trophy,
  ShieldAlert,
  CheckCircle,
  RefreshCw,
  Flame,
  Award,
  Edit3,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface AdminMetrics {
  totalUsers: number;
  totalSubscribers: number;
  proUsers: number;
  premiumUsers: number;
  totalRevenueNgn: number;
  totalRevenueUsd: number;
  pendingSubscriptionsCount: number;
}

interface Tournament {
  id: string;
  week_label: string;
  motion_topic: string;
  status: string;
  base_prize_usd: number;
  revenue_pool_usd: number;
  effective_prize_usd: number;
}

interface FlaggedTurn {
  id: string;
  debate_id: string;
  round_number: number;
  side: string;
  author_name: string;
  argument_text: string;
  integrity_score: number;
  integrity_flags: string | null;
  blitz_required: number;
  blitz_passed: number | null;
  created_at: string;
}

interface PendingSub {
  id: string;
  user_id: string;
  plan: string;
  currency: string;
  amount: number;
  payment_method: string;
  payment_ref: string;
  status: string;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  tier: "FREE" | "PRO" | "PREMIUM";
  debates_used_this_month: number;
  verified_wins: number;
  avg_integrity_score: number;
  subscription_expires_at: string | null;
}

export default function AdminPage() {
  const [passcode, setPasscode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Admin Data
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [flaggedTurns, setFlaggedTurns] = useState<FlaggedTurn[]>([]);
  const [pendingSubs, setPendingSubs] = useState<PendingSub[]>([]);
  const [usersList, setUsersList] = useState<UserRow[]>([]);

  // Motion Editor Form
  const [newMotion, setNewMotion] = useState("");
  const [newWeekLabel, setNewWeekLabel] = useState("");
  const [savingMotion, setSavingMotion] = useState(false);
  const [motionFeedback, setMotionFeedback] = useState<string | null>(null);

  // Manual User Upgrade
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedTier, setSelectedTier] = useState<"FREE" | "PRO" | "PREMIUM">("PRO");
  const [upgradingUser, setUpgradingUser] = useState(false);
  const [upgradeFeedback, setUpgradeFeedback] = useState<string | null>(null);

  const fetchAdminData = async (codeToUse?: string) => {
    const code = codeToUse || passcode;
    if (!code) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin", {
        headers: {
          "x-admin-passcode": code,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        setIsAuthenticated(false);
        setErrorMsg(data.error || "Authentication failed");
        return;
      }

      setIsAuthenticated(true);
      setMetrics(data.metrics);
      setTournament(data.currentTournament);
      if (data.currentTournament) {
        setNewMotion(data.currentTournament.motion_topic);
        setNewWeekLabel(data.currentTournament.week_label);
      }
      setFlaggedTurns(data.flaggedTurns || []);
      setPendingSubs(data.pendingSubscriptions || []);
      setUsersList(data.usersList || []);
      localStorage.setItem("logos_admin_code", code);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error connecting to admin API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedCode = localStorage.getItem("logos_admin_code");
    if (savedCode) {
      setPasscode(savedCode);
      fetchAdminData(savedCode);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAdminData();
  };

  const handleSaveMotion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMotion.trim()) return;

    setSavingMotion(true);
    setMotionFeedback(null);

    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-passcode": passcode,
        },
        body: JSON.stringify({
          action: "set_motion",
          motion_topic: newMotion.trim(),
          week_label: newWeekLabel.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMotionFeedback(`Error: ${data.error}`);
        return;
      }

      setTournament(data.tournament);
      setMotionFeedback("Weekly Sunday Scholar motion updated successfully!");
    } catch (err: unknown) {
      setMotionFeedback(`Error: ${err instanceof Error ? err.message : "Failed to update motion"}`);
    } finally {
      setSavingMotion(false);
    }
  };

  const handleManualUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setUpgradingUser(true);
    setUpgradeFeedback(null);

    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-passcode": passcode,
        },
        body: JSON.stringify({
          action: "manual_upgrade",
          user_id: selectedUserId,
          tier: selectedTier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setUpgradeFeedback(`Error: ${data.error}`);
        return;
      }

      setUpgradeFeedback(`Success: ${data.message}`);
      await fetchAdminData();
    } catch (err: unknown) {
      setUpgradeFeedback(`Error: ${err instanceof Error ? err.message : "Failed to upgrade user"}`);
    } finally {
      setUpgradingUser(false);
    }
  };

  const handleApproveSub = async (subId: string) => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-passcode": passcode,
        },
        body: JSON.stringify({
          action: "approve_subscription",
          subscription_id: subId,
        }),
      });

      if (res.ok) {
        await fetchAdminData();
      }
    } catch {
      // ignore
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 font-sans">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-sm w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center mx-auto text-amber-400">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-slate-100">Founder Admin Gate</h2>
            <p className="text-xs text-slate-400">
              Protected interface for LogosArena founder controls and tournament arbitration.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                Admin Passcode:
              </label>
              <input
                type="password"
                required
                placeholder="Enter ADMIN_PASSCODE..."
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 outline-none focus:border-amber-400"
              />
            </div>

            {errorMsg && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !passcode.trim()}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all"
            >
              {loading ? "Authenticating..." : "Unlock Founder Command"}
            </button>
          </form>

          <div className="text-center">
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
              Return to Arena Lobby
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-20">
      {/* Top Header */}
      <header className="max-w-6xl mx-auto w-full px-4 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-100 flex items-center gap-2">
              FOUNDER<span className="text-amber-400">DASHBOARD</span>
            </h1>
            <p className="text-[10px] text-slate-400 tracking-wider uppercase font-semibold">
              LogosArena Command & Control
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/bounty"
            className="text-amber-400 hover:text-amber-300 font-semibold transition-colors"
          >
            Bounty Hub
          </Link>
          <Link
            href="/pricing"
            className="text-slate-300 hover:text-white transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            Arena Lobby
          </Link>
          <button
            onClick={() => {
              localStorage.removeItem("logos_admin_code");
              setIsAuthenticated(false);
            }}
            className="bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-rose-400 px-3 py-1 rounded-full text-xs transition-colors"
          >
            Lock
          </button>
        </div>
      </header>

      {/* Main Admin Body */}
      <main className="max-w-6xl mx-auto w-full px-4 pt-8 space-y-8">
        {/* Metric Cards */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Scholars</span>
              <div className="text-2xl font-black text-slate-100">{metrics.totalUsers}</div>
              <span className="text-[10px] text-slate-500">Registered users</span>
            </div>

            <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-semibold text-amber-400 uppercase">Active Subscribers</span>
              <div className="text-2xl font-black text-amber-400">{metrics.totalSubscribers}</div>
              <span className="text-[10px] text-slate-400">
                {metrics.proUsers} Pro • {metrics.premiumUsers} Premium
              </span>
            </div>

            <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase">Gross Revenue</span>
              <div className="text-xl sm:text-2xl font-black text-emerald-400">
                ${metrics.totalRevenueUsd.toFixed(2)} / ₦{metrics.totalRevenueNgn.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400">Global USDT & Paystack</span>
            </div>

            <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-semibold text-amber-300 uppercase">Sunday Bounty Pool</span>
              <div className="text-2xl font-black text-amber-300">
                ${tournament?.effective_prize_usd ?? 20} USD
              </div>
              <span className="text-[10px] text-slate-400">
                Pool Rev: ${(tournament?.revenue_pool_usd ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* 1. SET WEEKLY SUNDAY SCHOLAR BOUNTY MOTION */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Flame className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-base text-slate-100">
              Set Weekly Sunday Scholar Bounty Motion
            </h3>
          </div>

          <form onSubmit={handleSaveMotion} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Week Label:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Week of 2025-05-18"
                  value={newWeekLabel}
                  onChange={(e) => setNewWeekLabel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Official Motion Topic:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Does the fine-tuning of cosmological constants require a personal creator?"
                  value={newMotion}
                  onChange={(e) => setNewMotion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {motionFeedback && (
              <div className="text-xs p-2 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300">
                {motionFeedback}
              </div>
            )}

            <button
              type="submit"
              disabled={savingMotion}
              className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all"
            >
              {savingMotion ? "Publishing Motion..." : "Publish Official Motion"}
            </button>
          </form>
        </section>

        {/* 2. ONE-CLICK USER TIER OVERRIDE / UPGRADE */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Users className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-base text-slate-100">
              One-Click User Tier Manual Upgrade
            </h3>
          </div>

          <form onSubmit={handleManualUpgrade} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Select Debater:
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                >
                  <option value="">-- Choose Debater Account --</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} ({u.email}) - Current: {u.tier}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Target Tier:
                </label>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value as "FREE" | "PRO" | "PREMIUM")}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                >
                  <option value="PRO">PRO Tier (30 debates / 10 scans)</option>
                  <option value="PREMIUM">PREMIUM Tier (100 debates / 50 scans + VAR)</option>
                  <option value="FREE">FREE Tier</option>
                </select>
              </div>
            </div>

            {upgradeFeedback && (
              <div className="text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                {upgradeFeedback}
              </div>
            )}

            <button
              type="submit"
              disabled={upgradingUser || !selectedUserId}
              className="bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 font-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all"
            >
              {upgradingUser ? "Upgrading..." : `Apply Manual Upgrade to ${selectedTier}`}
            </button>
          </form>
        </section>

        {/* 3. PENDING CRYPTO / PAYSTACK SUBSCRIPTIONS */}
        {pendingSubs.length > 0 && (
          <section className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-base text-slate-100">
                  Pending Crypto / Paystack Subscriptions ({pendingSubs.length})
                </h3>
              </div>
              <span className="text-xs text-amber-400 font-bold uppercase">1-Click Verification</span>
            </div>

            <div className="space-y-3">
              {pendingSubs.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-400 uppercase">{sub.plan}</span>
                      <span className="text-slate-400">
                        {sub.amount} {sub.currency} via {sub.payment_method}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 break-all">
                      Ref: {sub.payment_ref}
                    </div>
                  </div>

                  <button
                    onClick={() => handleApproveSub(sub.id)}
                    className="bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black px-3.5 py-1.5 rounded-lg text-xs uppercase tracking-wider transition-all self-start sm:self-auto shrink-0"
                  >
                    Approve & Upgrade
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. FLAGGED ANTI-CHEAT TURNS INSPECTOR */}
        <section className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
              <h3 className="font-extrabold text-base text-slate-100">
                Flagged Anti-Cheat Turns ({flaggedTurns.length})
              </h3>
            </div>
            <span className="text-xs text-rose-400">Integrity &lt; 80% or Failed Blitz</span>
          </div>

          {flaggedTurns.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">
              No anti-cheat infractions recorded in recent turns.
            </div>
          ) : (
            <div className="space-y-3">
              {flaggedTurns.map((turn) => (
                <div
                  key={turn.id}
                  className="bg-slate-950 p-4 rounded-xl border border-rose-500/20 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{turn.author_name}</span>
                      <span className="text-slate-500">
                        ({turn.side} • Round {turn.round_number})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-rose-400 font-bold">
                        Integrity: {turn.integrity_score}%
                      </span>
                      {turn.integrity_flags && (
                        <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                          {turn.integrity_flags}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-slate-400 font-serif line-clamp-3 italic">
                    &ldquo;{turn.argument_text}&rdquo;
                  </p>

                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Blitz Passed:{" "}
                      {turn.blitz_passed === 1
                        ? "YES"
                        : turn.blitz_passed === 0
                        ? "FAILED"
                        : "N/A"}
                    </span>
                    <Link
                      href={`/clash/${turn.debate_id}`}
                      className="text-amber-400 hover:underline flex items-center gap-1"
                    >
                      View Full Clash <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
