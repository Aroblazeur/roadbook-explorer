import { useCallback, useRef, useState } from "react";
import { loadPois, loadRoadbookSafe, loadStages, loadVariants } from "@/lib/roadbooks/loaders";
import { groupByStageId } from "@/lib/roadbooks/validators";

export function useRoadbookData({ supabase, roadbookId, user }) {
  const [roadbook, setRoadbook] = useState(null);
  const [stages, setStages] = useState([]);
  const [poisByStage, setPoisByStage] = useState({});
  const [variantsByStage, setVariantsByStage] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const cancelledRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (!user || !roadbookId) return null;
    setLoading(true);
    setFetchError(null);
    try {
      const data = await loadRoadbookSafe(supabase, roadbookId);
      if (!data) {
        if (!cancelledRef.current) {
          setFetchError("Roadbook introuvable.");
          setLoading(false);
        }
        return null;
      }
      if (!cancelledRef.current) setRoadbook(data);
      const stagesData = await loadStages(supabase, roadbookId);
      if (cancelledRef.current) return null;
      setStages(stagesData);
      const stageIds = stagesData.map(s => s.id);
      if (stageIds.length) {
        const [pois, variants] = await Promise.all([
          loadPois(supabase, stageIds),
          loadVariants(supabase, stageIds),
        ]);
        if (cancelledRef.current) return null;
        setPoisByStage(groupByStageId(pois));
        setVariantsByStage(groupByStageId(variants));
      } else {
        setPoisByStage({});
        setVariantsByStage({});
      }
      if (!cancelledRef.current) setLoading(false);
      return data;
    } catch (err) {
      if (!cancelledRef.current) setFetchError(err.message);
      if (!cancelledRef.current) setLoading(false);
      return null;
    }
  }, [supabase, roadbookId, user]);

  const reloadStages = useCallback(async () => {
    const stagesData = await loadStages(supabase, roadbookId);
    setStages(stagesData);
    const stageIds = stagesData.map(s => s.id);
    if (stageIds.length) {
      const [pois, variants] = await Promise.all([
        loadPois(supabase, stageIds),
        loadVariants(supabase, stageIds),
      ]);
      setPoisByStage(groupByStageId(pois));
      setVariantsByStage(groupByStageId(variants));
    }
  }, [supabase, roadbookId]);

  const reloadPoisVariants = useCallback(async (stageIds) => {
    if (!stageIds?.length) return;
    const [pois, variants] = await Promise.all([
      loadPois(supabase, stageIds),
      loadVariants(supabase, stageIds),
    ]);
    setPoisByStage(groupByStageId(pois));
    setVariantsByStage(groupByStageId(variants));
  }, [supabase]);

  return {
    roadbook, setRoadbook,
    stages, setStages,
    poisByStage, setPoisByStage,
    variantsByStage, setVariantsByStage,
    loading, fetchError,
    loadAll,
    reloadStages,
    reloadPoisVariants,
  };
}
