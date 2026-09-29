export interface PendingVerificationRecord {
  wallet_address: string;
  tx_hash: string;
  txHash?: string;
  profile_url: string;
  status: 'Pending' | 'Failed';
  created_at: string;
}

const STORAGE_PREFIX = 'verifund_pending_verification_';
const inMemoryCache = new Map<string, PendingVerificationRecord>();

export function getPendingVerification(wallet?: string | null): PendingVerificationRecord | null {
  if (!wallet) return null;
  const key = wallet.toLowerCase();

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        inMemoryCache.set(key, parsed);
        return parsed;
      }
    } catch (e) {
      console.error('Failed to read pending verification from storage', e);
    }
  }

  return inMemoryCache.get(key) || null;
}

export function savePendingVerification(
  wallet: string,
  data: Partial<PendingVerificationRecord> & { profile_url: string; tx_hash: string }
): PendingVerificationRecord {
  const key = wallet.toLowerCase();
  const record: PendingVerificationRecord = {
    wallet_address: key,
    tx_hash: data.tx_hash,
    txHash: data.tx_hash,
    profile_url: data.profile_url,
    status: (data.status as any) || 'Pending',
    created_at: data.created_at || new Date().toISOString()
  };

  inMemoryCache.set(key, record);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(record));
    } catch (e) {
      console.error('Failed to save pending verification to storage', e);
    }
  }

  return record;
}

export function updatePendingVerificationStatus(wallet: string, status: 'Pending' | 'Failed'): void {
  if (!wallet) return;
  const key = wallet.toLowerCase();
  const existing = getPendingVerification(key);
  if (existing) {
    existing.status = status;
    inMemoryCache.set(key, existing);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(existing));
      } catch (e) {
        console.error('Failed to update pending verification in storage', e);
      }
    }
  }
}

export function clearPendingVerification(wallet?: string | null): void {
  if (!wallet) return;
  const key = wallet.toLowerCase();
  inMemoryCache.delete(key);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch (e) {
      console.error('Failed to clear pending verification from storage', e);
    }
  }
}
