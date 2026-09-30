"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getClient, getWriteClient } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import { success, error } from "../utils/toast";
import { 
  getPendingVerification, 
  savePendingVerification, 
  updatePendingVerificationStatus, 
  clearPendingVerification 
} from "../verificationStorage";
import {
  getPendingProjects,
  savePendingProject,
  updatePendingProjectStatus,
  clearPendingProject,
  getProjectIdentityKey,
  unifyProjects
} from "../projectStorage";

export { unifyProjects, getProjectIdentityKey };

export interface Project {
  id: number;
  submitter: string;
  name: string;
  details: string;
  url: string;
  amount_requested: number;
  status: "Pending" | "Approved" | "Rejected" | "Failed";
  reason: string;
  score: number;
  withdrawn: boolean;
  allocated_funds?: number;
  strengths?: string[];
  weaknesses?: string[];
  txHash?: string; // Only present for pending projects from Supabase
  created_at?: string;
  rejection_count?: number;
  can_resubmit?: boolean;
}

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

function getFriendlyErrorMessage(err: any, defaultMsg: string): string {
  if (!err) return defaultMsg;
  const msg = typeof err === 'string' ? err : (err.message || err.toString());
  
  if (msg.includes("Ownership unverified")) {
    return "Ownership unverified. The repository owner does not match your linked GitHub account.";
  }
  if (msg.includes("Failed to extract numeric repository ID") || msg.includes("Failed to extract numeric repository owner ID")) {
    return "Could not determine the repository ID. Please ensure the GitHub URL is correct.";
  }
  if (msg.includes("rejected") || msg.includes("User denied")) {
    return "Transaction was rejected in your wallet.";
  }
  if (msg.includes("gas rate limit exceeded") || msg.includes("node is at capacity") || msg.includes("rate limit")) {
    return "The network is currently busy. Please wait a few seconds and try again.";
  }
  if (msg.includes("Insufficient funds") || msg.includes("insufficient funds")) {
    return "Insufficient GEN funds. Make sure your Studionet wallet has GEN (use the 💧 faucet in GenLayer Studio).";
  }
  if (msg.includes("execution reverted") || msg.includes("revert")) {
    // Try to extract the custom UserError message if present
    const match = msg.match(/execution reverted: (.*?)(?:\n|$)/);
    if (match && match[1]) return match[1];
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
        
        return projects.map((p: any) => {
          let allocated = Number(p.allocated_funds) / 1e18;
          const requested = Number(p.amount_requested) / 1e18;

          // Ensure approved projects always have positive allocated_funds (never 0 GEN)
          if (p.status === "Approved" && (!allocated || allocated <= 0)) {
            const match = typeof p.reason === 'string' ? p.reason.match(/["']?suggested_allocation["']?\s*:\s*(\d+)/i) : null;
            if (match && Number(match[1]) > 0) {
              allocated = Math.min(Number(match[1]), requested > 0 ? requested : 100);
            } else if (requested > 0) {
              allocated = requested;
            } else {
              allocated = 20;
            }
          }

          return {
            id: Number(p.id),
            submitter: p.submitter,
            name: p.name,
            details: p.details,
            url: p.url,
            amount_requested: requested,
            status: p.status,
            reason: p.reason,
            score: Number(p.score),
            withdrawn: Boolean(p.withdrawn),
            allocated_funds: allocated,
            strengths: p.strengths || [],
            weaknesses: p.weaknesses || []
          };
        });
      } catch (err) {
        console.error("Error fetching projects from GenLayer:", err);
        return [];
      }
    },
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });
}

