import { Project } from "./hooks/useRPGF";

const STORAGE_PREFIX = "verifund_pending_project_";
const inMemoryProjects = new Map<string, Project[]>();

/**
 * Normalizes project identity based on GitHub repository (owner/repo) and project name.
 * Any submission with the same GitHub repo and name is treated as the same project.
 */
export function getProjectIdentityKey(project: { url?: string; name?: string }): string {
  const rawUrl = (project.url || "").trim().toLowerCase();
  const cleanUrl = rawUrl
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const cleanName = (project.name || "").trim().toLowerCase();
  return `${cleanUrl}::${cleanName}`;
}

export function getPendingProjects(wallet?: string | null): Project[] {
  if (!wallet) return [];
  const key = wallet.toLowerCase();

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed: Project[] = JSON.parse(raw);
        inMemoryProjects.set(key, parsed);
        return parsed;
      }
    } catch (e) {
      console.error("Failed to read pending projects from localStorage", e);
    }
  }

  return inMemoryProjects.get(key) || [];
}

export function savePendingProject(wallet: string, project: Project): void {
  if (!wallet) return;
  const key = wallet.toLowerCase();
  const existing = getPendingProjects(key);

  const targetKey = getProjectIdentityKey(project);
  // Remove any older pending/failed submission for this same project
  const filtered = existing.filter(p => getProjectIdentityKey(p) !== targetKey);
  const updated = [project, ...filtered];

  inMemoryProjects.set(key, updated);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save pending project to localStorage", e);
    }
  }
}

export function updatePendingProjectStatus(
  wallet: string,
  txHash: string,
  status: "Pending" | "Failed",
  reason?: string
): void {
  if (!wallet) return;
  const key = wallet.toLowerCase();
  const existing = getPendingProjects(key);
  const hashTarget = txHash.toLowerCase();

  const updated = existing.map(p => {
    const currentHash = (p.txHash || (p as any).tx_hash || "").toLowerCase();
    if (currentHash === hashTarget) {
      return { ...p, status, reason: reason || p.reason };
    }
    return p;
  });

  inMemoryProjects.set(key, updated);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to update pending project status in localStorage", e);
    }
  }
}

export function clearPendingProject(wallet: string, txHashOrUrl: string): void {
  if (!wallet) return;
  const key = wallet.toLowerCase();
  const existing = getPendingProjects(key);
  const target = txHashOrUrl.trim().toLowerCase();

  const updated = existing.filter(p => {
    const hash = (p.txHash || (p as any).tx_hash || "").toLowerCase();
    const url = (p.url || "").trim().toLowerCase();
    return hash !== target && url !== target;
  });

  inMemoryProjects.set(key, updated);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(updated));
    } catch (e) {
    console.error("Failed to clear pending project from localStorage", e);
    }
  }
}

/**
 * Unifies and deduplicates project submissions based on GitHub repo and project name.
 * Rules:
 * 1. Submissions with the same github repo and name (case-insensitive, normalized URL) are ONE project.
 * 2. If any submission is Accepted/Approved, the unified project is Approved (final, cannot be resubmitted).
 *    Its allocated_funds will always be positive (never 0 GEN).
 * 3. If not Approved, but has an active Pending submission, the unified project is Pending (cannot resubmit while pending).
 * 4. If neither Approved nor Pending, the latest submission determines whether it is Rejected or Failed.
 * 5. Rejection count counts only on-chain "Rejected" evaluations (not "Failed" transactions).
 * 6. Once rejected 3 times, can_resubmit is false.
 * 7. If status is Failed or (Rejected with rejectionCount < 3), can_resubmit is true.
 */
export function unifyProjects(pendingProjects: Project[] = [], onChainProjects: Project[] = []): Project[] {
  const groupMap = new Map<string, Project[]>();
  const allSubmissions = [...pendingProjects, ...onChainProjects];

  for (const p of allSubmissions) {
    const key = getProjectIdentityKey(p);
    if (!key || key === "::") continue;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(p);
  }

  const unifiedList: Project[] = [];

  for (const [, submissions] of groupMap.entries()) {
    // 1. Calculate total on-chain rejections for this project (Failed transactions don't count)
    const rejectionCount = submissions.filter(s => s.status === "Rejected").length;

    // 2. Check if any submission was Approved
    const approvedSubmission = submissions.find(s => s.status === "Approved");

    if (approvedSubmission) {
      let allocated = approvedSubmission.allocated_funds;
      const requested = approvedSubmission.amount_requested;
      if (!allocated || allocated <= 0) {
        const match = typeof approvedSubmission.reason === "string" 
          ? approvedSubmission.reason.match(/["']?suggested_allocation["']?\s*:\s*(\d+)/i) 
          : null;
        if (match && Number(match[1]) > 0) {
          allocated = Math.min(Number(match[1]), requested > 0 ? requested : 100);
        } else if (requested > 0) {
          allocated = requested;
        } else {
          allocated = 20;
        }
      }

      unifiedList.push({
        ...approvedSubmission,
        allocated_funds: allocated,
        rejection_count: rejectionCount,
        can_resubmit: false, // Approved projects can NEVER be resubmitted
      });
      continue;
    }

    // 3. If not approved, check if there is an active Pending submission
    const pendingSubmission = submissions.find(s => s.status === "Pending");
    if (pendingSubmission) {
      unifiedList.push({
        ...pendingSubmission,
        rejection_count: rejectionCount,
        can_resubmit: false, // In evaluation, cannot resubmit until finalized
      });
      continue;
    }

    // 4. If neither Approved nor Pending, select the latest submission among remaining (Failed or Rejected)
    // Sort submissions: prefer higher numeric id (on-chain), then newer created_at
    const nonApprovedOrPending = [...submissions].sort((a, b) => {
      const aId = Number(a.id) || 0;
      const bId = Number(b.id) || 0;
      if (aId !== bId) return bId - aId;
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    const latest = nonApprovedOrPending[0];
    if (!latest) continue;

    const isRejected = latest.status === "Rejected";
    const isFailed = latest.status === "Failed";

    const canResubmit = isFailed || (isRejected && rejectionCount < 3);

    unifiedList.push({
      ...latest,
      rejection_count: rejectionCount,
      can_resubmit: canResubmit,
    });
  }

  // Sort unified projects by id descending or created_at descending
  return unifiedList.sort((a, b) => {
    const aId = Number(a.id) || 0;
    const bId = Number(b.id) || 0;
    if (aId !== bId) return bId - aId;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}
