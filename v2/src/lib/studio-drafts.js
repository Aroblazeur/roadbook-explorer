const STORAGE_PREFIX = "roadbook-explorer:draft:v1";
const MAX_DRAFT_SIZE = 512_000; // 500 KB
const CURRENT_VERSION = 1;

export function getDraftKey(userId, roadbookId) {
  if (!userId) return null;
  if (!roadbookId) return null;
  return `${STORAGE_PREFIX}:${userId}:${roadbookId}`;
}

export function getNewDraftKey(userId, localDraftId) {
  if (!userId || !localDraftId) return null;
  return `${STORAGE_PREFIX}:${userId}:new:${localDraftId}`;
}

export function generateTabId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadDraft(userId, roadbookId) {
  const key = getDraftKey(userId, roadbookId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!validateDraft(parsed)) return null;
    return parsed;
  } catch {
    try {
      if (key) localStorage.removeItem(key);
    } catch {}
    return null;
  }
}

export function loadNewDraft(userId, localDraftId) {
  const key = getNewDraftKey(userId, localDraftId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!validateDraft(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(userId, roadbookId, payload) {
  const key = getDraftKey(userId, roadbookId);
  if (!key) return { ok: false, error: "no_key" };
  try {
    const estimated = estimateSize(payload);
    if (estimated > MAX_DRAFT_SIZE) {
      return { ok: false, error: "quota_exceeded" };
    }
    localStorage.setItem(key, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      return { ok: false, error: "quota_exceeded" };
    }
    return { ok: false, error: "write_failed" };
  }
}

export function removeDraft(userId, roadbookId) {
  const key = getDraftKey(userId, roadbookId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function removeNewDraft(userId, localDraftId) {
  const key = getNewDraftKey(userId, localDraftId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function validateDraft(data) {
  if (!data || typeof data !== "object") return false;
  if (data.version !== CURRENT_VERSION) return false;
  if (typeof data.userId !== "string") return false;
  if (typeof data.roadbookId !== "string" && typeof data.roadbookId !== "number") return false;
  if (typeof data.savedAt !== "string") return false;
  if (!data.payload || typeof data.payload !== "object") return false;
  return true;
}

export function estimateSize(obj) {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return Infinity;
  }
}

export function isDraftNewerThanRemote(draft, remoteUpdatedAt) {
  if (!draft?.savedAt) return false;
  if (!remoteUpdatedAt) return true;
  return new Date(draft.savedAt).getTime() > new Date(remoteUpdatedAt).getTime();
}

export function isDraftSameAsRemote(draft, remoteUpdatedAt) {
  if (!draft?.savedAt || !remoteUpdatedAt) return false;
  return new Date(draft.savedAt).getTime() === new Date(remoteUpdatedAt).getTime();
}

export function buildDraftPayload(state) {
  return {
    version: CURRENT_VERSION,
    userId: state.userId,
    roadbookId: state.roadbookId,
    baseRemoteUpdatedAt: state.baseRemoteUpdatedAt ?? null,
    savedAt: new Date().toISOString(),
    tabId: state.tabId,
    payload: {
      roadbook: state.roadbook,
      title: state.title,
      description: state.description,
      isPublic: state.isPublic,
      activity: state.activity,
      destination: state.destination,
      project: state.project,
      officialDist: state.officialDist,
      officialGain: state.officialGain,
      officialLoss: state.officialLoss,
      officialGpx: state.officialGpx,
      officialMap: state.officialMap,
      traceDist: state.traceDist,
      traceGain: state.traceGain,
      traceLoss: state.traceLoss,
      traceGpx: state.traceGpx,
      traceMap: state.traceMap,
      stages: state.stages,
      poisByStage: state.poisByStage,
      variantsByStage: state.variantsByStage,
      images: state.images,
      gpxOfficial: state.gpxOfficial,
      gpxCustom: state.gpxCustom,
      gpxByStage: state.gpxByStage,
      coverMode: state.coverMode,
      coverUrl: state.coverUrl,
      coverMediaId: state.coverMediaId,
      startPoint: state.startPoint,
    },
  };
}

export function migrateDraft(data) {
  if (!data || typeof data !== "object") return null;
  if (data.version === CURRENT_VERSION) return data;
  if (data.version < CURRENT_VERSION) {
    return null;
  }
  return null;
}

export function listUserDrafts(userId) {
  if (!userId) return [];
  const drafts = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const parts = key.split(":");
      if (parts.length < 5) continue;
      const keyUserId = parts[3];
      if (keyUserId !== userId) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (validateDraft(parsed)) drafts.push(parsed);
      } catch {}
    }
  } catch {}
  return drafts;
}

export function removeAllUserDrafts(userId) {
  const drafts = listUserDrafts(userId);
  drafts.forEach(d => {
    try {
      const key = getDraftKey(d.userId, d.roadbookId);
      if (key) localStorage.removeItem(key);
    } catch {}
  });
}

export function cleanupSyncedDrafts(userId) {
  const drafts = listUserDrafts(userId);
  drafts.forEach(d => {
    if (isDraftSameAsRemote(d, d.baseRemoteUpdatedAt)) {
      try {
        const key = getDraftKey(d.userId, d.roadbookId);
        if (key) localStorage.removeItem(key);
      } catch {}
    }
  });
}

export function generateLocalDraftId() {
  return crypto.randomUUID?.() ?? `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveNewDraft(userId, localDraftId, payload) {
  const key = getNewDraftKey(userId, localDraftId);
  if (!key) return { ok: false, error: "no_key" };
  try {
    const estimated = estimateSize(payload);
    if (estimated > MAX_DRAFT_SIZE) {
      return { ok: false, error: "quota_exceeded" };
    }
    localStorage.setItem(key, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      return { ok: false, error: "quota_exceeded" };
    }
    return { ok: false, error: "write_failed" };
  }
}

export function migrateNewDraftKey(userId, localDraftId, newRoadbookId) {
  const newKey = getNewDraftKey(userId, localDraftId);
  const targetKey = getDraftKey(userId, newRoadbookId);
  if (!newKey || !targetKey) return;
  try {
    const raw = localStorage.getItem(newKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!validateDraft(parsed)) return;
    parsed.roadbookId = newRoadbookId;
    localStorage.setItem(targetKey, JSON.stringify(parsed));
    localStorage.removeItem(newKey);
  } catch {}
}

export function exportDraftToJSON(userId, roadbookId) {
  const draft = loadDraft(userId, roadbookId);
  if (!draft) return null;
  const exportData = {
    exportedAt: new Date().toISOString(),
    formatVersion: CURRENT_VERSION,
    userId: draft.userId,
    roadbookId: draft.roadbookId,
    savedAt: draft.savedAt,
    payload: draft.payload,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  return blob;
}

export function downloadDraftExport(userId, roadbookId, fileName) {
  const blob = exportDraftToJSON(userId, roadbookId);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName ?? `draft-roadbook-${roadbookId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function cleanupOrphanDrafts(supabase, userId) {
  if (!supabase || !userId) return { removed: 0 };
  let removed = 0;
  const drafts = listUserDrafts(userId);
  for (const draft of drafts) {
    if (typeof draft.roadbookId !== "number" && !Number.isInteger(Number(draft.roadbookId))) continue;
    const rbId = Number(draft.roadbookId);
    if (!rbId) continue;
    try {
      supabase
        .from("roadbooks")
        .select("id", { count: "exact", head: true })
        .eq("id", rbId)
        .eq("owner_id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) {
            removeDraft(userId, rbId);
            removed++;
          }
        });
    } catch {}
  }
  return { removed };
}

export function buildNewDraftPayload(formState) {
  return {
    version: CURRENT_VERSION,
    userId: formState.userId,
    roadbookId: `new:${formState.localDraftId}`,
    baseRemoteUpdatedAt: null,
    savedAt: new Date().toISOString(),
    tabId: formState.tabId,
    payload: {
      title: formState.title ?? "",
      description: formState.description ?? "",
      isPublic: formState.isPublic ?? false,
      project: formState.project ?? "En projet",
      officialDistance: formState.officialDistance ?? "",
      officialElevationGain: formState.officialElevationGain ?? "",
      officialElevationLoss: formState.officialElevationLoss ?? "",
      officialGpx: formState.officialGpx ?? "",
      currentGpx: formState.currentGpx ?? "",
    },
  };
}
