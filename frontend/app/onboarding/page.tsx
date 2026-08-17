"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/genlayer/wallet";
import { useCheckLinkedGithub, useVerifyGithub, usePendingVerification } from "@/lib/hooks/useRPGF";
import { Navbar } from "@/components/Navbar";
import { Loader2, Github, Copy, Check, ArrowRight } from "lucide-react";

export default function Onboarding() {
  const { isConnected, address, isLoading: walletLoading } = useWallet();
  const router = useRouter();
  
  const { data: linkedGithub, isLoading: isCheckingGithub } = useCheckLinkedGithub();
  const { data: pendingVerification, isLoading: isCheckingPending } = usePendingVerification();
  const { mutate: verifyGithub, isPending: isVerifying } = useVerifyGithub();

  const [githubUrl, setGithubUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!walletLoading && !isConnected) {
      router.push("/");
    }
  }, [isConnected, walletLoading, router]);

  useEffect(() => {
    // If already verified or verification is pending, redirect to dashboard
    if (linkedGithub || pendingVerification) {
      router.push("/dashboard");
    }
  }, [linkedGithub, pendingVerification, router]);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl) return;
    verifyGithub(githubUrl);
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (walletLoading || isCheckingGithub || isCheckingPending) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white selection:bg-white/30 font-sans pb-24 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1a1a1a] via-[#050505] to-[#050505] -z-10" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute top-0 left-1/4 right-1/4 h-[300px] bg-white/5 blur-[120px] rounded-full -z-10" />

      <Navbar />

      <div className="max-w-2xl mx-auto px-6 mt-32 relative z-10">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
          
          <div className="flex items-center justify-center w-16 h-16 bg-white/10 rounded-full mb-8 border border-white/10 mx-auto">
            <Github className="w-8 h-8 text-white" />
          </div>

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-4 tracking-tight">Verify Your Identity</h1>
            <p className="text-white/60 leading-relaxed text-lg">
              To submit projects for RPGF funding, we need to permanently link your GitHub account to your wallet on-chain.
            </p>
          </div>

          <div className="space-y-8">
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

            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10 font-mono text-sm">2</div>
                <div className="w-full">
                  <h3 className="font-semibold text-lg mb-2">Submit your Profile URL</h3>
                  <p className="text-sm text-white/60 mb-4">
                    Paste the link to your GitHub profile so our AI consensus can verify it.
                  </p>
                  <form onSubmit={handleVerify} className="space-y-4">
                    <div>
                      <input
                        type="url"
                        value={githubUrl}
                        onChange={(e) => setGithubUrl(e.target.value)}
                        placeholder="https://github.com/username"
                        required
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isVerifying || !githubUrl}
                      className="w-full bg-white text-black py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isVerifying ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          Verify and Link
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
          
          <p className="text-center text-sm text-white/40 mt-8">
            You can remove your wallet address from your bio immediately after verification completes.
          </p>

        </div>
      </div>
    </main>
  );
}
