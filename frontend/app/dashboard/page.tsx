"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/genlayer/wallet";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { ProjectForm } from "@/components/ProjectForm";
import { ProjectCard } from "@/components/ProjectCard";
import { useProjects, usePendingProjects, useTreasury, useDonate } from "@/lib/hooks/useRPGF";
import { Loader2, LayoutGrid, Globe, Coins, ShieldAlert, PlusCircle } from "lucide-react";

export default function Dashboard() {
  const { isConnected, address, isLoading: walletLoading } = useWallet();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<"SUBMIT" | "MY_PROJECTS" | "GLOBAL" | "TREASURY">("SUBMIT");
  const [donateAmount, setDonateAmount] = useState("");

  const { data: onChainProjects = [], isLoading: projectsLoading } = useProjects();
  const { data: pendingProjects = [], isLoading: pendingLoading } = usePendingProjects();
  const { data: treasuryBalance = 0, isLoading: treasuryLoading } = useTreasury();
  const { mutate: donate, isPending: isDonating } = useDonate();

  useEffect(() => {
    if (!walletLoading && !isConnected) {
      router.push("/");
    }
  }, [isConnected, walletLoading, router]);

  if (walletLoading || !isConnected) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  // Merge pending and finalized projects (filtering out pending ones that are already finalized)
  const finalizedUrls = new Set(onChainProjects.map(p => p.url));
  const activePendingProjects = pendingProjects.filter(p => !finalizedUrls.has(p.url));
  const allProjects = [...activePendingProjects, ...onChainProjects].sort((a, b) => (b.id || 0) - (a.id || 0));
  const myProjects = allProjects.filter(p => p.submitter.toLowerCase() === address?.toLowerCase());

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
              <p className="text-white font-mono text-sm truncate">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
            </div>

            {/* Navigation Tabs */}
            <nav className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-row md:flex-col gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <button 
                onClick={() => setActiveTab("SUBMIT")}
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
                onClick={() => setActiveTab("SUBMIT")}
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
                  <h2 className="text-2xl font-bold text-white mb-6">Submit a Project</h2>
                  <ProjectForm />
                </div>
              </div>
            )}

            {activeTab === "MY_PROJECTS" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">My Submissions</h2>
                  {(projectsLoading || pendingLoading) ? (
                    <div className="h-40 flex items-center justify-center border border-white/10 rounded-2xl">
                      <Loader2 className="w-6 h-6 animate-spin text-white/40" />
                    </div>
                  ) : myProjects.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center border border-white/10 rounded-2xl bg-white/5">
                      <p className="text-white/50">You haven't submitted any projects yet.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {myProjects.map((p, i) => <ProjectCard key={p.txHash || p.id || i} project={p} />)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "GLOBAL" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white">Global Submissions</h2>
                  <span className="bg-white/10 px-3 py-1 rounded-full text-sm font-medium">
                    {allProjects.length} Projects
                  </span>
                </div>
                
                {(projectsLoading || pendingLoading) ? (
                   <div className="h-64 flex items-center justify-center border border-white/10 rounded-2xl">
                     <Loader2 className="w-6 h-6 animate-spin text-white/40" />
                   </div>
                ) : allProjects.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center border border-white/10 rounded-2xl bg-white/5">
                    <Globe className="w-12 h-12 text-white/20 mb-4" />
                    <p className="text-white/50">No projects have been submitted yet.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {allProjects.map((p, i) => <ProjectCard key={p.txHash || p.id || i} project={p} />)}
                  </div>
                )}
              </div>
            )}

            {activeTab === "TREASURY" && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 border border-white/10 rounded-3xl p-8 md:p-12 text-center">
                  <h2 className="text-lg font-medium text-white/60 mb-2">Total Treasury Balance</h2>
                  <p className="text-5xl md:text-7xl font-bold text-white mb-8">
                    {treasuryLoading ? <Loader2 className="w-10 h-10 animate-spin mx-auto text-white/40" /> : `${treasuryBalance} GEN`}
                  </p>
                  
                  <div className="max-w-md mx-auto bg-black/40 rounded-2xl p-6 backdrop-blur-md border border-white/5">
                    <h3 className="text-white font-medium mb-4">Donate to Public Goods</h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input 
                        type="number" 
                        value={donateAmount}
                        onChange={(e) => setDonateAmount(e.target.value)}
                        placeholder="Amount in GEN"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                      />
                      <button 
                        onClick={() => {
                          if (donateAmount && !isNaN(Number(donateAmount))) {
                            donate(Number(donateAmount));
                          }
                        }}
                        disabled={isDonating || !donateAmount}
                        className="px-6 py-3 bg-white text-black font-bold rounded-xl disabled:opacity-50 transition-all hover:bg-white/90 w-full sm:w-auto"
                      >
                        {isDonating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Donate"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-yellow-500/20 rounded-2xl p-6 flex gap-4">
                  <ShieldAlert className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                  <p className="text-white/70 text-sm leading-relaxed">
                    <strong>Treasury Rules:</strong> Verifond ensures fair distribution. No single project can claim more than 5% of the total treasury balance. By donating, you are funding the decentralization of the web autonomously through GenLayer AI consensus.
                  </p>
                </div>
              </div>
            )}

          </section>
        </div>
      </main>
    </div>
  );
}
