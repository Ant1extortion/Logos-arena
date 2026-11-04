"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Swords,
  Check,
  Zap,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Coins,
  CreditCard,
  Crown,
} from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  tier: "FREE" | "PRO" | "PREMIUM";
  debates_used_this_month: number;
  studio_scans_used_this_month: number;
}

export default function PricingPage() {
  const [regionTab, setRegionTab] = useState<"AFRICA" | "GLOBAL">("AFRICA");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Upgrade Modal State
  const [selectedPlan, setSelectedPlan] = useState<"PRO" | "PREMIUM" | null>(null);
  const [cryptoNetwork, setCryptoNetwork] = useState<"BSC" | "BASE">("BSC");
  const [txHashInput, setTxHashInput] = useState("");
  const [paystackRefInput, setPaystackRefInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);

  const BSC_USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
  const BASE_USDT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

  const fetchUser = async () => {
    try {
      setLoadingUser(true);
      const res = await fetch("/api/auth");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleOpenUpgrade = (plan: "PRO" | "PREMIUM") => {
    setSelectedPlan(plan);
    setTxHashInput("");
    setPaystackRefInput("");
    setFeedbackMessage(null);
  };

  const handleCopyWallet = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  const handleVerifyPayment = async () => {
    if (!selectedPlan) return;
    if (!user) {
      setFeedbackMessage({
        type: "error",
        text: "Please sign in or create an account first before upgrading.",
      });
      return;
    }

    setIsVerifying(true);
    setFeedbackMessage(null);

    try {
      const isCrypto = regionTab === "GLOBAL";
      const payload = isCrypto
        ? {
            plan: selectedPlan,
            payment_method: "CRYPTO",
            network: cryptoNetwork,
            tx_hash: txHashInput.trim(),
            currency: "USDT",
          }
        : {
            plan: selectedPlan,
            payment_method: "PAYSTACK",
            payment_ref: paystackRefInput.trim(),
            currency: "NGN",
          };

      const res = await fetch("/api/subscriptions/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedbackMessage({
          type: "error",
          text: data.error || "Verification failed. Check reference or hash.",
        });
        return;
      }

      setFeedbackMessage({
        type: "success",
        text: data.message || "Subscription activated successfully!",
      });

      // Refresh user state
      await fetchUser();
    } catch (err: unknown) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Network error during verification",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      {/* Top Header */}
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
              Scholastic Tier Subscriptions
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/bounty"
            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold transition-colors"
          >
            <span>Sunday Bounty</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/studio"
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-slate-100 transition-colors"
          >
            <span>Stress Studio</span>
          </Link>
          {user && (
            <div className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs flex items-center gap-2">
              <span className="text-slate-300 font-medium">{user.display_name}</span>
              <span className="bg-amber-400 text-slate-950 font-black px-1.5 py-0.2 rounded text-[10px]">
                {user.tier}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto w-full px-4 pt-8 space-y-10">
        {/* Hero Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs text-amber-300">
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>30% of Every Subscription Funds the Sunday Scholar Prize Pool</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-100">
            Empower Your Mind. <span className="text-amber-400">Fund Global Truth.</span>
          </h2>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
            Annual access to rigorous AI refereeing, stress-test studio scans, and Pre-Flight VAR analysis. Zero recurring subscription traps.
          </p>

          {/* Regional Currency Toggle */}
          <div className="pt-4 flex justify-center">
            <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 inline-flex items-center gap-1 shadow-inner">
              <button
                type="button"
                onClick={() => setRegionTab("AFRICA")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  regionTab === "AFRICA"
                    ? "bg-amber-400 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Nigeria & Africa (Paystack NGN)</span>
              </button>
              <button
                type="button"
                onClick={() => setRegionTab("GLOBAL")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  regionTab === "GLOBAL"
                    ? "bg-amber-400 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Global / Crypto (USDT BEP-20 / Base)</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3 Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* FREE TIER */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Novice</span>
                <h3 className="text-2xl font-black text-slate-100 mt-1">Free Tier</h3>
                <p className="text-xs text-slate-400 mt-1">For curious seekers testing their arguments.</p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-100">
                  {regionTab === "AFRICA" ? "NGN 0" : "$0"}
                </span>
                <span className="text-xs text-slate-400">/ year</span>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-300 pt-3 border-t border-slate-800/80">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>3 Arena Debates</strong> per month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>1 Sermon/Essay Scan</strong> per month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Standard AI refereeing & logical fallacies</span>
                </li>
                <li className="flex items-center gap-2 text-slate-500">
                  <span className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[10px]">✕</span>
                  <span>No Pre-Flight VAR check</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <span className="block text-center w-full py-2.5 rounded-xl text-xs font-bold bg-slate-800/80 text-slate-400">
                {user?.tier === "FREE" || !user ? "Current Plan" : "Included"}
              </span>
            </div>
          </div>

          {/* PRO TIER */}
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-6 flex flex-col justify-between space-y-6 relative shadow-xl shadow-amber-950/20">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full shadow-md">
              Most Popular
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Scholar</span>
                <h3 className="text-2xl font-black text-slate-100 mt-1">Pro Tier</h3>
                <p className="text-xs text-slate-400 mt-1">
                  For active debaters, pastors, apologists, and philosophy students.
                </p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-amber-400">
                  {regionTab === "AFRICA" ? "NGN 4,500" : "$3"}
                </span>
                <span className="text-xs text-slate-400">/ year</span>
                {regionTab === "GLOBAL" && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-1.5 py-0.5 rounded ml-1">
                    Promo
                  </span>
                )}
              </div>

              <ul className="space-y-2.5 text-xs text-slate-300 pt-3 border-t border-slate-800/80">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>30 Arena Debates</strong> per month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>10 Sermon/Essay Scans</strong> per month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Full access to all 6 historical philosophical personas</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Priority arbitration queue</span>
                </li>
                <li className="flex items-center gap-2 text-slate-500">
                  <span className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[10px]">✕</span>
                  <span>No Pre-Flight VAR check</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleOpenUpgrade("PRO")}
                className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-amber-400/20"
              >
                {user?.tier === "PRO" ? "Current Tier (Extend 1 Yr)" : "Upgrade to Pro"}
              </button>
            </div>
          </div>

          {/* PREMIUM TIER */}
          <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-6 flex flex-col justify-between space-y-6 relative">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">Grandmaster</span>
                <h3 className="text-2xl font-black text-slate-100 mt-1">Premium Tier</h3>
                <p className="text-xs text-slate-400 mt-1">
                  For theological institutions, varsity disputants, and master researchers.
                </p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-100">
                  {regionTab === "AFRICA" ? "NGN 10,000" : "$7"}
                </span>
                <span className="text-xs text-slate-400">/ year</span>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-300 pt-3 border-t border-slate-800/80">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>100 Arena Debates</strong> per month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>50 Sermon/Essay Scans</strong> per month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-amber-300 font-bold">Pre-Flight VAR Check Included</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Private Hostile Q&A Simulation and Source Audit</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Sunday Scholar Bounty Grandmaster entry</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleOpenUpgrade("PREMIUM")}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all"
              >
                {user?.tier === "PREMIUM" ? "Current Tier (Extend 1 Yr)" : "Upgrade to Premium"}
              </button>
            </div>
          </div>
        </div>

        {/* Feature Comparison Matrix */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h4 className="font-extrabold text-base text-slate-200">Plan Comparison Matrix</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-mono text-[11px]">
                  <th className="py-2.5">Feature</th>
                  <th className="py-2.5">Free</th>
                  <th className="py-2.5 text-amber-400">Pro</th>
                  <th className="py-2.5 text-emerald-400">Premium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="py-3 font-medium">Debates Quota</td>
                  <td className="py-3">3 / month</td>
                  <td className="py-3 font-semibold text-amber-300">30 / month</td>
                  <td className="py-3 font-semibold text-emerald-400">100 / month</td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Studio Stress-Test Scans</td>
                  <td className="py-3">1 / month</td>
                  <td className="py-3 font-semibold text-amber-300">10 / month</td>
                  <td className="py-3 font-semibold text-emerald-400">50 / month</td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Pre-Flight VAR Turn Analysis</td>
                  <td className="py-3 text-slate-600">✕</td>
                  <td className="py-3 text-slate-600">✕</td>
                  <td className="py-3 text-emerald-400 font-bold">✓ Included</td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Anti-Cheat Keystroke Verification</td>
                  <td className="py-3">✓</td>
                  <td className="py-3">✓</td>
                  <td className="py-3">✓</td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Sunday Bounty Pool Contribution</td>
                  <td className="py-3 text-slate-600">—</td>
                  <td className="py-3 text-amber-400">30% ($0.90 USD)</td>
                  <td className="py-3 text-emerald-400">30% ($2.10 USD)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* UPGRADE MODAL */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-slate-100">
                  Upgrade to {selectedPlan} Tier
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="text-slate-400 hover:text-slate-200 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {regionTab === "AFRICA" ? (
              /* Paystack NGN Checkout */
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                  <div className="text-xs text-slate-400">Annual Investment:</div>
                  <div className="text-2xl font-black text-amber-400">
                    NGN {selectedPlan === "PRO" ? "4,500" : "10,000"}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Pay securely in Naira via Paystack card, bank transfer, or USSD.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Paystack Payment Reference:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. pstk_ref_9823487192"
                    value={paystackRefInput}
                    onChange={(e) => setPaystackRefInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-amber-400"
                  />
                  <p className="text-[10px] text-slate-500">
                    Enter the reference code generated upon successful checkout.
                  </p>
                </div>
              </div>
            ) : (
              /* Crypto USDT Checkout (BEP-20 / Base) */
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                  <div className="text-xs text-slate-400">Annual Investment:</div>
                  <div className="text-2xl font-black text-amber-400">
                    {selectedPlan === "PRO" ? "$3.00 USDT" : "$7.00 USDT"}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Direct on-chain deposit. Zero middlemen fees.
                  </p>
                </div>

                {/* Network Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">Select Network:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCryptoNetwork("BSC")}
                      className={`p-2.5 rounded-lg border text-xs font-bold transition-all ${
                        cryptoNetwork === "BSC"
                          ? "bg-amber-400/20 border-amber-400 text-amber-300"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      BNB Chain (BEP-20)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCryptoNetwork("BASE")}
                      className={`p-2.5 rounded-lg border text-xs font-bold transition-all ${
                        cryptoNetwork === "BASE"
                          ? "bg-amber-400/20 border-amber-400 text-amber-300"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      Base Network
                    </button>
                  </div>
                </div>

                {/* Deposit Address Box */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Send exactly {selectedPlan === "PRO" ? "$3 USDT" : "$7 USDT"} to:</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyWallet(cryptoNetwork === "BSC" ? BSC_USDT_ADDRESS : BASE_USDT_ADDRESS)
                      }
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
                    >
                      {copiedWallet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedWallet ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-slate-200 break-all select-all">
                    {cryptoNetwork === "BSC" ? BSC_USDT_ADDRESS : BASE_USDT_ADDRESS}
                  </div>
                </div>

                {/* Tx Hash Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Transaction Hash (tx_hash):
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={txHashInput}
                    onChange={(e) => setTxHashInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-mono outline-none focus:border-amber-400"
                  />
                  <p className="text-[10px] text-slate-500">
                    Replay-proof: Each blockchain hash can only be verified once.
                  </p>
                </div>
              </div>
            )}

            {feedbackMessage && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  feedbackMessage.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    : "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                }`}
              >
                {feedbackMessage.text}
              </div>
            )}

            <button
              type="button"
              onClick={handleVerifyPayment}
              disabled={isVerifying || (regionTab === "AFRICA" ? !paystackRefInput : !txHashInput)}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Transaction...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify & Activate {selectedPlan}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
