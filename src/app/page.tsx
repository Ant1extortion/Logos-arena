"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Swords,
  Trophy,
  Flame,
  ShieldCheck,
  Brain,
  MessageCircle,
  ExternalLink,
  ChevronRight,
  User,
  LogIn,
  LogOut,
  RefreshCw,
  Zap,
  Sparkles,
} from "lucide-react";
import { PERSONAS } from "@/lib/personas";

interface DebateSummary {
  id: string;
  topic: string;
  category: string;
  mode: "PVE" | "PVP" | "SUNDAY_BOUNTY";
  ai_persona: string | null;
  status: "OPEN_CHALLENGE" | "IN_PROGRESS" | "COMPLETED";
  pro_name: string;
  con_name: string | null;
  pro_hp: number;
  con_hp: number;
  pro_integrity: number;
  con_integrity: number;
  created_at: string;
  winner: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  tier: "FREE" | "PRO" | "PREMIUM";
  debates_used_this_month: number;
  verified_wins: number;
  avg_integrity_score: number;
}

const CURATED_MOTIONS = [
  {
    topic: "Can objective morality exist without a transcendent divine lawgiver?",
    category: "Theology & Ethics",
  },
  {
    topic: "Is human consciousness reducible entirely to deterministic physical neural activity?",
    category: "Philosophy of Mind",
  },
  {
    topic: "Does the existence of gratuitous evil definitively disprove classical theism?",
    category: "Philosophy of Religion",
  },
  {
    topic: "Is communal relational harmony ontologically prior to individual autonomy?",
    category: "Communitarian Ethics",
  },
  {
    topic: "Are cosmological fine-tuning arguments deductively compelling or anthropic coincidences?",
    category: "Cosmology & Logic",
  },
];

