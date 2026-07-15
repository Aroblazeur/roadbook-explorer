import { useCallback, useState } from "react";
import { conditionalUpdateRoadbook, takeSnapshot, acquireSyncLockWithTabId, releaseSyncLock, verifyAfterSync, getRemoteUpdatedAt } from "@/lib/sync-helpers";

export function useSaveWithLock({ supabase, id, tabId, roadbook, stages, poisByStage, variantsByStage, setRoadbook, onError, onSuccess, markRemoteConflict, markSynced, saveImmediate }) {
  const [saving, setSaving] = useState(false);

  const saveWithLock = useCallback(async ({ getUpdateFields, getUpdatedRoadbook, persistRelated, successMessage }) => {
    onError(null); onSuccess(null); setSaving(true);
    const lock = acquireSyncLockWithTabId(id, tabId);
    if (!lock.ok) { onError("Synchronisation verrouillée par un autre onglet."); setSaving(false); return false; }
    try {
      const snapshot = takeSnapshot({ roadbook, stages, poisByStage, variantsByStage, roadbookId: id });
      const updateFields = getUpdateFields();
      const result = await conditionalUpdateRoadbook(supabase, id, updateFields, roadbook?.updated_at);
      if (!result.ok) {
        if (result.error === "conflict") { saveImmediate(); markRemoteConflict(); onError("Conflit de version. Sauvegarde locale conservée."); }
        else onError(result.error);
        return false;
      }
      await persistRelated?.();
      const verify = await verifyAfterSync(supabase, id, snapshot);
      if (!verify.ok) {
        saveImmediate(); markRemoteConflict(); onError("Conflit après synchronisation. Version locale sauvegardée.");
        return false;
      }
      setRoadbook(prev => getUpdatedRoadbook(prev, { ...result.data, updated_at: verify.remoteUpdatedAt ?? result.data.updated_at }));
      markSynced();
      try { await fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roadbookId: id }) }); } catch {}
      onSuccess(successMessage);
      return true;
    } catch (error) {
      saveImmediate();
      const remoteUpdatedAt = await getRemoteUpdatedAt(supabase, id);
      if (remoteUpdatedAt) setRoadbook(previous => ({ ...previous, updated_at: remoteUpdatedAt }));
      onError(error?.message ?? String(error));
      return false;
    } finally {
      releaseSyncLock(id, tabId);
      setSaving(false);
    }
  }, [supabase, id, tabId, roadbook, stages, poisByStage, variantsByStage, setRoadbook, onError, onSuccess, markRemoteConflict, markSynced, saveImmediate]);

  return { saveWithLock, saving };
}