// ==========================================
// 2. Fetch Pending Projects (Storage + Supabase)
// ==========================================
export function usePendingProjects() {
  const { address } = useWallet();

  return useQuery<Project[], Error>({
    queryKey: ["projects", "pending", address?.toLowerCase()],
    initialData: () => {
      if (!address) return [];
      return getPendingProjects(address);
    },
    queryFn: async () => {
      // 1. Read local storage projects
      const localProjects = address ? getPendingProjects(address) : [];

      // 2. Best-effort fetch from backend API
      let apiProjects: Project[] = [];
      try {
        const response = await fetch('/api/pending-projects');
        if (response.ok) {
          apiProjects = await response.json();
        }
      } catch (err) {
        // Backend offline, safely ignore
      }

      // Merge by txHash or url
      const mergedMap = new Map<string, Project>();
      for (const p of [...localProjects, ...apiProjects]) {
        const key = (p.txHash || (p as any).tx_hash || p.url || '').toLowerCase();
        if (key && !mergedMap.has(key)) {
          mergedMap.set(key, p);
        }
      }

      const pendingProjects = Array.from(mergedMap.values());
      if (pendingProjects.length === 0) return [];

      const activeProjects: Project[] = [];
      const client = await getClient();

      for (const project of pendingProjects) {
        if (project.status === 'Failed') {
          activeProjects.push(project);
          continue;
        }

        const hash = project.txHash || (project as any).tx_hash;
        if (hash) {
          try {
            const tx: any = await client.getTransaction({ hash: hash as any });
            if (tx) {
              const statusName = (tx.statusName || tx.status || '').toString().toUpperCase();
              const numStatus = tx.status;
              const leaderReceipt = tx.consensus_data?.leader_receipt;
              const leaderObj = Array.isArray(leaderReceipt) ? leaderReceipt[0] : leaderReceipt;
              const execResult = (leaderObj?.execution_result || tx.txExecutionResultName || '').toString().toUpperCase();
              const txError = leaderObj?.error;
              const resultName = (tx.resultName || '').toString().toUpperCase();

              const isFailedTx =
                statusName === 'UNDETERMINED' ||
                statusName === 'CANCELED' ||
                statusName === 'VALIDATORS_TIMEOUT' ||
                statusName === 'LEADER_TIMEOUT' ||
                numStatus === 6 || numStatus === 8 || numStatus === 12 || numStatus === 13 ||
                resultName === 'FAILURE' ||
                execResult.includes('ERROR') ||
                !!txError;

              if (isFailedTx) {
                const failureReason = statusName === 'UNDETERMINED' || numStatus === 6
                  ? 'Consensus undetermined by validators. Contract state was not modified.'
                  : statusName.includes('TIMEOUT') || numStatus === 12 || numStatus === 13
                  ? 'Transaction timed out during validator consensus.'
                  : 'Transaction execution failed or reverted on-chain.';

                if (address) {
                  updatePendingProjectStatus(address, hash, 'Failed', failureReason);
                }
                fetch('/api/pending-projects', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', 'x-wallet-address': project.submitter || '' },
                  body: JSON.stringify({ txHash: hash, status: 'Failed', reason: failureReason, caller: project.submitter })
                }).catch(() => {});

                activeProjects.push({ ...project, status: 'Failed', reason: failureReason });
              } else if (statusName === 'FINALIZED' || numStatus === 7) {
                // Finalized on-chain! Remove from pending storage
                if (address) {
                  clearPendingProject(address, hash);
                }
                fetch(`/api/pending-projects?txHash=${hash}&wallet=${project.submitter || ''}`, {
                  method: 'DELETE',
                  headers: { 'x-wallet-address': project.submitter || '' }
                }).catch(() => {});
              } else {
                activeProjects.push(project);
              }
              continue;
            }
          } catch (e: any) {
            if (project.created_at) {
              const createdTime = new Date(project.created_at).getTime();
              const ageInMinutes = (Date.now() - createdTime) / 1000 / 60;
              if (ageInMinutes > 15) {
                if (address) {
                  updatePendingProjectStatus(address, hash, 'Failed', 'Project submission timed out.');
                }
                activeProjects.push({ ...project, status: 'Failed', reason: 'Project submission timed out.' });
                continue;
              }
            }
            activeProjects.push(project);
          }
        } else {
          activeProjects.push(project);
        }
      }

      return activeProjects;
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
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

export interface TreasuryDetails {
  totalTreasury: number;
  totalReserved: number;
  availableTreasury: number;
}

export function useTreasuryDetails() {
  return useQuery<TreasuryDetails, Error>({
    queryKey: ["treasuryDetails"],
    queryFn: async () => {
      if (!CONTRACT_ADDRESS) return { totalTreasury: 0, totalReserved: 0, availableTreasury: 0 };
      try {
        const client = await getClient();
        const detailsStr: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_treasury_details",
          args: [],
        });
        const details = typeof detailsStr === 'string' ? JSON.parse(detailsStr) : detailsStr;
        return {
          totalTreasury: Number(details?.total_treasury || 0) / 1e18,
          totalReserved: Number(details?.total_reserved || 0) / 1e18,
          availableTreasury: Number(details?.available_treasury || 0) / 1e18,
        };
      } catch (err) {
        console.error("Error fetching treasury details:", err);
        return { totalTreasury: 0, totalReserved: 0, availableTreasury: 0 };
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

      const client = await getWriteClient();
      
      // Send transaction (returns instantly after user signs in MetaMask)
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "submit_project",
        args: [name, details, url, BigInt(Math.floor(amountRequested))],
        value: BigInt(0),
      });

      const newProject: Project = {
        id: 0,
        txHash,
        submitter: address,
        name,
        details,
        url,
        amount_requested: amountRequested,
        status: 'Pending',
        score: 0,
        reason: 'Waiting for GenLayer AI Evaluation...',
        withdrawn: false,
        created_at: new Date().toISOString()
      };

      // 1. Immediately persist in client storage
      savePendingProject(address, newProject);

      // 2. Immediately seed React Query cache
      const targetKey = getProjectIdentityKey(newProject);
      queryClient.setQueryData(["projects", "pending", address.toLowerCase()], (old: any) => {
        const filteredOld = Array.isArray(old) ? old.filter((p: any) => getProjectIdentityKey(p) !== targetKey) : [];
        return [newProject, ...filteredOld];
      });

      // 3. Best-effort post to backend API (do NOT throw on failure!)
      try {
        await fetch('/api/pending-projects', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-wallet-address': address
          },
          body: JSON.stringify({
            txHash,
            submitter: address,
            name,
            details,
            url,
            amount_requested: amountRequested
          })
        });
      } catch (err) {
        console.warn("Could not sync pending project to backend API (offline):", err);
      }

      return { txHash, newProject };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["projects", "on-chain"] });
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

      const client = await getWriteClient();

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "donate",
        args: [],
        value: BigInt(Math.floor(amount * 1e18)),
      });

      // Simple optimistic wait for local UI
      await client.waitForTransactionReceipt({
        hash: txHash,
        status: "FINALIZED" as any,
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

      const client = await getWriteClient();
      
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
        status: "FINALIZED" as any,
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
    queryKey: ["linkedGithub", address?.toLowerCase()],
    queryFn: async () => {
      if (!address || !CONTRACT_ADDRESS) return null;
      try {
        const client = await getClient();
        const res: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_linked_github",
          args: [address],
        });
        
        const username = res && String(res).trim() ? String(res).trim() : null;
        
        // If we found a linked GitHub, clear pending verification from local storage and backend
        if (username) {
          clearPendingVerification(address);
          fetch(`/api/pending-verifications?wallet=${address.toLowerCase()}`, { 
            method: 'DELETE',
            headers: { 'x-wallet-address': address }
          }).catch(() => {});
        }
        
        return username;
      } catch (e) {
        console.error("Failed to fetch linked github", e);
        return null;
      }
    },
    enabled: !!address && !!CONTRACT_ADDRESS,
    refetchInterval: 5000,
  });
}

