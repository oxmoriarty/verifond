"use client";

import { useState } from "react";
import { useWallet } from "@/lib/genlayer/wallet";
import { useVerifyAccount } from "@/lib/hooks/useProofOracle";
import { Loader2, Copy, Check, ShieldCheck, Github } from "lucide-react";

export function VerificationGate() {
  const { address } = useWallet();
  const { mutate: verifyAccount, isPending } = useVerifyAccount();
  
  const [profileUrl, setProfileUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (profileUrl) {
      verifyAccount({ platform: "github", profileUrl });
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-10 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
          <ShieldCheck className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Verify Your Identity</h2>
          <p className="text-white/60 text-sm">You must link your GitHub to prevent Sybil attacks.</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Step 1 */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-white text-xs font-bold">1</span>
            <h3 className="text-white font-medium">Copy your Wallet Address</h3>
          </div>
          <div className="ml-9 bg-black/40 border border-white/10 rounded-xl p-4 flex items-center justify-between group hover:border-white/20 transition-colors">
            <code className="text-white/80 font-mono text-sm">{address}</code>
            <button 
              onClick={handleCopy}
              className="text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all"
            >
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Step 2 */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-white text-xs font-bold">2</span>
            <h3 className="text-white font-medium">Paste it in your GitHub Bio</h3>
          </div>
          <p className="ml-9 text-sm text-white/50 leading-relaxed">
            Go to your GitHub profile settings and paste your wallet address anywhere in your public bio. 
            The ProofOracle AI will securely scan it to verify ownership.
          </p>
        </div>

        {/* Step 3 */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold border border-blue-500/30">3</span>
            <h3 className="text-white font-medium">Verify via ProofOracle</h3>
          </div>
          
          <form onSubmit={handleVerify} className="ml-9 space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Github className="w-5 h-5 text-white/30" />
              </div>
              <input 
                type="url" 
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                placeholder="https://github.com/yourusername"
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
                required
              />
            </div>
            
            <button 
              type="submit"
              disabled={isPending || !profileUrl}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-white/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>GenLayer AI is scanning...</span>
                </>
              ) : (
                "Verify Identity & Unlock Submissions"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
