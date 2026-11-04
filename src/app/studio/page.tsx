"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  HelpCircle,
  BookOpen,
  Flame,
  Swords,
  User,
  Zap,
} from "lucide-react";
import { StressTestResult } from "@/lib/referee-types";

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  tier: "FREE" | "PRO" | "PREMIUM";
  studio_scans_used_this_month: number;
}

const DOCUMENT_TYPES = [
  "Sermon",
  "Academic Essay",
  "Apologetics Treatise",
  "Public Speech",
  "Open Letter",
];

const HOSTILE_AUDIENCES = [
  {
    id: "Atheist Skeptic",
    title: "Atheist Skeptic",
    desc: "Rigorous empirical naturalist searching for unevidenced leaps and supernatural assumptions.",
  },
  {
    id: "Theological Scholar",
    title: "Theological Scholar",
    desc: "Patristic and scholastic pedant scrutinizing scriptural hermeneutics and historical orthodoxy.",
  },
  {
    id: "Hostile Examiner",
    title: "Hostile Examiner",
    desc: "Aggressive courtroom-style interrogator seeking internal contradictions and false dilemmas.",
  },
  {
    id: "Social Media Mob",
    title: "Social Media Mob",
    desc: "Hyper-sensitive polemicists hunting for out-of-context quotes, dog whistles, and tone offenses.",
  },
];

const SAMPLE_DRAFTS: Record<string, string> = {
  Sermon: `Beloved congregation, in today's sermon on Romans 1:20, we witness how the cosmos inescapably reveals God's divine nature. Yet modern secularists pretend otherwise. Either you accept that God created the moral order, or you must admit that society will collapse into complete anarchy and moral chaos. We all know that every atheist simply wants to evade personal moral accountability, as Thomas Aquinas proved beyond all dispute in the Summa Theologiae.`,
  "Academic Essay": `The teleological argument remains the preeminent justification for metaphysical theism. Given the delicate fine-tuning of cosmological constants such as the strong nuclear force and cosmological constant Lambda, fortuitous emergence is statistically impossible. As Aristotle famously proved, any motion requires an unmoved mover, therefore physical determinism is completely bankrupt. Those who resist this syllogism are merely succumbing to confirmation bias and ideological blindness.`,
};

