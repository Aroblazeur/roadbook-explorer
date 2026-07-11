const LOCK_PREFIX = "roadbook-explorer:lock";
const LOCK_TIMEOUT = 15_000;

export function takeSnapshot(state) {
  return {
    roadbookId: state.roadbookId,
    roadbook: structuredClone(state.roadbook ?? null),
    stages: structuredClone(state.stages ?? []),
    poisByStage: structuredClone(state.poisByStage ?? {}),
    variantsByStage: structuredClone(state.variantsByStage ?? {}),
    updatedAt: state.roadbook?.updated_at ?? null,
    timestamp: Date.now(),
  };
}

export function hasStateChangedSinceSnapshot(snapshot, currentState) {
  if (!snapshot) return true;
  const snapRb = snapshot.roadbook;
  const curRb = currentState.roadbook;
  if (snapRb?.updated_at !== curRb?.updated_at) return true;
  if (snapshot.stages?.length !== currentState.stages?.length) return true;
  if (JSON.stringify(snapshot.stages) !== JSON.stringify(currentState.stages)) return true;
  const snapPoisKeys = Object.keys(snapshot.poisByStage ?? {}).sort().join(",");
  const curPoisKeys = Object.keys(currentState.poisByStage ?? {}).sort().join(",");
  if (snapPoisKeys !== curPoisKeys) return true;
  const snapVariantKeys = Object.keys(snapshot.variantsByStage ?? {}).sort().join(",");
  const curVariantKeys = Object.keys(currentState.variantsByStage ?? {}).sort().join(",");
  if (snapVariantKeys !== curVariantKeys) return true;
  return false;
}

export async function getRemoteUpdatedAt(supabase, roadbookId) {
  if (!supabase || !roadbookId) return null;
  const { data, error } = await supabase
    .from("roadbooks")
    .select("updated_at")
    .eq("id", roadbookId)
    .maybeSingle();
  if (error || !data) return null;
  return data.updated_at;
}

export async function conditionalUpdateRoadbook(supabase, roadbookId, updates, expectedUpdatedAt) {
  if (!supabase || !roadbookId) return { ok: false, error: "no_supabase" };
  if (!expectedUpdatedAt) return { ok: false, error: "no_version" };
  const { data, error } = await supabase
    .from("roadbooks")
    .update(updates)
    .eq("id", roadbookId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id, updated_at")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    const remoteUpdatedAt = await getRemoteUpdatedAt(supabase, roadbookId);
    return { ok: false, error: "conflict", remoteUpdatedAt };
  }
  return { ok: true, data };
}

export function acquireSyncLock(roadbookId) {
  try {
    const existing = localStorage.getItem(`${LOCK_PREFIX}:${roadbookId}`);
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        if (Date.now() - parsed.timestamp < LOCK_TIMEOUT) {
          if (parsed.tabId !== null && parsed.tabId !== undefined) {
            return { ok: false, error: "locked", holder: parsed.tabId };
          }
        }
      } catch {}
    }
    localStorage.setItem(`${LOCK_PREFIX}:${roadbookId}`, JSON.stringify({ timestamp: Date.now(), tabId: null }));
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export function acquireSyncLockWithTabId(roadbookId, tabId) {
  try {
    const existing = localStorage.getItem(`${LOCK_PREFIX}:${roadbookId}`);
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        if (Date.now() - parsed.timestamp < LOCK_TIMEOUT) {
          if (parsed.tabId !== tabId) {
            return { ok: false, error: "locked", holder: parsed.tabId };
          }
        }
      } catch {}
    }
    localStorage.setItem(`${LOCK_PREFIX}:${roadbookId}`, JSON.stringify({ timestamp: Date.now(), tabId }));
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export function releaseSyncLock(roadbookId, tabId) {
  try {
    const existing = localStorage.getItem(`${LOCK_PREFIX}:${roadbookId}`);
    if (!existing) return;
    const parsed = JSON.parse(existing);
    if (parsed.tabId !== tabId) return;
    localStorage.removeItem(`${LOCK_PREFIX}:${roadbookId}`);
  } catch {}
}

export async function verifyAfterSync(supabase, roadbookId, snapshot) {
  if (!supabase || !roadbookId) return { ok: false, issues: ["no_params"] };
  const { data: rb, error: rbErr } = await supabase
    .from("roadbooks")
    .select("id, updated_at")
    .eq("id", roadbookId)
    .maybeSingle();
  if (rbErr || !rb) return { ok: false, issues: [rbErr?.message ?? "roadbook_not_found"] };
  const { data: stages } = await supabase
    .from("stages")
    .select("id")
    .eq("roadbook_id", roadbookId);
  const issues = [];
  if (snapshot && (stages?.length ?? 0) !== (snapshot.stages?.length ?? 0)) {
    issues.push(`stage_count: expected ${snapshot.stages?.length ?? 0}, got ${stages?.length ?? 0}`);
  }
  return { ok: issues.length === 0, issues, remoteUpdatedAt: rb.updated_at };
}

export function cleanupStaleLocks(roadbookId) {
  try {
    const existing = localStorage.getItem(`${LOCK_PREFIX}:${roadbookId}`);
    if (!existing) return;
    const parsed = JSON.parse(existing);
    if (Date.now() - parsed.timestamp >= LOCK_TIMEOUT) {
      localStorage.removeItem(`${LOCK_PREFIX}:${roadbookId}`);
    }
  } catch {}
}
