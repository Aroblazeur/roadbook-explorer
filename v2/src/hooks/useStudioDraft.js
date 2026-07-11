import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildDraftPayload,
  generateTabId,
  isDraftNewerThanRemote,
  loadDraft,
  removeDraft,
  saveDraft,
  validateDraft,
} from "@/lib/studio-drafts";

const AUTOSAVE_DELAY = 1000;

export function useStudioDraft({
  user,
  roadbookId,
  roadbook,
  stages,
  poisByStage,
  variantsByStage,
  images,
  gpxOfficial,
  gpxCustom,
  gpxByStage,
  title,
  description,
  isPublic,
  activity,
  destination,
  project,
  officialDist,
  officialGain,
  officialLoss,
  officialGpx,
  officialMap,
  traceDist,
  traceGain,
  traceLoss,
  traceGpx,
  traceMap,
  coverMode,
  coverUrl,
  coverMediaId,
  loaded,
}) {
  const tabId = useRef(null);
  const [draftStatus, setDraftStatus] = useState("idle");
  const [draftError, setDraftError] = useState(null);
  const [restoredInfo, setRestoredInfo] = useState(null);
  const lastSavedRef = useRef(null);
  const saveTimerRef = useRef(null);
  const initDoneRef = useRef(false);
  const isRestoringRef = useRef(false);
  const prevIdRef = useRef(roadbookId);

  if (!tabId.current) {
    tabId.current = generateTabId();
  }

  const currentState = {
    userId: user?.id,
    roadbookId,
    tabId: tabId.current,
    baseRemoteUpdatedAt: roadbook?.updated_at ?? null,
    roadbook,
    stages,
    poisByStage,
    variantsByStage,
    images,
    gpxOfficial,
    gpxCustom,
    gpxByStage,
    title,
    description,
    isPublic,
    activity,
    destination,
    project,
    officialDist,
    officialGain,
    officialLoss,
    officialGpx,
    officialMap,
    traceDist,
    traceGain,
    traceLoss,
    traceGpx,
    traceMap,
    coverMode,
    coverUrl,
    coverMediaId,
  };

  const stateRef = useRef(currentState);
  stateRef.current = currentState;

  const [restoredDraft, setRestoredDraft] = useState(null);

  const restoreIfNeeded = useCallback(() => {
    if (!user?.id || !roadbookId || !loaded) return;
    if (initDoneRef.current) return;

    const draft = loadDraft(user.id, roadbookId);
    if (!draft) {
      initDoneRef.current = true;
      return;
    }

    if (!validateDraft(draft)) {
      removeDraft(user.id, roadbookId);
      initDoneRef.current = true;
      return;
    }

    if (draft.tabId === tabId.current) {
      removeDraft(user.id, roadbookId);
      initDoneRef.current = true;
      return;
    }

    if (!roadbook) {
      initDoneRef.current = true;
      return;
    }

    const remoteUpdatedAt = roadbook?.updated_at;
    const draftIsNewer = isDraftNewerThanRemote(draft, remoteUpdatedAt);

    if (!draftIsNewer) {
      removeDraft(user.id, roadbookId);
      initDoneRef.current = true;
      return;
    }

    isRestoringRef.current = true;
    setRestoredInfo({
      savedAt: draft.savedAt,
      message: "Des modifications locales non synchronisées ont été restaurées.",
    });
    setRestoredDraft(draft.payload);
    lastSavedRef.current = draft.savedAt;
    setDraftStatus("unsaved");
    initDoneRef.current = true;
  }, [user?.id, roadbookId, loaded, roadbook]);

  const doSave = useCallback(() => {
    const s = stateRef.current;
    if (!s.userId || !s.roadbookId) return;
    if (isRestoringRef.current) return;
    if (!initDoneRef.current) return;

    const payload = buildDraftPayload(s);
    setDraftStatus("saving");
    const result = saveDraft(s.userId, s.roadbookId, payload);
    if (result.ok) {
      lastSavedRef.current = payload.savedAt;
      setDraftStatus("saved");
      setDraftError(null);
    } else {
      setDraftStatus("error");
      setDraftError(result.error === "quota_exceeded" ? "Espace de stockage insuffisant." : "Erreur de sauvegarde.");
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (isRestoringRef.current) return;
    if (!initDoneRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setDraftStatus("unsaved");
    saveTimerRef.current = setTimeout(doSave, AUTOSAVE_DELAY);
  }, [doSave]);

  const saveImmediate = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    doSave();
  }, [doSave]);

  useEffect(() => {
    if (!user?.id || !roadbookId || !loaded) return;
    restoreIfNeeded();
  }, [user?.id, roadbookId, loaded, restoreIfNeeded]);

  useEffect(() => {
    if (isRestoringRef.current) return;
    if (!initDoneRef.current) return;
    scheduleSave();
  }, [
    title, description, isPublic, activity, destination, project,
    officialDist, officialGain, officialLoss, officialGpx, officialMap,
    traceDist, traceGain, traceLoss, traceGpx, traceMap,
    stages, poisByStage, variantsByStage,
    coverMode, coverUrl, coverMediaId,
    images, gpxOfficial, gpxCustom, gpxByStage,
    scheduleSave,
  ]);

  useEffect(() => {
    if (prevIdRef.current && prevIdRef.current !== roadbookId) {
      saveImmediate();
      initDoneRef.current = false;
      isRestoringRef.current = false;
      setDraftStatus("idle");
      setRestoredInfo(null);
    }
    prevIdRef.current = roadbookId;
  }, [roadbookId, saveImmediate]);

  useEffect(() => {
    function handlePageHide() {
      if (initDoneRef.current && !isRestoringRef.current) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const s = stateRef.current;
        if (s.userId && s.roadbookId) {
          const payload = buildDraftPayload(s);
          saveDraft(s.userId, s.roadbookId, payload);
        }
      }
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  useEffect(() => {
    function handleStorage(e) {
      if (!e.key || !e.key.startsWith("roadbook-explorer:draft")) return;
      if (!user?.id) return;
      const parts = e.key.split(":");
      if (parts.length < 5) return;
      const keyUserId = parts[3];
      const keyRbId = parts[4];
      if (keyUserId !== user.id || keyRbId !== String(roadbookId)) return;
      if (!e.newValue) {
        setDraftStatus("idle");
        return;
      }
      try {
        const incoming = JSON.parse(e.newValue);
        if (!validateDraft(incoming)) return;
        if (incoming.tabId === tabId.current) return;
        if (isRestoringRef.current) return;
        setDraftStatus("conflict");
        setDraftError("Modifié dans un autre onglet.");
      } catch {}
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [user?.id, roadbookId]);

  const markSynced = useCallback(() => {
    if (user?.id && roadbookId) {
      removeDraft(user.id, roadbookId);
    }
    setDraftStatus("synced");
    setDraftError(null);
    lastSavedRef.current = null;
    isRestoringRef.current = false;
    initDoneRef.current = false;
  }, [user?.id, roadbookId]);

  const markRemoteConflict = useCallback(() => {
    setDraftStatus("conflict");
    setDraftError("La version distante a changé depuis l'ouverture.");
  }, []);

  const dismissConflict = useCallback(() => {
    setDraftStatus("unsaved");
    setDraftError(null);
  }, []);

  const clearDraft = useCallback(() => {
    if (user?.id && roadbookId) {
      removeDraft(user.id, roadbookId);
    }
    setDraftStatus("idle");
    setDraftError(null);
    lastSavedRef.current = null;
  }, [user?.id, roadbookId]);

  const resetRestoredInfo = useCallback(() => {
    setRestoredInfo(null);
    setRestoredDraft(null);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return {
    draftStatus,
    draftError,
    restoredInfo,
    restoredDraft,
    saveImmediate,
    markSynced,
    markRemoteConflict,
    dismissConflict,
    clearDraft,
    resetRestoredInfo,
    tabId: tabId.current,
  };
}
