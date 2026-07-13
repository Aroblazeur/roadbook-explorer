import { useCallback, useState } from "react";
import { conditionalUpdateRoadbook, takeSnapshot, acquireSyncLockWithTabId, releaseSyncLock, verifyAfterSync } from "@/lib/sync-helpers";

export function useSaveWithLock({ supabase, id, tabId, roadbook, stages, poisByStage, variantsByStage, setRoadbook, onError, onSuccess, markRemoteConflict, markSynced, saveImmediate }) {
  const [saving, setSaving] = useState(false);

  const saveWithLock = useCallback(async ({ getUpdateFields, getUpdatedRoadbook, successMessage }) => {
    onError(null); onSuccess(null); setSaving(true);
    const lock = acquireSyncLockWithTabId(id, tabId);
    if (!lock.ok) { onError("Synchronisation verrouillée par un autre onglet."); setSaving(false); return; }
    const snapshot = takeSnapshot({ roadbook, stages, poisByStage, variantsByStage, roadbookId: id });
    const updateFields = getUpdateFields();
    const result = await conditionalUpdateRoadbook(supabase, id, updateFields, roadbook?.updated_at);
    if (!result.ok) {
      if (result.error === "conflict") { saveImmediate(); markRemoteConflict(); onError("Conflit de version. Sauvegarde locale conservée."); }
      else onError(result.error);
      releaseSyncLock(id, tabId); setSaving(false); return;
    }
    const verify = await verifyAfterSync(supabase, id, snapshot);
    if (!verify.ok) { saveImmediate(); markRemoteConflict(); onError("Conflit après synchronisation. Version locale sauvegardée."); releaseSyncLock(id, tabId); setSaving(false); return; }
    setRoadbook(prev => getUpdatedRoadbook(prev, result.data));
    markSynced(); releaseSyncLock(id, tabId);
    try { await fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roadbookId: id }) }); } catch {}
    onSuccess(successMessage); setSaving(false);
  }, [supabase, id, tabId, roadbook, stages, poisByStage, variantsByStage, setRoadbook, onError, onSuccess, markRemoteConflict, markSynced, saveImmediate]);

  return { saveWithLock, saving };
}
