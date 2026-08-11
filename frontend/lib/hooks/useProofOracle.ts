"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import { supabase } from "../supabaseClient";
import { success, error } from "../utils/toast";

const ORACLE_ADDRESS = process.env.NEXT_PUBLIC_ORACLE_ADDRESS || "";

export function useIsVerified(platform: string = "github") {
  const { address } = useWallet();

  return useQuery({
    queryKey: ["proof_oracle", platform, address],
    queryFn: async () => {
      if (!address) return false;
      
      const { data, error } = await supabase
        .from("user_identities")
        .select("username")
        .eq("wallet_address", address.toLowerCase())
        .eq("platform", platform)
        .single();
        
      if (error || !data) return false;
      return true;
    },
    enabled: !!address,
  });
}

export function useVerifyAccount() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ platform, profileUrl }: { platform: string; profileUrl: string }) => {
      if (!address) throw new Error("Wallet not connected.");
      if (!ORACLE_ADDRESS) throw new Error("ProofOracle address is not configured.");

      const client = await getClient();
      
      // 1. Ask ProofOracle to verify the profile
      const txHash = await client.writeContract({
        address: ORACLE_ADDRESS as `0x${string}`,
        functionName: "verify_account",
        args: [platform, profileUrl],
        value: 0n,
      });

      // 2. Wait for the result from the Intelligent Contract
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 30,
        interval: 5000,
      });
      
      // Parse the returned username from the receipt data
      // (The actual return value parsing might depend on GenLayer JS implementation,
      // assuming receipt.data contains the returned string from the smart contract)
      const verifiedUsername = receipt.data as string;
      if (!verifiedUsername) {
         throw new Error("Verification failed on-chain.");
      }

      // 3. Save the proof securely in our own Supabase database
      const { error: dbError } = await supabase
        .from("user_identities")
        .upsert({ 
          wallet_address: address.toLowerCase(), 
          platform: platform,
          username: verifiedUsername,
          verified_at: new Date().toISOString()
        });
        
      if (dbError) throw new Error("Failed to save verification to database: " + dbError.message);
      
      return verifiedUsername;
    },
    onSuccess: (username) => {
      queryClient.invalidateQueries({ queryKey: ["proof_oracle"] });
      success("Identity Verified!", { description: `Successfully linked ${username} to your wallet.` });
    },
    onError: (err: any) => {
      console.error("Verification error:", err);
      error("Verification Failed", {
        description: err?.message || "Failed to verify identity via GenLayer AI."
      });
    },
  });
}
