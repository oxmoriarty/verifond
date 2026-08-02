"use client";

import { useState } from "react";
import { Project, useClaimFunds } from "@/lib/hooks/useRPGF";
import { useWallet } from "@/lib/genlayer/wallet";
import { ExternalLink, ChevronDown, ChevronUp, CheckCircle2, ShieldCheck, Loader2, DollarSign } from "lucide-react";

export function ProjectCard({ project }: { project: Project }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { address } = useWallet();
  const { mutate: claimFunds, isPending: isClaiming } = useClaimFunds();

  const isMyProject = address && project.submitter.toLowerCase() === address.toLowerCase();
  
  // Status styling
  let statusColor = "bg-white/10 text-white/60 border-white/10";
  if (project.status === "Approved") statusColor = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (project.status === "Rejected") statusColor = "bg-red-500/20 text-red-400 border-red-500/30";
  if (project.status === "Pending") statusColor = "bg-blue-500/20 text-blue-400 border-blue-500/30";

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 p-6 rounded-2xl transition-all duration-200 ease-out hover:bg-white/10 hover:-translate-y-1 hover:border-white/20 group">
      
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <span className={`text-xs font-medium px-3 py-1 rounded-full border ${statusColor}`}>
              {project.status === "Pending" ? "Pending Review" : project.status}
            </span>
            {project.score > 0 && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/10 text-white/80 border border-white/10">
                Score: {project.score}/10
              </span>
            )}
            {project.allocated_funds !== undefined && project.allocated_funds > 0 && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Allocated: {project.allocated_funds} GEN
              </span>
            )}
          </div>
          
          <h3 className="text-xl font-bold text-white mb-1 truncate">{project.name || "Unnamed Project"}</h3>
          
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-white/50 flex items-center gap-2 hover:text-white/80 transition-colors"
          >
            {project.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            <ExternalLink className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
          </a>
        </div>

        {/* Claim Funds Button (Only for submitter on Approved projects) */}
        {isMyProject && project.status === "Approved" && (
          <div className="flex flex-col items-end">
             <button
               onClick={() => claimFunds(project.id)}
               disabled={isClaiming || project.withdrawn}
               className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                 project.withdrawn 
                   ? "bg-white/10 text-white/40 cursor-not-allowed" 
                   : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-105"
               }`}
             >
               {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
               {project.withdrawn ? `${project.allocated_funds} GEN Claimed` : `Claim ${project.allocated_funds} GEN`}
             </button>
             {!project.withdrawn && (
               <p className="text-[10px] text-white/40 mt-2 text-right">
                 Payout calculated dynamically<br/>(Max 5% of treasury)
               </p>
             )}
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-white/5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full text-xs font-medium text-white/60 hover:text-white transition-all duration-200 ease-out active:scale-95"
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            AI Consensus Report
          </span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {isExpanded && (
          <div className="mt-4 bg-black/40 rounded-lg p-4 border border-white/5 space-y-4 text-sm text-white/70 leading-relaxed font-mono">
            <div>
              <strong className="text-white">Submitter Details:</strong><br/>
              {project.details}
            </div>
            {project.reason && (
              <div className="border-t border-white/10 pt-4">
                <strong className="text-white">GenLayer AI Reasoning:</strong><br/>
                {project.reason}
              </div>
            )}
            {project.strengths && project.strengths.length > 0 && (
              <div className="border-t border-white/10 pt-4">
                <strong className="text-emerald-400">Strengths:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {project.strengths.map((str, idx) => (
                    <li key={idx}>{str}</li>
                  ))}
                </ul>
              </div>
            )}
            {project.weaknesses && project.weaknesses.length > 0 && (
              <div className="border-t border-white/10 pt-4">
                <strong className="text-red-400">Weaknesses:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {project.weaknesses.map((wk, idx) => (
                    <li key={idx}>{wk}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
              <CheckCircle2 className="w-3 h-3 text-emerald-500/70" />
              Evaluated securely by validator consensus
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
