"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getClient } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import { success, error } from "../utils/toast";

export interface Project {
  id: number;
  submitter: string;
  name: string;
  details: string;
  url: string;
  amount_requested: number;
  status: "Pending" | "Approved" | "Rejected";
  reason: string;
  score: number;
  withdrawn: boolean;
  txHash?: string; // Only present for pending projects from Supabase
}

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

// ==========================================
// 1. Fetch On-Chain Projects (Finalized)
// ==========================================
export function useProjects() {
  return useQuery<Project[], Error>({
    queryKey: ["projects", "on-chain"],
    queryFn: async () => {
      if (!CONTRACT_ADDRESS) return [];

      try {
        const client = await getClient();
        const projects: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_all_projects",
          args: [],
        });
        
        return projects.map((p: any) => ({
          id: Number(p.id),
          submitter: p.submitter,
          name: p.name,
          details: p.details,
          url: p.url,
          amount_requested: Number(p.amount_requested),
          status: p.status,
          reason: p.reason,
          score: Number(p.score),
          withdrawn: Boolean(p.withdrawn)
        }));
      } catch (err) {
        console.error("Error fetching projects from GenLayer:", err);
        return [];
      }
    },
    refetchOnWindowFocus: true,
    refetchInterval: 15000, // Poll every 15s to see if a pending tx finished
  });
}

// ==========================================
// 2. Fetch Off-Chain Pending Projects (Supabase)
// ==========================================
export function usePendingProjects() {
  return useQuery<Project[], Error>({
    queryKey: ["projects", "pending"],
    queryFn: async () => {
      try {
        const response = await fetch('/api/pending-projects');
        if (!response.ok) throw new Error("Failed to fetch pending projects");
        return await response.json();
      } catch (err) {
        console.error("Error fetching pending projects:", err);
        return [];
      }
    },
    refetchInterval: 10000,
  });
}

export function useProjectCount() {
  const { data: projects } = useProjects();
  return projects?.length || 0;
}

export function useTreasury() {
  return useQuery<number, Error>({
    queryKey: ["treasury"],
    queryFn: async () => {
      if (!CONTRACT_ADDRESS) return 0;
      try {
        const client = await getClient();
        const bal: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_treasury",
          args: [],
        });
        return Number(bal);
      } catch (err) {
        console.error("Error fetching treasury:", err);
        return 0;
      }
    },
    refetchInterval: 15000,
  });
}

// ==========================================
// 3. Submit Project (Optimistic UI)
// ==========================================
export function useSubmitProject() {
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ name, details, url, amountRequested }: { name: string, details: string, url: string, amountRequested: number }) => {
      if (!address) throw new Error("Wallet not connected.");
      if (!CONTRACT_ADDRESS) throw new Error("Contract address is not configured.");

      setIsSubmitting(true);

      const client = await getClient();
      
      // Send transaction (returns instantly after signing)
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "submit_project",
        args: [name, details, url, BigInt(amountRequested)],
        value: BigInt(0),
      });

      // Post to our Supabase API
      const res = await fetch('/api/pending-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash,
          submitter: address,
          name,
          details,
          url,
          amount_requested: amountRequested
        })
      });

      if (!res.ok) {
        throw new Error("Transaction failed to save. Please try again.");
      }

      return txHash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", "pending"] });
      setIsSubmitting(false);
      success("Submission Sent!", {
        description: "Your project is now Pending Review. GenLayer AI is evaluating it on-chain."
      });
    },
    onError: (err: any) => {
      console.error("Error submitting project:", err);
      setIsSubmitting(false);
      error("Submission Failed", {
        description: err?.message?.includes("Transaction") 
          ? "Transaction cancelled or failed to save." 
          : "Transaction failed."
      });
    },
  });

  return {
    ...mutation,
    isSubmitting,
    submitProject: mutation.mutate,
    submitProjectAsync: mutation.mutateAsync,
  };
}

// ==========================================
// 4. Donate to Treasury
// ==========================================
export function useDonate() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (amount: number) => {
      if (!address) throw new Error("Wallet not connected.");
      if (!CONTRACT_ADDRESS) throw new Error("Contract address is not configured.");

      const client = await getClient();
      
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "donate",
        args: [],
        value: BigInt(amount),
      });

      // Simple optimistic wait for local UI
      await client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });
      return txHash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treasury"] });
      success("Donation Successful!", { description: "Thank you for funding public goods!" });
    },
    onError: (err: any) => {
      error("Donation Failed", { description: err?.message });
    }
  });
}

// ==========================================
// 5. Claim Funds
// ==========================================
export function useClaimFunds() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: number) => {
      if (!address) throw new Error("Wallet not connected.");
      if (!CONTRACT_ADDRESS) throw new Error("Contract address is not configured.");

      const client = await getClient();
      
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "claim_funds",
        args: [BigInt(projectId)],
        value: BigInt(0),
      });

      await client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });
      return txHash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["treasury"] });
      success("Funds Claimed!", { description: "Your GEN tokens have been transferred." });
    },
    onError: (err: any) => {
      error("Claim Failed", { description: err?.message });
    }
  });
}