export default function StudioPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [documentType, setDocumentType] = useState<string>("Sermon");
  const [targetAudience, setTargetAudience] = useState<string>("Atheist Skeptic");
  const [draftText, setDraftText] = useState<string>(SAMPLE_DRAFTS["Sermon"]);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<StressTestResult | null>(null);
  const [scansUsed, setScansUsed] = useState<number>(0);
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [maxScans, setMaxScans] = useState<number>(1);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setScansUsed(data.user.studio_scans_used_this_month || 0);
        const userTier = data.user.tier || "FREE";
        const max = userTier === "PREMIUM" ? 50 : userTier === "PRO" ? 10 : 1;
        setMaxScans(max);
        setScansRemaining(Math.max(0, max - (data.user.studio_scans_used_this_month || 0)));
      }
    } catch {
      // not logged in
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleRunStressTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftText.trim()) return;

    setErrorMsg(null);

    // If user is not yet logged in, auto-create guest session so studio test runs seamlessly
    if (!user) {
      try {
        const guestEmail = `scholar_${Date.now()}@logosarena.ai`;
        const authRes = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "signup",
            email: guestEmail,
            display_name: "Guest Scholar",
            passcode: "logos_studio_guest_123",
          }),
        });
        if (authRes.ok) {
          const authData = await authRes.json();
          setUser(authData.user);
          setMaxScans(authData.user.tier === "PREMIUM" ? 50 : authData.user.tier === "PRO" ? 10 : 1);
        }
      } catch {
        // continue
      }
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/studio/stress-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftText: draftText.trim(),
            documentType,
            targetAudience,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Failed to stress-test draft");
          return;
        }

        setTestResult(data.result);
        setScansUsed(data.scansUsed);
        setScansRemaining(data.scansRemaining);
        setMaxScans(data.maxScans);

        // Scroll to results smoothly
        setTimeout(() => {
          document.getElementById("results-dashboard")?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Error contacting referee studio");
      }
    });
  };

  const handleCopyRewrite = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-20">
      {/* Navigation Header */}
      <header className="max-w-5xl mx-auto w-full px-4 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-500/20 transition-colors"
            title="Return to Colosseum Arena"
          >
            <Swords className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-100">
                LOGOS<span className="text-amber-400">STUDIO</span>
              </h1>
              <span className="bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                Stress-Tester
              </span>
            </div>
            <p className="text-[10px] text-slate-400 tracking-wider uppercase font-semibold">
              Sermon, Essay & Speech Cross-Examiner
            </p>
          </div>
        </div>

        {/* Header Links & Account */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors font-semibold"
          >
            <Swords className="w-3.5 h-3.5" /> Colosseum Arena
          </Link>

          {user ? (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="font-medium text-slate-200">{user.display_name}</span>
              <span className="bg-amber-400/10 text-amber-400 border border-amber-400/20 px-1.5 py-0.2 rounded text-[10px] font-bold">
                {user.tier}
              </span>
              <span className="text-slate-400 text-[10px] font-mono">
                {scansUsed}/{maxScans} scans
              </span>
            </div>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-200"
            >
              <User className="w-3.5 h-3.5 text-amber-400" /> Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main Studio Body */}
      <main className="max-w-4xl mx-auto w-full px-4 pt-6 space-y-8 flex-1">
        {/* Hero Section */}
        <section className="text-center space-y-2 pt-2">
          <div className="inline-flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-full text-xs text-slate-300">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Forensic Dialectical Simulation • AI Hostile Cross-Examination</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-100 max-w-xl mx-auto leading-tight">
            Stress-Test Your Sermons & Essays <span className="text-amber-400">Under Fire</span>.
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
            Discover your logical vulnerabilities, unverified citations, and hostile questions before step onto the pulpit, lecture hall, or debate stage.
          </p>
        </section>

        {/* Input Form Card */}
        <form
          onSubmit={handleRunStressTest}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-6"
        >
          {/* Step 1: Document Type & Audience Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
            {/* Document Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                1. Select Document Form
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DOCUMENT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setDocumentType(type);
                      if (SAMPLE_DRAFTS[type]) {
                        setDraftText(SAMPLE_DRAFTS[type]);
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all ${
                      documentType === type
                        ? "bg-amber-400/10 border-amber-400 text-slate-100"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Audience */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                2. Choose Hostile Cross-Examiner
              </label>
              <div className="space-y-2">
                {HOSTILE_AUDIENCES.map((aud) => (
                  <button
                    key={aud.id}
                    type="button"
                    onClick={() => setTargetAudience(aud.id)}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-start justify-between gap-2 ${
                      targetAudience === aud.id
                        ? "bg-amber-400/10 border-amber-400 text-slate-100"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-200">{aud.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{aud.desc}</div>
                    </div>
                    {targetAudience === aud.id && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 mt-1 shrink-0"></span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 2: Draft Text Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                3. Paste Sermon, Essay, or Speech Draft
              </label>
              <button
                type="button"
                onClick={() => setDraftText(SAMPLE_DRAFTS[documentType] || SAMPLE_DRAFTS["Sermon"])}
                className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
              >
                <BookOpen className="w-3 h-3" /> Load Sample Draft
              </button>
            </div>

            <textarea
              rows={8}
              required
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Paste your theological treatise, sermon manuscript, apologetic thesis, or philosophical essay here..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl p-4 text-xs sm:text-sm text-slate-100 placeholder-slate-600 outline-none transition-all font-serif leading-relaxed"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{draftText.length} characters</span>
              <span>Audience perspective: {targetAudience}</span>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
              <span>{errorMsg}</span>
              {errorMsg.includes("quota exceeded") && (
                <Link
                  href="/"
                  className="bg-rose-500 text-slate-950 font-bold px-3 py-1 rounded text-[10px] uppercase ml-2 shrink-0"
                >
                  Upgrade Tier
                </Link>
              )}
            </div>
          )}

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-800">
            <div className="text-xs text-slate-400">
              {scansRemaining !== null ? (
                <span>
                  Monthly Studio Quota:{" "}
                  <strong className="text-amber-400">{scansRemaining} scans remaining</strong> (
                  {scansUsed}/{maxScans})
                </span>
              ) : (
                <span>FREE plan includes 1 trial scan. PRO offers 10/mo, PREMIUM offers 50/mo.</span>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending || !draftText.trim()}
              className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-7 py-3.5 rounded-xl text-xs sm:text-sm uppercase tracking-wide transition-all shadow-lg shadow-amber-400/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Subjecting to Cross-Examination...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Stress-Test Against {targetAudience}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* RESULTS DASHBOARD */}
        {testResult && (
          <section id="results-dashboard" className="space-y-6 pt-4">
            {/* Header / Score Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-amber-400/40 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <h3 className="font-extrabold text-lg text-slate-100">
                      Stress-Test Forensic Autopsy
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluated against: <strong className="text-slate-200">{targetAudience}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">
                      Dialectical Rigor Score
                    </span>
                    <span
                      className={`text-2xl font-black font-mono ${
                        testResult.overall_rigor_score >= 80
                          ? "text-emerald-400"
                          : testResult.overall_rigor_score >= 60
                          ? "text-amber-400"
                          : "text-rose-500"
                      }`}
                    >
                      {testResult.overall_rigor_score} / 100
                    </span>
                  </div>
                </div>
              </div>

              {/* Executive Verdict */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                  Executive Verdict
                </span>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-serif">
                  {testResult.executive_verdict}
                </p>
              </div>
            </div>

            {/* Logical Weaknesses & Strengthened Rewrites */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <h4 className="font-bold text-sm text-slate-200 uppercase tracking-wider">
                  Logical Weaknesses & Strengthened Rewrites ({testResult.logical_weaknesses.length})
                </h4>
              </div>

              <div className="space-y-3">
                {testResult.logical_weaknesses.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900 border border-rose-500/30 rounded-xl p-4 sm:p-5 space-y-3 shadow-md"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-2 py-0.5 rounded font-black uppercase text-[11px]">
                        {item.fallacy_name} ({item.fallacy_code})
                      </span>
                      <span className="text-[11px] text-slate-500">Detected in Draft</span>
                    </div>

                    {/* Original Quote */}
                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs text-rose-200 italic font-serif">
                      &ldquo;{item.quote}&rdquo;
                    </div>

                    {/* Critique */}
                    <div className="text-xs text-slate-400">
                      <strong className="text-slate-300">Audience Critique:</strong> {item.critique}
                    </div>

                    {/* Fixed Rewrite Box with One-Click Copy */}
                    <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5 uppercase">
                          <Check className="w-3.5 h-3.5" /> Strengthened Airtight Rewrite:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyRewrite(item.fixed_rewrite, idx)}
                          className="bg-slate-900 hover:bg-slate-800 border border-emerald-500/30 text-emerald-300 px-2.5 py-1 rounded text-xs flex items-center gap-1 transition-colors"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy Rewrite
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-200 font-serif leading-relaxed">
                        {item.fixed_rewrite}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Citation Audits */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-sm text-slate-200 uppercase tracking-wider">
                  Citation & Source Integrity Audits ({testResult.citation_audits.length})
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {testResult.citation_audits.map((audit, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200 truncate max-w-[200px]">
                        {audit.cited_reference}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${
                          audit.status === "ACCURATE"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : audit.status === "OUT_OF_CONTEXT"
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                        }`}
                      >
                        {audit.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1">
                      <p>
                        <strong className="text-slate-300">Context:</strong>{" "}
                        {audit.historical_context_note}
                      </p>
                      <p className="text-amber-300/90">
                        <strong className="text-amber-400">Elevated Source:</strong>{" "}
                        {audit.better_supporting_source}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hostile Q&A Simulation */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-sm text-slate-200 uppercase tracking-wider">
                  Hostile Q&A Simulation: 3 Questions from {targetAudience}
                </h4>
              </div>

              <div className="space-y-3">
                {testResult.hostile_qa_simulation.map((qa, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900 border border-amber-500/20 rounded-xl p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="bg-amber-400 text-slate-950 font-black text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-xs sm:text-sm text-amber-300 italic">
                          &ldquo;{qa.tough_question}&rdquo;
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          <strong>Why they ask this:</strong> {qa.why_they_will_ask_it}
                        </div>
                      </div>
                    </div>

                    {/* Airtight Response */}
                    <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg space-y-1 text-xs">
                      <span className="font-bold text-emerald-400 text-[11px] uppercase block">
                        Airtight Rebuttal Strategy:
                      </span>
                      <p className="text-slate-300 leading-relaxed font-serif">
                        {qa.airtight_response}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