export interface LinkedIdentity {
  linked: boolean;
  wallet?: string;
  handle?: string;
  canonical_url?: string;
  github_id?: number;
}

export function useLinkedIdentity() {
  const { address } = useWallet();

  return useQuery<LinkedIdentity | null, Error>({
    queryKey: ["linkedIdentity", address?.toLowerCase()],
    queryFn: async () => {
      if (!address || !CONTRACT_ADDRESS) return null;
      try {
        const client = await getClient();
        const res: any = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_linked_identity",
          args: [address],
        });
        return typeof res === "string" ? JSON.parse(res) : res;
      } catch (e) {
        console.error("Failed to fetch linked identity bundle", e);
        return null;
      }
    },
    enabled: !!address && !!CONTRACT_ADDRESS,
  });
}

export function usePendingVerification() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["pendingVerification", address?.toLowerCase()],
    initialData: () => {
      if (!address) return undefined;
      return getPendingVerification(address) || undefined;
    },
    queryFn: async () => {
      if (!address) return null;
      try {
        // 1. Get stored local verification
        const localRecord = getPendingVerification(address);

        // 2. Best-effort fetch from backend
        let apiData = null;
        try {
          const res = await fetch(`/api/pending-verifications?wallet=${address.toLowerCase()}`);
          if (res.ok) {
            apiData = await res.json();
          }
        } catch (e) {
          // Backend offline or error, safely ignore
        }

        const pendingData = localRecord || apiData;
        if (!pendingData) {
          return null;
        }

        // If explicitly marked as Failed, return it so UI shows failure card
        if (pendingData.status === 'Failed') {
          return pendingData;
        }

        const client = await getClient();

        // 3. Check if transaction has already succeeded on-chain (get_linked_github)
        if (CONTRACT_ADDRESS) {
          try {
            const resLinked: any = await client.readContract({
              address: CONTRACT_ADDRESS as `0x${string}`,
              functionName: "get_linked_github",
              args: [address],
            });
            const username = resLinked && String(resLinked).trim() ? String(resLinked).trim() : "";
            if (username) {
              clearPendingVerification(address);
              fetch(`/api/pending-verifications?wallet=${address.toLowerCase()}`, { 
                method: 'DELETE',
                headers: { 'x-wallet-address': address }
              }).catch(() => {});
              queryClient.invalidateQueries({ queryKey: ["linkedGithub", address?.toLowerCase()] });
              queryClient.invalidateQueries({ queryKey: ["linkedIdentity", address?.toLowerCase()] });
              return null;
            }
          } catch (err) {
            console.error("Error checking linked github on-chain:", err);
          }
        }

        // 4. Check the transaction status on GenLayer
        const hash = pendingData.tx_hash || pendingData.txHash || (pendingData as any).txhash;
        if (hash) {
          try {
            const tx: any = await client.getTransaction({ 
              hash: hash as any 
            });
            
            if (tx) {
              let statusName = (tx.statusName || '').toString().toUpperCase();
              const numStatus = tx.status;
              
              if (!statusName && numStatus !== undefined) {
                const numStr = String(numStatus);
                const mapping: Record<string, string> = {
                  "0": "UNINITIALIZED",
                  "1": "PENDING",
                  "2": "PROPOSING",
                  "3": "COMMITTING",
                  "4": "REVEALING",
                  "5": "ACCEPTED",
                  "6": "UNDETERMINED",
                  "7": "FINALIZED",
                  "8": "CANCELED",
                  "9": "APPEAL_REVEALING",
                  "10": "APPEAL_COMMITTING",
                  "11": "READY_TO_FINALIZE",
                  "12": "VALIDATORS_TIMEOUT",
                  "13": "LEADER_TIMEOUT"
                };
                statusName = mapping[numStr] || String(numStatus).toUpperCase();
              }

              const leaderReceipt = tx.consensus_data?.leader_receipt;
              const leaderObj = Array.isArray(leaderReceipt) ? leaderReceipt[0] : leaderReceipt;
              const execResult = (leaderObj?.execution_result || tx.txExecutionResultName || '').toString().toUpperCase();
              const txError = leaderObj?.error;
              const resultName = (tx.resultName || '').toString().toUpperCase();

              const isConsensusFailed = 
                statusName === 'UNDETERMINED' || 
                statusName === 'CANCELED' || 
                statusName === 'VALIDATORS_TIMEOUT' || 
                statusName === 'LEADER_TIMEOUT' ||
                resultName === 'FAILURE' ||
                execResult.includes('ERROR') ||
                !!txError;

              if (isConsensusFailed) {
                updatePendingVerificationStatus(address, 'Failed');
                fetch(`/api/pending-verifications`, {
                  method: 'PATCH',
                  headers: { 
                    'Content-Type': 'application/json',
                    'x-wallet-address': address
                  },
                  body: JSON.stringify({ wallet_address: address.toLowerCase(), status: 'Failed', txHash: hash })
                }).catch(() => {});
                return { ...pendingData, status: 'Failed' };
              }

              // If transaction is finalized or accepted, but get_linked_github was STILL empty:
              if (statusName === 'FINALIZED' || statusName === 'ACCEPTED') {
                let isLinkedNow = false;
                if (CONTRACT_ADDRESS) {
                  try {
                    const checkAgain: any = await client.readContract({
                      address: CONTRACT_ADDRESS as `0x${string}`,
                      functionName: "get_linked_github",
                      args: [address],
                    });
                    isLinkedNow = !!(checkAgain && String(checkAgain).trim());
                  } catch (e) {}
                }

                if (isLinkedNow) {
                  clearPendingVerification(address);
                  fetch(`/api/pending-verifications?wallet=${address.toLowerCase()}`, { 
                    method: 'DELETE',
                    headers: { 'x-wallet-address': address }
                  }).catch(() => {});
                  queryClient.invalidateQueries({ queryKey: ["linkedGithub", address?.toLowerCase()] });
                  queryClient.invalidateQueries({ queryKey: ["linkedIdentity", address?.toLowerCase()] });
                  return null;
                } else {
                  updatePendingVerificationStatus(address, 'Failed');
                  fetch(`/api/pending-verifications`, {
                    method: 'PATCH',
                    headers: { 
                      'Content-Type': 'application/json',
                      'x-wallet-address': address
                    },
                    body: JSON.stringify({ wallet_address: address.toLowerCase(), status: 'Failed', txHash: hash })
                  }).catch(() => {});
                  return { ...pendingData, status: 'Failed' };
                }
              }

              // Still in progress ('PENDING', 'PROPOSING', 'COMMITTING', 'REVEALING', etc.)
              return { ...pendingData, status: 'Pending' };
            }
          } catch (e: any) {
            // getTransaction might throw if tx is newly submitted and still propagating
            if (pendingData.created_at) {
              const createdTime = new Date(pendingData.created_at).getTime();
              const ageInMinutes = (Date.now() - createdTime) / 1000 / 60;
              
              if (ageInMinutes > 15) {
                console.error("Transaction pending for >15 minutes without finality. Assuming dropped.");
                updatePendingVerificationStatus(address, 'Failed');
                fetch(`/api/pending-verifications`, {
                  method: 'PATCH',
                  headers: { 
                    'Content-Type': 'application/json',
                    'x-wallet-address': address
                  },
                  body: JSON.stringify({ wallet_address: address.toLowerCase(), status: 'Failed', txHash: hash })
                }).catch(() => {});
                return { ...pendingData, status: 'Failed' };
              }
            }
            return { ...pendingData, status: 'Pending' };
          }
        }

        return pendingData;
      } catch (e) {
        console.error("Failed to fetch pending verification", e);
        return getPendingVerification(address);
      }
    },
    enabled: !!address,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

