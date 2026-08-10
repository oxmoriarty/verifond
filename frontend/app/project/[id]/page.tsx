"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useWallet } from "@/lib/genlayer/wallet";
import { useProjects, usePendingProjects, useClaimFunds, Project } from "@/lib/hooks/useRPGF";
import { ExternalLink, ArrowLeft, ShieldCheck, CheckCircle2, Loader2, DollarSign, AlertCircle } from "lucide-react";

export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const identifier = resolvedParams.id;
  const router = useRouter();
  const { address } = useWallet();
  const { data: onChainProjects = [], isLoading: projectsLoading } = useProjects();
  const { data: pendingProjects = [], isLoading: pendingLoading } = usePendingProjects();
  const { mutate: claimFunds, isPending: isClaiming } = useClaimFunds();
  
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (projectsLoading || pendingLoading) return;
    
    // De-duplicate projects logic matching Dashboard
    const finalizedUrls = new Set(onChainProjects.map(p => p.url));
    const activePendingProjects = pendingProjects.filter(p => !finalizedUrls.has(p.url));
    const allProjects = [...activePendingProjects, ...onChainProjects];
    
    // Find project by ID or TxHash
    const foundProject = allProjects.find(
      p => p.id?.toString() === identifier || p.txHash === identifier
    );
    
    setProject(foundProject || null);
  }, [identifier, onChainProjects, pendingProjects, projectsLoading, pendingLoading]);

  if (projectsLoading || pendingLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Project Not Found</h1>
        <p className="text-white/50 mb-6">The project you are looking for does not exist or hasn't synced yet.</p>
        <button onClick={() => router.push("/dashboard")} className="px-6 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const isMyProject = address && project.submitter.toLowerCase() === address.toLowerCase();

  let statusColor = "bg-white/10 text-white/60 border-white/10";
  if (project.status === "Approved") statusColor = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (project.status === "Rejected") statusColor = "bg-red-500/20 text-red-400 border-red-500/30";
  if (project.status === "Pending") statusColor = "bg-blue-500/20 text-blue-400 border-blue-500/30";

  return (
    <div className="min-h-screen bg-[#050505] relative selection:bg-white/20 selection:text-white">
      <Navbar />

      <main className="pt-32 pb-16 px-6 md:px-8 max-w-5xl mx-auto">
        <button 
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl p-8 md:p-12 rounded-3xl">
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 border-b border-white/10 pb-8">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${statusColor}`}>
                  {project.status === "Pending" ? "Pending Review" : project.status}
                </span>
                {project.score > 0 && (
                  <span className="px-4 py-1.5 rounded-full bg-white/10 text-white/80 text-sm font-semibold border border-white/10">
                    Score: {project.score}/10
                  </span>
                )}
                {project.allocated_funds !== undefined && project.allocated_funds > 0 && (
                  <span className="px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-semibold border border-emerald-500/30">
                    Allocated: {project.allocated_funds} GEN
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-5xl font-black text-white mb-3">{project.name || "Unnamed Project"}</h1>
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-white flex items-center gap-2 transition-colors font-medium"
              >
                {project.url}
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Claim Funds Button */}
            {isMyProject && project.status === "Approved" && (
              <div className="flex flex-col items-start md:items-end w-full md:w-auto mt-4 md:mt-0">
                <button
                  onClick={() => claimFunds(project.id)}
                  disabled={isClaiming || project.withdrawn}
                  className={`flex items-center justify-center gap-2 w-full md:w-auto px-8 py-4 rounded-xl text-lg font-bold transition-all ${
                    project.withdrawn 
                      ? "bg-white/10 text-white/40 cursor-not-allowed border border-white/10" 
                      : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-105 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                  }`}
                >
                  {isClaiming ? <Loader2 className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
                  {project.withdrawn ? `${project.allocated_funds} GEN Claimed` : `Claim ${project.allocated_funds} GEN`}
                </button>
                {!project.withdrawn && (
                  <p className="text-xs text-white/40 mt-3 text-center md:text-right w-full">
                    Max 5% of treasury limit applies.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {/* Left Column: Submitter Details */}
            <div className="md:col-span-1 space-y-8">
              <div>
                <h3 className="text-white/50 text-sm font-bold uppercase tracking-wider mb-3">Submitted By</h3>
                <p className="text-white font-mono bg-black/40 px-3 py-2 rounded-lg border border-white/5 text-sm break-all">
                  {project.submitter}
                </p>
              </div>
              
              <div>
                <h3 className="text-white/50 text-sm font-bold uppercase tracking-wider mb-3">Project Details</h3>
                <p className="text-white/80 leading-relaxed text-sm">
                  {project.details}
                </p>
              </div>

              <div>
                <h3 className="text-white/50 text-sm font-bold uppercase tracking-wider mb-3">Amount Requested</h3>
                <p className="text-white text-xl font-medium">
                  {project.amount_requested} GEN
                </p>
              </div>
            </div>

            {/* Right Column: AI Consensus Report */}
            <div className="md:col-span-2">
              <div className="bg-black/40 rounded-2xl p-6 md:p-8 border border-white/5 shadow-inner relative overflow-hidden h-full">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500"></div>
                
                <h2 className="flex items-center gap-3 text-xl font-bold text-white mb-6">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  AI Consensus Report
                </h2>

                {project.status === "Pending" ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                    <Loader2 className="w-10 h-10 animate-spin text-white/20 mb-4" />
                    <p className="text-white/60">GenLayer AI validators are actively reviewing this project.</p>
                    <p className="text-white/40 text-sm mt-2">Results will appear here once consensus is reached.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {project.reason && (
                      <div>
                        <h3 className="text-white/50 text-sm font-bold uppercase tracking-wider mb-2">Reasoning</h3>
                        <p className="text-white/90 leading-relaxed text-[15px] font-mono">
                          {project.reason}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {project.strengths && project.strengths.length > 0 && (
                        <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-5">
                          <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            Strengths
                          </h3>
                          <ul className="space-y-2">
                            {project.strengths.map((str, idx) => (
                              <li key={idx} className="text-emerald-100/70 text-sm leading-relaxed flex items-start gap-2">
                                <span className="text-emerald-500/50 mt-0.5">•</span>
                                {str}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {project.weaknesses && project.weaknesses.length > 0 && (
                        <div className="bg-red-900/10 border border-red-500/20 rounded-xl p-5">
                          <h3 className="text-red-400 font-bold mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-400"></span>
                            Weaknesses
                          </h3>
                          <ul className="space-y-2">
                            {project.weaknesses.map((wk, idx) => (
                              <li key={idx} className="text-red-100/70 text-sm leading-relaxed flex items-start gap-2">
                                <span className="text-red-500/50 mt-0.5">•</span>
                                {wk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-2 text-sm text-white/40">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500/70" />
                      Evaluated securely on-chain by GenLayer validator consensus
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
