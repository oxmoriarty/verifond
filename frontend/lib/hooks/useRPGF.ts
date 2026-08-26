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
  allocated_funds?: number;
  strengths?: string[];
  weaknesses?: string[];
  txHash?: string; // Only present for pending projects from Supabase
}

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

function getFriendlyErrorMessage(err: any, defaultMsg: string): string {
  if (!err) return defaultMsg;
  const msg = typeof err === 'string' ? err : (err.message || err.toString());
  
  if (msg.includes("rejected") || msg.includes("User denied")) {
    return "Transaction was rejected in your wallet.";
  }
  if (msg.includes("gas rate limit exceeded") || msg.includes("node is at capacity") || msg.includes("rate limit")) {
    return "The network is currently busy. Please wait a few seconds and try again.";
  }
  if (msg.includes("Insufficient funds") || msg.includes("insufficient funds")) {
    return "Insufficient GEN testnet funds to complete this transaction.";
  }
  if (msg.includes("execution reverted") || msg.includes("revert")) {
    return "Transaction was reverted by the network.";
  }
  if (msg.includes("Failed to fetch") || msg.includes("network error")) {
    return "Network connection issue. Please check your internet connection.";
  }
  
  // Fallback for long messy RPC errors
  if (msg.length > 80) {
    return defaultMsg;
  }
  
  return msg;
}

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
        const projectsData: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_all_projects",
          args: [],
        });
        
        let projects = [];
        try {
            projects = typeof projectsData === "string" ? JSON.parse(projectsData) : projectsData;
        } catch (e) {
            console.error("Failed to parse projects JSON", e);
        }
        
        return projects.map((p: any) => ({
          id: Number(p.id),
          submitter: p.submitter,
          name: p.name,
          details: p.details,
          url: p.url,
          amount_requested: Number(p.amount_requested) / 1e18,
          status: p.status,
          reason: p.reason,
          score: Number(p.score),
          withdrawn: Boolean(p.withdrawn),
          allocated_funds: Number(p.allocated_funds) / 1e18,
          strengths: p.strengths || [],
          weaknesses: p.weaknesses || []
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
        return Number(bal) / 1e18;
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
        args: [name, details, url, BigInt(Math.floor(amountRequested))],
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
        description: getFriendlyErrorMessage(err, "Transaction failed. Please try again.")
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
        value: BigInt(Math.floor(amount * 1e18)),
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
      error("Donation Failed", { description: getFriendlyErrorMessage(err, "Failed to send donation. Please try again.") });
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
      
      // Pre-flight check: ensure treasury has enough funds
      try {
        const treasuryBal: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_treasury",
          args: [],
        });
        const treasuryInGen = Number(treasuryBal) / 1e18;
        
        const projectDataStr: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_project",
          args: [BigInt(projectId)],
        });
        const projectData = typeof projectDataStr === "string" ? JSON.parse(projectDataStr) : projectDataStr;
        const allocatedInGen = Number(projectData.allocated_funds) / 1e18;

        if (allocatedInGen > treasuryInGen) {
          throw new Error("Insufficient funds in the treasury. Please try again later.");
        }
      } catch (err: any) {
        if (err.message.includes("Insufficient funds")) throw err;
        console.error("Pre-flight check failed:", err);
      }
      
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "claim_funds",
        args: [BigInt(projectId)],
        value: BigInt(0),
      });

      const receipt: any = await client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });

      if (receipt && (receipt.status === "ERROR" || receipt.status === "REVERTED")) {
        throw new Error("Claim unsuccessful. Transaction was reverted by the network.");
      }

      return txHash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["treasury"] });
      success("Funds Claimed!", { description: "Your GEN tokens have been transferred." });
    },
    onError: (err: any) => {
      error("Claim unsuccessful", { description: getFriendlyErrorMessage(err, "An unknown error occurred. Please try again.") });
    }
  });
}

// ==========================================
// 6. Identity Verification (GitHub)
// ==========================================
export function useCheckLinkedGithub() {
  const { address } = useWallet();

  return useQuery({
    queryKey: ["linkedGithub", address],
    queryFn: async () => {
      if (!address || !CONTRACT_ADDRESS) return null;
      try {
        const client = await getClient();
        const res: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_linked_github",
          args: [address],
        });
        
        const username = res ? String(res) : null;
        
        // If we found a linked GitHub, delete any stale pending verification from Supabase
        if (username) {
          fetch(`/api/pending-verifications?wallet=${address.toLowerCase()}`, { method: 'DELETE' }).catch(console.error);
        }
        
        return username;
      } catch (e) {
        console.error("Failed to fetch linked github", e);
        return null;
      }
    },
    enabled: !!address && !!CONTRACT_ADDRESS,
  });
}

export function usePendingVerification() {
  const { address } = useWallet();

  return useQuery({
    queryKey: ["pendingVerification", address?.toLowerCase()],
    queryFn: async () => {
      if (!address) return null;
      try {
        const res = await fetch(`/api/pending-verifications?wallet=${address.toLowerCase()}`);
        if (!res.ok) return null;
        return await res.json();
      } catch (e) {
        console.error("Failed to fetch pending verification", e);
        return null;
      }
    },
    enabled: !!address,
    refetchInterval: 10000,
  });
}

export function useVerifyGithub() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileUrl: string) => {
      if (!address) throw new Error("Wallet not connected.");
      if (!CONTRACT_ADDRESS) throw new Error("Contract address is not configured.");
      
      const client = await getClient();
      
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "verify_and_link_github",
        args: [profileUrl],
        value: BigInt(0),
      });

      // Post pending verification to Supabase backend
      await fetch('/api/pending-verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash,
          wallet_address: address.toLowerCase(),
          profile_url: profileUrl,
          status: 'Pending'
        }),
      });

      return { txHash, profileUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingVerification", address?.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ["linkedGithub", address?.toLowerCase()] });
      success("Verification Submitted!", { description: "Your transaction is submitted. GenLayer AI verification takes about 20 minutes to finalize on Testnet." });
    },
    onError: (err: any) => {
      const msg = typeof err === 'string' ? err : (err?.message || '');
      if (msg.includes("rejected") || msg.includes("User denied") || msg.includes("cancelled")) {
        error("Transaction Cancelled", { description: "You cancelled the transaction. Verification was not started." });
      } else {
        error("Verification Submission Failed", { description: getFriendlyErrorMessage(err, "Failed to submit verification. Please try again.") });
      }
    }
  });
}
