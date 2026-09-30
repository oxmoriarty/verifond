"use client";

import { useState } from "react";
import { useSubmitProject, useCheckLinkedGithub, useProjects, usePendingProjects, unifyProjects, getProjectIdentityKey } from "@/lib/hooks/useRPGF";
import { Link as LinkIcon, AlignLeft, Send, Loader2, Coins, Type, AlertCircle, Info } from "lucide-react";
import Link from "next/link";

export function ProjectForm() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const { submitProject, isSubmitting, error } = useSubmitProject();
  const { data: linkedGithub } = useCheckLinkedGithub();
  const { data: onChainProjects = [] } = useProjects();
  const { data: pendingProjects = [] } = usePendingProjects();

  const unifiedProjects = unifyProjects(pendingProjects, onChainProjects);
  const targetKey = (url.trim() && name.trim()) ? getProjectIdentityKey({ url, name }) : "";
  const existingProject = targetKey ? unifiedProjects.find(p => getProjectIdentityKey(p) === targetKey) : null;

  const isAlreadyApproved = existingProject?.status === "Approved";
  const isAlreadyPending = existingProject?.status === "Pending";
  const isMaxRejections = existingProject?.status === "Rejected" && (existingProject.rejection_count ?? 0) >= 3;
  const isPreviouslyRejected = existingProject?.status === "Rejected" && (existingProject.rejection_count ?? 0) < 3;
  const isBlocked = isAlreadyApproved || isAlreadyPending || isMaxRejections;

  const isValidUrl = (string: string) => {
    try {
      new URL(string);
      return string.startsWith("http://") || string.startsWith("https://");
    } catch (_) {
      return false;
    }
  };

  const isAmountValid = !isNaN(Number(amount)) && Number(amount) > 0 && Number(amount) <= 100;
  const isGithubUrlMatch = url.trim() === "" || (linkedGithub ? url.toLowerCase().includes(linkedGithub.toLowerCase()) : true);
  const isFormValid = name.trim() !== "" && url.trim() !== "" && description.trim() !== "" && amount.trim() !== "" && isValidUrl(url) && isAmountValid && isGithubUrlMatch && !isBlocked;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isBlocked) return;
    submitProject(
      { name, details: description, url, amountRequested: Number(amount) },
      {
        onSuccess: () => {
          // Clear form on success since the mutation returns instantly via optimistic UI
          setName("");
          setUrl("");
          setDescription("");
          setAmount("");
        }
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/60 flex items-center gap-2">
          <Type className="w-3.5 h-3.5" />
          Project Name
        </label>
        <input
          type="text"
          placeholder="e.g. OpenSource Library"
          className="w-full bg-transparent border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-white/30 focus:outline-none transition-all placeholder:text-white/20 text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-white/60 flex items-center gap-2">
          <LinkIcon className="w-3.5 h-3.5" />
          Project URL
        </label>
        <input
          type="url"
          placeholder="https://github.com/..."
          className="w-full bg-transparent border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-white/30 focus:outline-none transition-all placeholder:text-white/20 text-white"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isSubmitting}
          required
        />
        {url && linkedGithub && !url.toLowerCase().includes(linkedGithub.toLowerCase()) && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mt-2 leading-relaxed">
            This repository does not match your linked GitHub username (@{linkedGithub}). If you have changed your username, you must update your linked profile first.
            <div className="mt-3">
              <Link href="/onboarding?update=true" className="inline-block px-4 py-1.5 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors font-semibold">
                Update Linked GitHub
              </Link>
            </div>
          </div>
        )}

        {isAlreadyApproved && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm mt-2 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This project has already been approved and allocated {existingProject?.allocated_funds && existingProject.allocated_funds > 0 ? existingProject.allocated_funds : 20} GEN. Approved projects cannot be submitted again.</span>
          </div>
        )}

        {isAlreadyPending && (
          <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-sm mt-2 flex items-start gap-2.5">
            <Loader2 className="w-4 h-4 flex-shrink-0 mt-0.5 animate-spin" />
            <span>A submission for this project is currently pending review. Please wait for the evaluation to finalize.</span>
          </div>
        )}

        {isMaxRejections && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mt-2 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This project has been rejected 3 times and is permanently locked from future submissions.</span>
          </div>
        )}

        {isPreviouslyRejected && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm mt-2 flex items-start gap-2.5">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This project was previously rejected ({existingProject?.rejection_count} of 3 attempts used). Submitting will be attempt {(existingProject?.rejection_count ?? 0) + 1} of 3.</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-white/60 flex items-center gap-2">
          <AlignLeft className="w-3.5 h-3.5" />
          Description & Impact
        </label>
        <textarea
          placeholder="How does this project contribute to the public good?"
          className="w-full bg-transparent border border-white/10 rounded-xl px-4 py-3 text-sm min-h-[120px] resize-none focus:border-white/30 focus:outline-none transition-all placeholder:text-white/20 text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSubmitting}
          maxLength={1000}
          required
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-xs font-medium text-white/60 flex items-center gap-2">
            <Coins className="w-3.5 h-3.5" />
            Amount Requested (GEN)
          </label>
          <span className="text-[10px] text-white/40">Max 100 GEN</span>
        </div>
        <input
          type="number"
          placeholder="e.g. 50 (Max 100)"
          min="1"
          max="100"
          className="w-full bg-transparent border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-white/30 focus:outline-none transition-all placeholder:text-white/20 text-white"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={isSubmitting}
          required
        />
        {amount && !isAmountValid && (
          <p className="text-xs text-red-400">Amount must be between 1 and 100 GEN.</p>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error.message}
        </div>
      )}

      <button
        type="submit"
        disabled={!isFormValid || isSubmitting}
        className="w-full py-4 flex items-center justify-center gap-2 font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 bg-white text-black mt-4"
      >
        {isSubmitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Send className="w-4 h-4" />
            Submit for AI Evaluation
          </>
        )}
      </button>
    </form>
  );
}
