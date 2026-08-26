"use client";

import { useState } from "react";
import { useSubmitProject } from "@/lib/hooks/useRPGF";
import { Link, AlignLeft, Send, Loader2, Coins, Type } from "lucide-react";

export function ProjectForm() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const { submitProject, isSubmitting, error } = useSubmitProject();

  const isValidUrl = (string: string) => {
    try {
      new URL(string);
      return string.startsWith("http://") || string.startsWith("https://");
    } catch (_) {
      return false;
    }
  };

  const isAmountValid = !isNaN(Number(amount)) && Number(amount) > 0 && Number(amount) <= 100;
  const isFormValid = name.trim() !== "" && url.trim() !== "" && description.trim() !== "" && amount.trim() !== "" && isValidUrl(url) && isAmountValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
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
          <Link className="w-3.5 h-3.5" />
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
