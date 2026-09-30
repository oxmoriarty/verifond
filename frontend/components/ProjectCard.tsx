"use client";

import { Project, useSubmitProject } from "@/lib/hooks/useRPGF";
import { useWallet } from "@/lib/genlayer/wallet";
import { ExternalLink, ArrowRight, RotateCcw, Loader2 } from "lucide-react";
import Link from "next/link";

export function ProjectCard({ project }: { project: Project }) {
  const { address } = useWallet();
  const { submitProject, isSubmitting } = useSubmitProject();

  // Status styling
  let statusColor = "bg-white/10 text-white/60 border-white/10";
  if (project.status === "Approved") statusColor = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (project.status === "Rejected") statusColor = "bg-red-500/20 text-red-400 border-red-500/30";
  if (project.status === "Pending") statusColor = "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (project.status === "Failed") statusColor = "bg-red-500/10 text-red-500 border-red-500/20";

  const identifier = project.id || project.txHash;
  const isMyProject = !project.submitter || (address && project.submitter.toLowerCase() === address.toLowerCase());
  const isFailed = project.status === "Failed";
  const isRejected = project.status === "Rejected";
  const rejectionCount = project.rejection_count ?? 0;
  const canResubmit = project.can_resubmit ?? (isFailed || (isRejected && rejectionCount < 3));

  const handleResubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!project.name || !project.url || isSubmitting || !canResubmit) return;

    submitProject({
      name: project.name,
      details: project.details || "Resubmitted project",
      url: project.url,
      amountRequested: Number(project.amount_requested) || 1,
    });
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 p-6 rounded-2xl transition-all duration-200 ease-out hover:bg-white/10 hover:-translate-y-1 hover:border-white/20 group">
      
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className={`text-xs font-medium px-3 py-1 rounded-full border ${statusColor}`}>
              {project.status === "Pending" ? "Pending Review" : project.status}
            </span>
            {isRejected && (
              <span className={`text-xs font-medium px-3 py-1 rounded-full border ${
                rejectionCount >= 3 
                  ? "bg-red-500/20 text-red-400 border-red-500/30" 
                  : "bg-amber-500/20 text-amber-300 border-amber-500/30"
              }`}>
                {rejectionCount >= 3 ? "Locked (3/3 Rejections)" : `Rejection ${rejectionCount} of 3`}
              </span>
            )}
            {project.score > 0 && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/10 text-white/80 border border-white/10">
                Score: {project.score}/10
              </span>
            )}
            {project.status === "Approved" && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Allocated: {project.allocated_funds && project.allocated_funds > 0 ? project.allocated_funds : 20} GEN
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

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {isMyProject && (isFailed || isRejected) && (
            canResubmit ? (
              <button
                onClick={handleResubmit}
                disabled={isSubmitting}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(239,68,68,0.15)] ${
                  isRejected 
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50" 
                    : "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 hover:border-red-500/50"
                }`}
                title="Resubmit project with existing details"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                <span>{isSubmitting ? "Resubmitting..." : "Resubmit"}</span>
              </button>
            ) : isRejected ? (
              <span className="text-xs text-red-400/80 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 font-medium">
                Max Rejections (3/3)
              </span>
            ) : null
          )}

          <Link
            href={`/project/${identifier}`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all bg-white/10 text-white hover:bg-white hover:text-black hover:scale-105"
          >
            View Details
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
