"use client";

import { useEffect, useState, useRef } from "react";
import { useWallet } from "@/lib/genlayer/wallet";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { ProjectForm } from "@/components/ProjectForm";
import { ProjectCard } from "@/components/ProjectCard";
import { useProjects, usePendingProjects, useTreasury, useTreasuryDetails, useDonate, useCheckLinkedGithub, useLinkedIdentity, usePendingVerification, Project, unifyProjects } from "@/lib/hooks/useRPGF";
import { Loader2, LayoutGrid, Globe, Coins, ShieldAlert, PlusCircle, Check, X, Github, CheckCircle2, Wallet, Lock, Sparkles, ShieldCheck, Heart } from "lucide-react";

export default function Dashboard() {
  const { isConnected, address, isLoading: walletLoading } = useWallet();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<"MY_PROJECTS" | "SUBMIT" | "GLOBAL" | "TREASURY">("MY_PROJECTS");
  const [myProjectsTab, setMyProjectsTab] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED" | "FAILED">("ALL");
  const [donateAmount, setDonateAmount] = useState("");

  const { data: onChainProjects = [], isLoading: projectsLoading } = useProjects();
  const { data: pendingProjects = [], isLoading: pendingLoading } = usePendingProjects();
  const { data: treasuryBalance = 0, isLoading: treasuryLoading } = useTreasury();
  const { data: treasuryDetails, isLoading: detailsLoading } = useTreasuryDetails();
  const { mutate: donate, isPending: isDonating } = useDonate();

  const { data: linkedGithub, isLoading: isCheckingGithub } = useCheckLinkedGithub();
  const { data: linkedIdentity } = useLinkedIdentity();
  const { data: pendingVerification, isLoading: isCheckingPending } = usePendingVerification();

  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [showFailedScreen, setShowFailedScreen] = useState(false);
  
  // Track previous pending state to detect success transitions
  const prevPendingRef = useRef(pendingVerification);
  
  useEffect(() => {
    if (!isCheckingPending) {
      const wasPending = !!prevPendingRef.current;
      const isPendingNow = !!pendingVerification;
      
      // If pending verification disappeared completely (was deleted from Supabase), it means Genlayer returned success!
      if (wasPending && !isPendingNow && prevPendingRef.current?.status !== 'Failed') {
        setShowSuccessScreen(true);
      }
      
      prevPendingRef.current = pendingVerification;
    }
  }, [pendingVerification, isCheckingPending]);

  useEffect(() => {
    if (!walletLoading && !isConnected) {
      router.push("/");
    }
  }, [isConnected, walletLoading, router]);

  if (walletLoading || !isConnected || isCheckingGithub) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  // Unify and deduplicate all projects (by repo and name) into single representations with correct status & attempt limits
  const unifiedProjects = unifyProjects(pendingProjects, onChainProjects);
  const myProjects = unifiedProjects.filter(p => p.submitter?.toLowerCase() === address?.toLowerCase());
  const globalProjects = unifiedProjects.filter(p => (p.id && p.id > 0) || p.status === "Approved" || p.status === "Rejected");

  return (
    <div className="min-h-screen bg-[#050505] relative selection:bg-white/20 selection:text-white">
      <Navbar />

      <main className="pt-32 pb-16 px-6 md:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          
          {/* Left Sidebar - Navigation & Submission */}
          <aside className="w-full md:w-80 flex-shrink-0 space-y-6 md:sticky md:top-32">
            
            {/* User Card */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <p className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-2">Connected Wallet</p>
              <p className="text-white font-mono text-sm truncate mb-4">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
              <p className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-2 flex items-center justify-between">
                Linked GitHub
                {!linkedGithub && !pendingVerification && (
                  <Link href="/onboarding" className="text-blue-400 hover:text-blue-300 transition-colors underline decoration-blue-500/30 underline-offset-2">
                    Verify Now
                  </Link>
                )}
              </p>
              <div className="text-white font-mono text-sm flex flex-col gap-1.5">
                {linkedGithub ? (
                  <>
                    <div className="flex items-center gap-2 truncate">
                      <Github className="w-4 h-4 text-white/70 flex-shrink-0" />
                      <a 
                        href={linkedIdentity?.canonical_url || `https://github.com/${linkedGithub}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:underline truncate text-white"
                        title={linkedIdentity?.canonical_url || `https://github.com/${linkedGithub}`}
                      >
                        @{linkedIdentity?.handle || linkedGithub}
                      </a>
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    </div>
                    {linkedIdentity?.github_id && Number(linkedIdentity.github_id) > 0 ? (
                      <span className="text-[11px] text-white/50 font-mono">
                        GitHub User ID: #{linkedIdentity.github_id}
                      </span>
                    ) : null}
                  </>
                ) : pendingVerification && pendingVerification.status !== 'Failed' ? (
                  <Link href="/onboarding" className="text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    Verification Pending...
                  </Link>
                ) : (
                  <span className="text-white/40">Not Linked</span>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-row md:flex-col gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <button 
                onClick={() => {
                  setActiveTab("SUBMIT");
                  setShowSuccessScreen(false);
                  setShowFailedScreen(false);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all flex-shrink-0 ${activeTab === "SUBMIT" ? "bg-white/10 text-white font-semibold" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
              >
                <PlusCircle className="w-5 h-5 flex-shrink-0" />
                Submit Project
              </button>
              <button 
                onClick={() => setActiveTab("MY_PROJECTS")}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all flex-shrink-0 ${activeTab === "MY_PROJECTS" ? "bg-white/10 text-white font-semibold" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
              >
                <LayoutGrid className="w-5 h-5 flex-shrink-0" />
                My Submissions
              </button>
              <button 
                onClick={() => setActiveTab("GLOBAL")}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all flex-shrink-0 ${activeTab === "GLOBAL" ? "bg-white/10 text-white font-semibold" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
              >
                <Globe className="w-5 h-5 flex-shrink-0" />
                Global Submissions
              </button>
              <button 
                onClick={() => setActiveTab("TREASURY")}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all flex-shrink-0 ${activeTab === "TREASURY" ? "bg-white/10 text-white font-semibold" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
              >
                <Coins className="w-5 h-5 flex-shrink-0" />
                Treasury Pool
              </button>
            </nav>

            {/* Submit Project CTA */}
            {activeTab !== "SUBMIT" && (
              <button 
                onClick={() => {
                  setActiveTab("SUBMIT");
                  setShowSuccessScreen(false);
                  setShowFailedScreen(false);
                }}
                className="w-full py-4 bg-white text-black rounded-xl font-bold transition-all hover:bg-white/90"
              >
                Submit New Project
              </button>
            )}
          </aside>

          {/* Main Content Area */}
          <section className="flex-1 w-full space-y-6">
            
            {activeTab === "SUBMIT" && (
              <div className="space-y-8">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8">
                  {showSuccessScreen ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
                        <Check className="w-8 h-8 text-green-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">Verification Successful!</h3>
                      <p className="text-white/60 max-w-md mb-8">
                        Your wallet is verified and now securely linked to github.com/{linkedGithub}.
                      </p>
                      <button 
                        onClick={() => setShowSuccessScreen(false)}
                        className="px-8 py-3 bg-white text-black rounded-xl font-bold transition-all hover:bg-white/90"
                      >
                        Submit Project
                      </button>
                    </div>
                  ) : showFailedScreen || pendingVerification?.status === 'Failed' ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
                        <X className="w-8 h-8 text-red-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">Verification Failed</h3>
                      <p className="text-white/60 max-w-md mb-8">
                        We couldn't verify your identity. Please make sure your wallet address is exactly placed in your public GitHub bio and try again.
                      </p>
                      <Link 
                        href="/onboarding" 
                        onClick={() => setShowFailedScreen(false)}
                        className="px-8 py-3 bg-white text-black rounded-xl font-bold transition-all hover:bg-white/90"
                      >
                        Verify Again
                      </Link>
                    </div>
                  ) : linkedGithub ? (
                    <>
                      <h2 className="text-2xl font-bold text-white mb-6">Submit a Project</h2>
                      <ProjectForm />
                    </>
                  ) : pendingVerification && pendingVerification.status !== 'Failed' ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-6">
                        <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">Verification Pending...</h3>
                      <p className="text-white/60 max-w-md">
                        Please wait while we link and verify your Github account. You will be able to submit projects once verified.
                      </p>
                    </div>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-6">
                        <ShieldAlert className="w-8 h-8 text-blue-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">Developer Verification Required</h3>
                      <p className="text-white/60 max-w-md mb-8">
                        To submit projects for retroactive funding, you must first verify your identity by securely linking your GitHub account.
                      </p>
                      <Link href="/onboarding" className="px-8 py-3 bg-white text-black rounded-xl font-bold transition-all hover:bg-white/90">
                        Verify GitHub Account
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "MY_PROJECTS" && (
              <div className="space-y-8">
                <div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-xl font-bold text-white">My Submissions</h2>
                    
                    {/* Sub-tabs for filtering */}
                    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto scrollbar-hide">
                      {["ALL", "PENDING", "APPROVED", "REJECTED", "FAILED"].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setMyProjectsTab(tab as any)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                            myProjectsTab === tab 
                              ? "bg-white/10 text-white shadow-sm" 
                              : "text-white/50 hover:text-white/80 hover:bg-white/5"
                          }`}
                        >
                          {tab === "APPROVED" ? "Accepted" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(projectsLoading || pendingLoading) ? (
                    <div className="h-40 flex items-center justify-center border border-white/10 rounded-2xl">
                      <Loader2 className="w-6 h-6 animate-spin text-white/40" />
                    </div>
                  ) : (() => {
                    const filteredMyProjects = myProjects.filter(p => {
                      if (myProjectsTab === "ALL") return true;
                      if (myProjectsTab === "PENDING") return p.status === "Pending";
                      if (myProjectsTab === "APPROVED") return p.status === "Approved";
                      if (myProjectsTab === "REJECTED") return p.status === "Rejected";
                      if (myProjectsTab === "FAILED") return p.status === "Failed";
                      return true;
                    });
                    
                    return filteredMyProjects.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center border border-white/10 rounded-2xl bg-white/5">
                        <p className="text-white/50">
                          {myProjectsTab === "ALL" 
                            ? "You haven't submitted any projects yet." 
                            : `You have no ${myProjectsTab.toLowerCase()} projects.`}
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {filteredMyProjects.map((p, i) => <ProjectCard key={p.txHash || p.id || i} project={p} />)}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {activeTab === "GLOBAL" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white">Global Submissions</h2>
                  <span className="bg-white/10 px-3 py-1 rounded-full text-sm font-medium">
                    {globalProjects.length} Projects
                  </span>
                </div>
                
                {projectsLoading ? (
                   <div className="h-64 flex items-center justify-center border border-white/10 rounded-2xl">
                     <Loader2 className="w-6 h-6 animate-spin text-white/40" />
                   </div>
                ) : globalProjects.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center border border-white/10 rounded-2xl bg-white/5">
                    <Globe className="w-12 h-12 text-white/20 mb-4" />
                    <p className="text-white/60">No verified projects have been evaluated yet.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {globalProjects.map((p, i) => <ProjectCard key={p.txHash || p.id || i} project={p} />)}
                  </div>
                )}
              </div>
            )}

            {activeTab === "TREASURY" && (() => {
              const totalTreasury = treasuryDetails?.totalTreasury ?? treasuryBalance;
              const totalReserved = treasuryDetails?.totalReserved ?? 0;
              const availableTreasury = treasuryDetails?.availableTreasury ?? Math.max(0, totalTreasury - totalReserved);

              const isLoadingTreasury = detailsLoading || treasuryLoading;

              const formatGen = (val: number) => {
                if (isNaN(val)) return "0";
                return Number.isInteger(val)
                  ? val.toLocaleString()
                  : val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
              };

              // Solvency breakdown percentages
              const reservedPercent = totalTreasury > 0 
                ? Math.min(100, Math.max(0, (totalReserved / totalTreasury) * 100)) 
                : 0;
              const availablePercent = totalTreasury > 0 
                ? Math.min(100, Math.max(0, (availableTreasury / totalTreasury) * 100)) 
                : 100;

              return (
                <div className="space-y-8 animate-in fade-in duration-300">
                  {/* Header Title & Context */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Coins className="w-6 h-6 text-amber-400" />
                        Treasury Pool & Solvency
                      </h2>
                      <p className="text-white/50 text-sm mt-1">
                        Real-time on-chain tracking of VeriFund's public goods endowment, solvency reservations, and liquid allocations.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 text-xs text-white/70 font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      On-Chain Solvency Active
                    </div>
                  </div>

                  {/* 3 Sleek Metric Cards: Total Treasury, Reserved Balance, Available Balance */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Card 1: Total Treasury Balance */}
                    <div className="relative overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.07] group">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-white/50 flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-blue-400" />
                          Total Treasury Balance
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Total Vault
                        </span>
                      </div>
                      <div className="text-3xl lg:text-4xl font-black text-white tracking-tight mb-2">
                        {isLoadingTreasury ? (
                          <Loader2 className="w-8 h-8 animate-spin text-white/40" />
                        ) : (
                          `${formatGen(totalTreasury)} GEN`
                        )}
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">
                        Total funds deposited in the contract pool from donations and seed grants.
                      </p>
                      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-white/50">
                        <span>Contract Holdings</span>
                        <span className="text-white/80 font-mono">100% of Base</span>
                      </div>
                    </div>

                    {/* Card 2: Reserved Treasury Balance */}
                    <div className="relative overflow-hidden bg-white/5 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-6 transition-all duration-300 hover:border-amber-500/40 hover:bg-amber-500/[0.04] group shadow-[0_0_25px_rgba(245,158,11,0.05)]">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400/80 flex items-center gap-2">
                          <Lock className="w-4 h-4 text-amber-400" />
                          Reserved Treasury Balance
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Locked Liabilities
                        </span>
                      </div>
                      <div className="text-3xl lg:text-4xl font-black text-amber-400 tracking-tight mb-2">
                        {isLoadingTreasury ? (
                          <Loader2 className="w-8 h-8 animate-spin text-amber-400/50" />
                        ) : (
                          `${formatGen(totalReserved)} GEN`
                        )}
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">
                        Locked and guaranteed on-chain for approved projects awaiting developer claim.
                      </p>
                      <div className="mt-4 pt-4 border-t border-amber-500/10 flex items-center justify-between text-xs text-white/50">
                        <span>Allocation Commitment</span>
                        <span className="text-amber-400 font-mono">{reservedPercent.toFixed(1)}% of Pool</span>
                      </div>
                    </div>

                    {/* Card 3: Available Treasury Balance (Unreserved) */}
                    <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/[0.08] to-teal-500/[0.03] backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-6 transition-all duration-300 hover:border-emerald-500/50 hover:bg-emerald-500/[0.1] group shadow-[0_0_30px_rgba(16,185,129,0.08)]">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-emerald-400" />
                          Available Treasury Balance
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          Unreserved Pool
                        </span>
                      </div>
                      <div className="text-3xl lg:text-4xl font-black text-emerald-400 tracking-tight mb-2">
                        {isLoadingTreasury ? (
                          <Loader2 className="w-8 h-8 animate-spin text-emerald-400/50" />
                        ) : (
                          `${formatGen(availableTreasury)} GEN`
                        )}
                      </div>
                      <p className="text-xs text-emerald-100/60 leading-relaxed">
                        Liquid, unencumbered funds ready for immediate evaluation and allocation to new projects.
                      </p>
                      <div className="mt-4 pt-4 border-t border-emerald-500/20 flex items-center justify-between text-xs text-white/50">
                        <span>Liquid Allocation Rate</span>
                        <span className="text-emerald-400 font-mono font-semibold">{availablePercent.toFixed(1)}% Available</span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Solvency Allocation Bar */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        Pool Allocation & Solvency Breakdown
                      </h3>
                      <div className="flex items-center gap-4 text-xs font-mono">
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                          Reserved: {formatGen(totalReserved)} GEN ({reservedPercent.toFixed(1)}%)
                        </span>
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                          Available: {formatGen(availableTreasury)} GEN ({availablePercent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar Track */}
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex p-0.5">
                      <div 
                        style={{ width: `${totalTreasury > 0 ? reservedPercent : 0}%` }}
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-l-full transition-all duration-500"
                        title={`Reserved: ${formatGen(totalReserved)} GEN`}
                      />
                      <div 
                        style={{ width: `${totalTreasury > 0 ? availablePercent : 100}%` }}
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-r-full transition-all duration-500"
                        title={`Available: ${formatGen(availableTreasury)} GEN`}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between text-[11px] text-white/40">
                      <span>Total: {formatGen(totalTreasury)} GEN</span>
                      <span>100% Solvency Backed on GenLayer</span>
                    </div>
                  </div>

                  {/* Donate to Public Goods Section */}
                  <div className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8">
                    <div className="max-w-xl mx-auto text-center space-y-4">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/80 font-medium">
                        <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                        Community Public Goods Funding
                      </div>
                      <h3 className="text-2xl font-bold text-white">Donate to the VeriFund Treasury</h3>
                      <p className="text-white/60 text-sm leading-relaxed">
                        Empower open-source builders. All donated GEN tokens are transparently held in the RPGF smart contract and distributed to verified public goods via AI validator consensus.
                      </p>

                      {/* Quick preset chips */}
                      <div className="flex items-center justify-center gap-2 pt-2">
                        {[10, 25, 50, 100].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setDonateAmount(preset.toString())}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                              donateAmount === preset.toString()
                                ? "bg-white text-black font-bold"
                                : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            +{preset} GEN
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <div className="relative flex-1">
                          <input 
                            type="number" 
                            value={donateAmount}
                            onChange={(e) => setDonateAmount(e.target.value)}
                            placeholder="Enter amount in GEN"
                            min="1"
                            step="any"
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-16 py-3.5 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-all font-mono"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40 font-mono pointer-events-none">
                            GEN
                          </span>
                        </div>
                        <button 
                          onClick={() => {
                            if (donateAmount && !isNaN(Number(donateAmount))) {
                              donate(Number(donateAmount));
                            }
                          }}
                          disabled={isDonating || !donateAmount || Number(donateAmount) <= 0}
                          className="px-8 py-3.5 bg-white text-black font-bold rounded-xl disabled:opacity-50 transition-all hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto flex items-center justify-center gap-2 shadow-lg shadow-white/10"
                        >
                          {isDonating ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Confirming...</span>
                            </>
                          ) : (
                            <>
                              <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                              <span>Donate GEN</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Solvency Guarantee Notice */}
                  <div className="bg-white/5 border border-emerald-500/20 rounded-2xl p-6 flex items-start gap-4">
                    <ShieldAlert className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-white font-semibold text-sm">
                        Treasury Solvency Guarantee
                      </p>
                      <p className="text-white/60 text-xs md:text-sm leading-relaxed">
                        When a project is evaluated and approved, its funding allocation is immediately transferred into the <strong>Reserved Treasury Balance</strong> on-chain. This guarantees solvency and ensures approved projects are fully protected before authors claim their rewards.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

          </section>
        </div>
      </main>
    </div>
  );
}
