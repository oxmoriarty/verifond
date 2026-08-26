"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/lib/genlayer/wallet";
import { useCheckLinkedGithub, useVerifyGithub, usePendingVerification } from "@/lib/hooks/useRPGF";
import { Navbar } from "@/components/Navbar";
import { Loader2, Github, Copy, Check, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";

export default function Onboarding() {
  const { isConnected, address, isLoading: walletLoading } = useWallet();
  const router = useRouter();
  
  const { data: linkedGithub, isLoading: isCheckingGithub } = useCheckLinkedGithub();
  const { data: pendingVerification, isLoading: isCheckingPending } = usePendingVerification();
  const { mutate: verifyGithub, isPending: isVerifying, isError: isVerifyError, reset: resetVerify } = useVerifyGithub();

  const [githubUrl, setGithubUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);

  const prevPendingRef = useRef(pendingVerification);

  // Detect when pending verification completes or fails
  useEffect(() => {
    if (!isCheckingPending && !isCheckingGithub) {
      const wasPending = !!prevPendingRef.current;
      const isPendingNow = !!pendingVerification;
      const isLinkedNow = !!linkedGithub;

      if (wasPending && !isPendingNow && !isLinkedNow) {
        setVerificationFailed(true);
      }
      prevPendingRef.current = pendingVerification;
    }
  }, [pendingVerification, linkedGithub, isCheckingPending, isCheckingGithub]);

  useEffect(() => {
    if (!walletLoading && !isConnected) {
      router.push("/");
    }
  }, [isConnected, walletLoading, router]);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl) return;
    setVerificationFailed(false);
    verifyGithub(githubUrl);
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearPending = async () => {
    if (!address) return;
    try {
      await fetch(`/api/pending-verifications?wallet=${address}`, { method: 'DELETE' });
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  };

  if (walletLoading || isCheckingGithub || isCheckingPending) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  const isPending = isVerifying || !!pendingVerification;
  const isVerified = !!linkedGithub;
  const isFailed = verificationFailed || isVerifyError;

  return (
    <main className="min-h-screen bg-[#050505] text-white selection:bg-white/30 font-sans pb-24 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1a1a1a] via-[#050505] to-[#050505] -z-10" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute top-0 left-1/4 right-1/4 h-[300px] bg-white/5 blur-[120px] rounded-full -z-10" />

      <Navbar />

      <div className="max-w-2xl mx-auto px-6 mt-32 relative z-10">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
          
          {/* Header Icon */}
          <div className="flex items-center justify-center w-16 h-16 bg-white/10 rounded-full mb-8 border border-white/10 mx-auto">
            {isVerified ? (
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            ) : isPending ? (
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            ) : (
              <Github className="w-8 h-8 text-white" />
            )}
          </div>

          {/* Title & Description */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-4 tracking-tight">
              {isVerified ? "GitHub Identity Verified" : "Verify Your Identity"}
            </h1>
            <p className="text-white/60 leading-relaxed text-lg">
              {isVerified 
                ? "Your GitHub profile is securely linked to your wallet on-chain." 
                : "To submit projects for RPGF funding, link your GitHub account to your wallet."}
            </p>
          </div>

          {/* STATE 1: VERIFIED SUCCESS CARD */}
          {isVerified ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-8 text-center space-y-6">
              <div className="space-y-2">
                <span className="bg-green-500/20 text-green-300 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                  Verified as @{linkedGithub}
                </span>
                <h2 className="text-2xl font-bold text-white pt-2">Your GitHub is verified!</h2>
                <p className="text-white/70 text-sm max-w-md mx-auto">
                  You can now submit public good projects for GenLayer AI evaluation and public funding.
                </p>
              </div>
              
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="w-full py-4 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/90 transition-all shadow-lg"
                >
                  Submit a Project
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-8">

              {/* Step 1: Copy Wallet Address */}
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10 font-mono text-sm">1</div>
                  <div className="w-full">
                    <h3 className="font-semibold text-lg mb-2">Add wallet to GitHub Bio</h3>
                    <p className="text-sm text-white/60 mb-4">
                      Copy your wallet address and paste it anywhere in your public GitHub profile bio.
                    </p>
                    <div className="flex items-center gap-3 bg-black/50 border border-white/10 rounded-xl p-3">
                      <code className="text-sm text-white/80 font-mono truncate flex-1">
                        {address}
                      </code>
                      <button
                        onClick={handleCopy}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white flex-shrink-0"
                        title="Copy Address"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Form & Pending / Error Handling */}
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10 font-mono text-sm">2</div>
                  <div className="w-full">
                    <h3 className="font-semibold text-lg mb-2">Submit your Profile URL</h3>
                    <p className="text-sm text-white/60 mb-4">
                      Paste your GitHub profile link so GenLayer AI consensus can verify it.
                    </p>

                    {/* FAILED STATE ALERT */}
                    {isFailed && !isPending && (
                      <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
                        <div>
                          <p className="font-semibold">Verification was unsuccessful.</p>
                          <p className="text-xs text-red-300/80 mt-1">
                            Please make sure your wallet address is in your GitHub bio and try again.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* PENDING STATE BANNER */}
                    {isPending ? (
                      <div className="space-y-4">
                        <input
                          type="url"
                          value={pendingVerification?.profile_url || githubUrl}
                          disabled
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white/50 cursor-not-allowed"
                        />
                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                            <p className="text-xs text-amber-300 font-medium">
                              Verification Pending. You can leave this page while we verify.
                            </p>
                          </div>
                          <button
                            onClick={handleClearPending}
                            className="text-[11px] text-amber-400 hover:underline shrink-0"
                            title="Reset verification state"
                          >
                            Reset
                          </button>
                        </div>
                        <Link
                          href="/dashboard"
                          className="w-full py-3 bg-white/10 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-white/15 transition-all mt-2"
                        >
                          Go to Dashboard
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    ) : (
                      /* EDITABLE INPUT & SUBMIT BUTTON */
                      <form onSubmit={handleVerify} className="space-y-4">
                        <div>
                          <input
                            type="url"
                            value={githubUrl}
                            onChange={(e) => {
                              setGithubUrl(e.target.value);
                              if (isFailed) {
                                setVerificationFailed(false);
                                resetVerify();
                              }
                            }}
                            placeholder="https://github.com/username"
                            required
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!githubUrl}
                          className="w-full bg-white text-black py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Verify and Link
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </form>
                    )}

                  </div>
                </div>
              </div>

            </div>
          )}
          
          {!isVerified && !isPending && (
            <div className="flex flex-col items-center gap-6 mt-8">
              <p className="text-center text-sm text-white/40">
                You can remove your wallet address from your bio immediately after verification completes.
              </p>
              
              <Link 
                href="/dashboard" 
                className="text-sm font-medium text-white/50 hover:text-white transition-colors"
              >
                Skip for now
              </Link>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