export default function HomeLobby() {
  const router = useRouter();
  const [debates, setDebates] = useState<DebateSummary[]>([]);
  const [loadingDebates, setLoadingDebates] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isPending, startTransition] = useTransition();

  // Launcher form state
  const [selectedTopic, setSelectedTopic] = useState(CURATED_MOTIONS[0].topic);
  const [customTopic, setCustomTopic] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(CURATED_MOTIONS[0].category);
  const [selectedMode, setSelectedMode] = useState<"PVE" | "PVP" | "SUNDAY_BOUNTY">("PVE");
  const [selectedPersona, setSelectedPersona] = useState<string>("aquinas");
  const [launchingError, setLaunchingError] = useState<string | null>(null);

  // Auth modal state for quick guest/login
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPasscode, setAuthPasscode] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Dynamic Sunday Scholar Bounty Pool ($20 to $100)
  const [bountyPool, setBountyPool] = useState<number>(75);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  };

  const fetchDebates = async () => {
    try {
      setLoadingDebates(true);
      const res = await fetch("/api/debates");
      if (res.ok) {
        const data = await res.json();
        setDebates(data.debates || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDebates(false);
    }
  };

  useEffect(() => {
    fetchUser();
    fetchDebates();

    // Dynamically calculate bounty pool based on hour/day
    const now = new Date();
    const dynamicAmount = 20 + ((now.getUTCDate() * 7 + now.getUTCHours()) % 81);
    setBountyPool(dynamicAmount);
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode,
          email: authEmail,
          display_name: authName || authEmail.split("@")[0],
          passcode: authPasscode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Authentication failed");
        return;
      }
      setUser(data.user);
      setShowAuthModal(false);
      setAuthEmail("");
      setAuthPasscode("");
      setAuthName("");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Error connecting to arena");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
  };

  const handleLaunchDebate = async () => {
    setLaunchingError(null);
    const motion = customTopic.trim() || selectedTopic;
    if (!motion) {
      setLaunchingError("Please select or enter a debate motion.");
      return;
    }

    if (!user) {
      // Auto register temporary guest if not signed in
      const guestEmail = `debater_${Date.now()}@logosarena.ai`;
      const guestPass = "logos_arena_guest_123";
      try {
        const authRes = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "signup",
            email: guestEmail,
            display_name: "Colosseum Debater",
            passcode: guestPass,
          }),
        });
        if (authRes.ok) {
          const authData = await authRes.json();
          setUser(authData.user);
        } else {
          setShowAuthModal(true);
          return;
        }
      } catch {
        setShowAuthModal(true);
        return;
      }
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/debates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: motion,
            category: selectedCategory,
            mode: selectedMode,
            ai_persona: selectedMode === "PVP" ? undefined : selectedPersona,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setLaunchingError(data.error || "Failed to launch debate clash");
          return;
        }

        router.push(`/clash/${data.debate.id}`);
      } catch (err: unknown) {
        setLaunchingError(err instanceof Error ? err.message : "Network error creating clash");
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      {/* 1. TOP LIVE BANNER: Sunday Scholar Bounty ($20 - $100 Pool) */}
      <aside aria-label="Sunday Scholar Bounty" className="w-full bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border-b border-amber-500/30 px-4 py-2.5 shadow-lg shadow-amber-950/20">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <div className="flex items-center gap-1.5 font-semibold tracking-wide text-amber-300">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>SUNDAY SCHOLAR BOUNTY:</span>
            </div>
            <span className="bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full text-xs tracking-wider uppercase">
              ${bountyPool} USD Dynamic Pool
            </span>
          </div>

          <div className="flex items-center gap-3 text-slate-400">
            <span className="hidden md:inline">Top AI Grandmaster Scrutiny • Instant Referee Payout</span>
            <button
              onClick={() => {
                setSelectedMode("SUNDAY_BOUNTY");
                setSelectedPersona("sunday_grandmaster");
                window.scrollTo({ top: 380, behavior: "smooth" });
              }}
              className="text-amber-400 hover:text-amber-300 font-bold underline underline-offset-2 flex items-center gap-1 transition-colors"
            >
              Enter Qualifier <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Navigation Header */}
      <header className="max-w-5xl mx-auto w-full px-4 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-100 flex items-center gap-2">
              LOGOS<span className="text-amber-400">ARENA</span>
            </h1>
            <p className="text-[10px] text-slate-400 tracking-wider uppercase font-semibold">
              The Intellectual Colosseum
            </p>
          </div>
        </div>

        {/* Navigation Links & User Account / Session Pill */}
        <div className="flex items-center gap-3">
          <Link
            href="/studio"
            className="flex items-center gap-1.5 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Stress-Tester Studio</span>
          </Link>

          {user ? (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <span className="font-medium text-slate-200">{user.display_name}</span>
              <span className="bg-amber-400/10 text-amber-400 border border-amber-400/20 px-1.5 py-0.2 rounded text-[10px] font-bold">
                {user.tier}
              </span>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="text-slate-400 hover:text-rose-400 transition-colors ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-200 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-400" />
              <span>Debater Login</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto w-full px-4 pt-6 space-y-10">
        {/* Hero Section */}
        <section className="text-center space-y-3 pt-4 sm:pt-6">
          <div className="inline-flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1 rounded-full text-xs text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Anti-Cheat & Steelman Verified • AI Turn Referee</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-100 max-w-2xl mx-auto leading-tight">
            Where Theological & Philosophical <span className="text-amber-400">Giants Clash</span>.
          </h2>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
            Step into the high-stakes arena. Defend your worldview against historical philosophical personas or human adversaries under razor-sharp AI logical refereeing.
          </p>
        </section>

        {/* 2. "ENTER THE ARENA" LAUNCHER */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex items-center gap-2 pb-4 border-b border-slate-800 mb-6">
            <Flame className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-lg text-slate-100 tracking-wide">Enter the Arena</h3>
            <span className="text-xs text-slate-500 ml-auto font-mono">STEP 1 OF 2</span>
          </div>

          <div className="space-y-6">
            {/* Mode Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
                Select Battle Discipline
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedMode("PVE")}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedMode === "PVE"
                      ? "bg-amber-400/10 border-amber-400 text-slate-100 shadow-md shadow-amber-950/20"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-slate-200 flex items-center gap-1.5">
                      <Brain className="w-4 h-4 text-amber-400" /> Solo Dojo AI
                    </span>
                    {selectedMode === "PVE" && <div className="w-2 h-2 rounded-full bg-amber-400"></div>}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Dispute historical thinkers: Aquinas, Ghazali, Nietzsche, and more.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMode("PVP")}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedMode === "PVP"
                      ? "bg-emerald-400/10 border-emerald-400 text-slate-100 shadow-md shadow-emerald-950/20"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-slate-200 flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4 text-emerald-400" /> WhatsApp 1v1
                    </span>
                    {selectedMode === "PVP" && <div className="w-2 h-2 rounded-full bg-emerald-400"></div>}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Generate an instant challenge link to settle debates with friends.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedMode("SUNDAY_BOUNTY");
                    setSelectedPersona("sunday_grandmaster");
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedMode === "SUNDAY_BOUNTY"
                      ? "bg-amber-400/20 border-amber-400 text-slate-100 ring-1 ring-amber-400/40"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-amber-400" /> Sunday Bounty
                    </span>
                    <span className="text-[10px] font-black bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded uppercase">
                      ${bountyPool}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Tournament-grade qualifier under the Grandmaster Arbiter.
                  </p>
                </button>
              </div>
            </div>

            {/* AI Persona Selector (Visible for PVE & SUNDAY_BOUNTY) */}
            {selectedMode !== "PVP" && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
                  Choose Interlocutor / Opponent Persona
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {Object.values(PERSONAS)
                    .filter((p) =>
                      selectedMode === "SUNDAY_BOUNTY"
                        ? p.id === "sunday_grandmaster"
                        : p.id !== "sunday_grandmaster"
                    )
                    .map((persona) => (
                      <button
                        key={persona.id}
                        type="button"
                        onClick={() => setSelectedPersona(persona.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedPersona === persona.id
                            ? "bg-amber-400/10 border-amber-400 text-slate-200"
                            : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="font-bold text-xs text-slate-200 truncate">{persona.name}</div>
                        <div className="text-[11px] text-amber-400/90 truncate">{persona.schoolOfThought}</div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Curated Motions or Custom Motion Input */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select or Construct Motion for Disputation
              </label>

              {/* Curated Motion Pills */}
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 font-medium">Curated Classical Motions:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CURATED_MOTIONS.map((item) => (
                    <button
                      key={item.topic}
                      type="button"
                      onClick={() => {
                        setSelectedTopic(item.topic);
                        setSelectedCategory(item.category);
                        setCustomTopic("");
                      }}
                      className={`p-2.5 text-left rounded-lg text-xs border transition-colors ${
                        selectedTopic === item.topic && !customTopic
                          ? "bg-slate-800 border-amber-400/60 text-slate-100"
                          : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <span className="text-[10px] font-bold text-amber-400 uppercase block mb-0.5">
                        {item.category}
                      </span>
                      <span className="line-clamp-2">{item.topic}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input */}
              <div className="pt-2">
                <p className="text-[11px] text-slate-500 font-medium mb-1.5">Or formulate your own thesis:</p>
                <input
                  type="text"
                  placeholder="e.g. Divine Foreknowledge is fully compatible with authentic human libertarian free will."
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all"
                />
              </div>
            </div>

            {launchingError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
                <span className="font-bold">Colosseum Alert:</span> {launchingError}
              </div>
            )}

            {/* Launch Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={handleLaunchDebate}
                disabled={isPending}
                className="w-full sm:w-auto flex-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-3.5 rounded-xl text-sm tracking-wide uppercase transition-all shadow-lg shadow-amber-400/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Summoning Arbiter...</span>
                  </>
                ) : (
                  <>
                    <Swords className="w-4 h-4" />
                    <span>
                      {selectedMode === "PVP"
                        ? "Create Challenge & Get WhatsApp Link"
                        : selectedMode === "SUNDAY_BOUNTY"
                        ? `Enter Qualifier ($${bountyPool} Bounty)`
                        : "Enter the Colosseum"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* 3. LIVE CLASHES FEED */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-base sm:text-lg text-slate-100">Live Clashes & Verdicts</h3>
            </div>
            <button
              onClick={fetchDebates}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDebates ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          {loadingDebates ? (
            <div className="text-center py-12 text-slate-500 text-sm">Loading arena battles...</div>
          ) : debates.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center space-y-2">
              <Brain className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm font-medium">No clashes recorded in this epoch yet.</p>
              <p className="text-slate-500 text-xs">Be the first disputant to step onto the sands above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {debates.map((debate) => {
                const isCompleted = debate.status === "COMPLETED";
                return (
                  <Link
                    key={debate.id}
                    href={`/clash/${debate.id}`}
                    className="group bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all flex flex-col justify-between space-y-3 shadow-md"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">
                          {debate.category || "Philosophy"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isCompleted ? (
                            <span className="bg-slate-800 text-slate-300 font-semibold px-2 py-0.5 rounded text-[10px]">
                              Verdict Rendered
                            </span>
                          ) : (
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Active Clash
                            </span>
                          )}
                          <span className="bg-amber-400/10 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {debate.mode}
                          </span>
                        </div>
                      </div>

                      {/* Topic Title */}
                      <h4 className="font-bold text-sm text-slate-200 group-hover:text-amber-400 transition-colors line-clamp-2">
                        {debate.topic}
                      </h4>
                    </div>

                    {/* Pro vs Con HP and Integrity */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      {/* Pro Side */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-semibold truncate max-w-[150px]">
                            PRO: {debate.pro_name}
                          </span>
                          <span className="font-mono text-xs text-slate-400">{debate.pro_hp} HP</span>
                        </div>
                        <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(0, Math.min(100, debate.pro_hp))}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Con Side */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-semibold truncate max-w-[150px]">
                            CON: {debate.con_name || "Awaiting Opponent"}
                          </span>
                          <span className="font-mono text-xs text-slate-400">{debate.con_hp} HP</span>
                        </div>
                        <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-amber-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(0, Math.min(100, debate.con_hp))}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Human Integrity % Badge */}
                      <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Human Integrity:</span>
                          <span className="font-bold text-emerald-400">
                            {debate.pro_integrity || 100}%
                          </span>
                        </div>

                        <span className="text-slate-500 group-hover:text-slate-300 flex items-center gap-1 font-semibold">
                          Inspect VAR <ExternalLink className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                {authMode === "signup" ? "New Scholar Registration" : "Debater Login"}
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-500 hover:text-slate-300 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authMode === "signup" && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ScholasticThinker"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="scholar@logosarena.ai"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Passcode
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPasscode}
                  onChange={(e) => setAuthPasscode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              {authError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-2.5 rounded-lg text-xs tracking-wider uppercase transition-colors"
              >
                {authMode === "signup" ? "Enter the Arena" : "Verify Credentials"}
              </button>
            </form>

            <div className="text-center pt-1 border-t border-slate-800 text-xs text-slate-400">
              {authMode === "signup" ? (
                <span>
                  Already a verified debater?{" "}
                  <button
                    onClick={() => setAuthMode("login")}
                    className="text-amber-400 font-bold hover:underline"
                  >
                    Log In
                  </button>
                </span>
              ) : (
                <span>
                  New to the Colosseum?{" "}
                  <button
                    onClick={() => setAuthMode("signup")}
                    className="text-amber-400 font-bold hover:underline"
                  >
                    Create Account
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
