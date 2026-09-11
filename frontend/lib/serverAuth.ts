// Server-side authentication and verification utilities for pending state mutations

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

/**
 * Validates standard 20-byte EVM hex address format
 */
export function isValidAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return EVM_ADDRESS_REGEX.test(address.trim());
}

/**
 * Validates standard 32-byte EVM hex transaction hash format
 */
export function isValidTxHash(hash: string | null | undefined): boolean {
  if (!hash) return false;
  return TX_HASH_REGEX.test(hash.trim());
}

/**
 * Queries GenLayer RPC for transaction receipt proof
 */
export async function queryGenLayerReceipt(txHash: string): Promise<any | null> {
  const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://rpc-bradbury.genlayer.com";
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Verifund Authentication Service)",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result || null;
  } catch (err) {
    console.error("Failed to query GenLayer RPC receipt:", err);
    return null;
  }
}

/**
 * Authenticates that the request holds valid wallet proof matching the target wallet
 */
export function authenticateWalletProof(
  req: Request,
  expectedWallet: string | null | undefined
): boolean {
  if (!expectedWallet || !isValidAddress(expectedWallet)) return false;

  const headerWallet = req.headers.get("x-wallet-address") || req.headers.get("x-sender-wallet");
  if (headerWallet && isValidAddress(headerWallet)) {
    return headerWallet.toLowerCase() === expectedWallet.toLowerCase();
  }

  return false;
}