export function useVerifyGithub() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileUrl, isUpdate = false }: { profileUrl: string, isUpdate?: boolean }) => {
      if (!address) throw new Error("Wallet not connected.");
      if (!CONTRACT_ADDRESS) throw new Error("Contract address is not configured.");
      
      const client = await getWriteClient();
      
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: isUpdate ? "update_github_link" : "verify_and_link_github",
        args: [profileUrl],
        value: BigInt(0),
      });

      // 1. Immediately persist to client storage synchronously!
      const record = savePendingVerification(address, {
        profile_url: profileUrl,
        tx_hash: txHash,
        status: 'Pending',
        created_at: new Date().toISOString()
      });

      // 2. Immediately seed React Query cache
      queryClient.setQueryData(["pendingVerification", address.toLowerCase()], record);

      // 3. Best-effort async sync with Supabase backend (do not block or throw on failure)
      try {
        await fetch('/api/pending-verifications', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-wallet-address': address
          },
          body: JSON.stringify({
            txHash,
            wallet_address: address.toLowerCase(),
            profile_url: profileUrl,
            status: 'Pending'
          }),
        });
      } catch (postErr) {
        console.warn("Could not sync pending verification to Supabase (offline/paused):", postErr);
      }

      return { txHash, profileUrl, record };
    },
    onSuccess: (data) => {
      if (address) {
        const record = data.record || {
          wallet_address: address.toLowerCase(),
          tx_hash: data.txHash,
          txHash: data.txHash,
          profile_url: data.profileUrl,
          status: 'Pending',
          created_at: new Date().toISOString()
        };
        queryClient.setQueryData(["pendingVerification", address.toLowerCase()], record);
      }
      queryClient.invalidateQueries({ queryKey: ["pendingVerification", address?.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ["linkedGithub", address?.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ["linkedIdentity", address?.toLowerCase()] });
      success("Verification Submitted!", { description: "Verification in progress. You can leave this page while we verify." });
    },
    onError: (err: any) => {
      console.error("[useVerifyGithub] Raw error:", err);
      const msg = typeof err === 'string' ? err : (err?.message || '');
      if (msg.includes("rejected") || msg.includes("User denied") || msg.includes("cancelled")) {
        error("Transaction Cancelled", { description: "You cancelled the transaction. Verification was not started." });
      } else {
        error("Verification Submission Failed", { description: getFriendlyErrorMessage(err, "Failed to submit verification. Please try again.") });
      }
    }
  });
}
