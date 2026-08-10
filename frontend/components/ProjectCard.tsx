"use client";

import { Project } from "@/lib/hooks/useRPGF";
import { ExternalLink, ArrowRight } from "lucide-react";
import Link from "next/link";

export function ProjectCard({ project }: { project: Project }) {
  // Status styling
  let statusColor = "bg-white/10 text-white/60 border-white/10";
  if (project.status === "Approved") statusColor = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (project.status === "Rejected") statusColor = "bg-red-500/20 text-red-400 border-red-500/30";
  if (project.status === "Pending") statusColor = "bg-blue-500/20 text-blue-400 border-blue-500/30";

  const identifier = project.id || project.txHash;

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

        {/* View Details Button */}
        <div className="flex flex-col items-end">
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
