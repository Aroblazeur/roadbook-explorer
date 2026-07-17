import { useCallback, useReducer, useState } from "react";
import { loadStages } from "@/lib/roadbooks/loaders";
import {
  insertStage, deleteStage,
  insertPoi, updatePoi, deletePoi,
  insertVariant, updateVariant, deleteVariant,
  updateStageNotes, updateVariantNotes,
} from "@/lib/roadbooks/writers";
import { defaultStageForm, stageFormReducer } from "./stageFormReducer";
import { buildPoiRecord, buildVariantRecord } from "@/lib/roadbooks/validators";
import { buildStageTitle, synchronizeStagePresentation } from "@/lib/roadbooks/stage-order";

const EMPTY_VARIANT_FORM = {
  stage_id: null,
  parent_stage_label: "",
  title: "",
  type: "",
  sort_order: "",
  departure: "",
  arrival: "",
  description: "",
  distance_km: "",
  elevation_gain_m: "",
  elevation_loss_m: "",
  map_embed_url: "",
  stage_photo_url: "",
  notes: "",
  day: "",
  duration: "",
  editing: null,
};

export function useStageCrud({ supabase, roadbookId, stages, setStages, variantsByStage, setVariantsByStage, reloadPoisVariants, refreshRoadbookVersion }) {
  const [stageForm, stageFormDispatch] = useReducer(stageFormReducer, { ...defaultStageForm });
  const [stageError, setStageError] = useState(null);
  const [stageSuccess, setStageSuccess] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Sub-entity forms
  const [poiForm, setPoiForm] = useState({ stage_id: null, variant_id: null, name: "", region: "", link: "", description: "", photoUrl: "", photoMediaId: null, preview: null, metadata: {}, editing: null });
  const [variantForm, setVariantForm] = useState({ ...EMPTY_VARIANT_FORM });
  const [noteForm, setNoteForm] = useState({ stage_id: null, variant_id: null, text: "", editing: null });

  const findVariant = useCallback((variantId) => {
    if (variantId == null) return null;
    return Object.values(variantsByStage ?? {}).flat().find(variant => variant.id === variantId) ?? null;
  }, [variantsByStage]);

  const clearStageForm = useCallback(() => {
    stageFormDispatch({ type: "RESET" });
  }, []);

  const handleStageSubmit = useCallback(async (e) => {
    e.preventDefault();
    setStageError(null); setStageSuccess(null);
    const dayNumber = Number(stageForm.dayNumber);
    if (!dayNumber) { setStageError("Le numéro d'étape est obligatoire."); return; }
    const notes = stageForm.notes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text }));
    const metadata = { titleMode: stageForm.title.trim() ? "custom" : "auto" };
    if (stageForm.description) metadata.description = stageForm.description;
    const record = {
      roadbook_id: Number(roadbookId), stage_number: dayNumber,
      title: stageForm.title.trim() || buildStageTitle({ departure: stageForm.start, arrival: stageForm.end }, dayNumber),
      sort_order: Math.max(0, ...stages.map(stage => Number(stage.sort_order) || 0)) + 1,
      departure: stageForm.start || null, arrival: stageForm.end || null,
      distance_km: stageForm.dist ? Number(stageForm.dist) : null,
      elevation_gain_m: stageForm.gain ? Number(stageForm.gain) : null,
      elevation_loss_m: stageForm.loss ? Number(stageForm.loss) : null,
      map_embed_url: stageForm.mapEmbed || null,
      stage_photo_url: stageForm.photoUrl || null,
      day: stageForm.day || null,
      duration: stageForm.duration || null,
      notes: notes.length ? notes : [], metadata,
    };

    await insertStage(supabase, record);
    setStageSuccess("Étape créée.");
    clearStageForm();
    const stagesData = await loadStages(supabase, roadbookId);
    setStages(stagesData);
    await refreshRoadbookVersion?.();
  }, [supabase, roadbookId, stageForm, stages, clearStageForm, setStages, refreshRoadbookVersion]);

  const handleDeleteStage = useCallback(async (stageId) => {
    if (!window.confirm("Supprimer cette étape ?")) return;
    setDeleting(stageId);
    try {
      await deleteStage(supabase, stageId);
      setStages(prev => synchronizeStagePresentation(prev.filter(s => s.id !== stageId)));
      await refreshRoadbookVersion?.();
      setStageSuccess("Étape supprimée.");
    } catch (err) { setStageError(err.message); }
    setDeleting(null);
  }, [supabase, setStages, refreshRoadbookVersion]);

  const clearPoiForm = useCallback(() => setPoiForm({ stage_id: null, variant_id: null, name: "", region: "", link: "", description: "", photoUrl: "", photoMediaId: null, preview: null, metadata: {}, editing: null }), []);
  const clearVariantForm = useCallback(() => setVariantForm({ ...EMPTY_VARIANT_FORM }), []);
  const clearNoteForm = useCallback(() => setNoteForm({ stage_id: null, variant_id: null, text: "", editing: null }), []);

  const handlePoiSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    setStageError(null); setStageSuccess(null);
    if (!poiForm.stage_id || !poiForm.name.trim()) {
      setStageError("Le nom du POI est obligatoire.");
      return false;
    }
    try {
      const record = buildPoiRecord(poiForm);
      if (poiForm.editing) {
        await updatePoi(supabase, poiForm.editing, record);
        setStageSuccess("POI mis à jour et vérifié.");
      } else {
        await insertPoi(supabase, record);
        setStageSuccess("POI créé et vérifié.");
      }
      await reloadPoisVariants(stages.map(s => s.id));
      clearPoiForm();
      return true;
    } catch (err) {
      setStageError(`Le POI n'a pas été enregistré : ${err.message ?? String(err)}`);
      return false;
    }
  }, [supabase, poiForm, stages, clearPoiForm, reloadPoisVariants]);

  const handleDeletePoi = useCallback(async (poiId) => {
    if (!window.confirm("Supprimer ce POI ?")) return;
    try {
      await deletePoi(supabase, poiId);
      setStageSuccess("POI supprimé.");
    } catch (err) { setStageError(err.message); return; }
    await reloadPoisVariants(stages.map(s => s.id));
  }, [supabase, stages, reloadPoisVariants]);

  const handleVariantSubmit = useCallback(async (e) => {
    e.preventDefault();
    setStageError(null); setStageSuccess(null);
    if (!variantForm.stage_id) { setStageError("L'étape parente est obligatoire."); return; }
    if (!Number(variantForm.sort_order) || Number(variantForm.sort_order) < 1) { setStageError("Le numéro de variante est obligatoire."); return; }
    const record = buildVariantRecord(variantForm);
    if (variantForm.editing) {
      await updateVariant(supabase, variantForm.editing, record);
      setStageSuccess("Variante mise à jour.");
    } else {
      await insertVariant(supabase, record);
      setStageSuccess("Variante créée.");
    }
    clearVariantForm();
    await reloadPoisVariants(stages.map(s => s.id));
  }, [supabase, variantForm, stages, clearVariantForm, reloadPoisVariants]);

  const handleDeleteVariant = useCallback(async (variantId) => {
    if (!window.confirm("Supprimer cette variante ?")) return;
    try {
      await deleteVariant(supabase, variantId);
      setStageSuccess("Variante supprimée.");
    } catch (err) { setStageError(err.message); return; }
    await reloadPoisVariants(stages.map(s => s.id));
  }, [supabase, stages, reloadPoisVariants]);

  const handleNoteSubmit = useCallback(async (e) => {
    e.preventDefault();
    const { stage_id, variant_id, text, editing } = noteForm;
    if (!stage_id) return;
    const entity = variant_id != null ? findVariant(variant_id) : stages.find(s => s.id === stage_id);
    if (!entity) return;
    const notes = Array.isArray(entity.notes) ? [...entity.notes] : [];
    if (editing != null && notes[editing]) {
      notes[editing] = { ...notes[editing], text: text.trim() };
    } else {
      notes.push({ text: text.trim() });
    }
    try {
      if (variant_id != null) await updateVariantNotes(supabase, variant_id, notes);
      else await updateStageNotes(supabase, stage_id, notes);
      setStageSuccess(editing != null ? "Note modifiée." : "Note ajoutée.");
      clearNoteForm();
      if (variant_id != null) {
        setVariantsByStage(previous => Object.fromEntries(
          Object.entries(previous).map(([stageId, variants]) => [
            stageId,
            variants.map(variant => variant.id === variant_id ? { ...variant, notes } : variant),
          ]),
        ));
      } else {
        setStages(previous => previous.map(stage => stage.id === stage_id ? { ...stage, notes } : stage));
      }
      await refreshRoadbookVersion?.();
    } catch (err) { setStageError(err.message ?? String(err)); }
  }, [supabase, noteForm, stages, clearNoteForm, setStages, setVariantsByStage, findVariant, refreshRoadbookVersion]);

  const handleDeleteNote = useCallback(async (stageId, noteIndex, variantId = null) => {
    if (!window.confirm("Supprimer cette note ?")) return;
    const entity = variantId != null ? findVariant(variantId) : stages.find(s => s.id === stageId);
    if (!entity) return;
    const notes = Array.isArray(entity.notes) ? [...entity.notes] : [];
    notes.splice(noteIndex, 1);
    try {
      if (variantId != null) await updateVariantNotes(supabase, variantId, notes);
      else await updateStageNotes(supabase, stageId, notes);
      setStageSuccess("Note supprimée.");
      if (variantId != null) {
        setVariantsByStage(previous => Object.fromEntries(
          Object.entries(previous).map(([parentStageId, variants]) => [
            parentStageId,
            variants.map(variant => variant.id === variantId ? { ...variant, notes } : variant),
          ]),
        ));
      } else {
        setStages(previous => previous.map(stage => stage.id === stageId ? { ...stage, notes } : stage));
      }
      await refreshRoadbookVersion?.();
    } catch (err) { setStageError(err.message ?? String(err)); }
  }, [supabase, stages, setStages, setVariantsByStage, findVariant, refreshRoadbookVersion]);

  return {
    stageForm, stageFormDispatch,
    stageError, setStageError,
    stageSuccess, setStageSuccess,
    deleting,
    clearStageForm,
    handleStageSubmit,
    handleDeleteStage,

    poiForm, setPoiForm, clearPoiForm,
    handlePoiSubmit, handleDeletePoi,

    variantForm, setVariantForm, clearVariantForm,
    handleVariantSubmit, handleDeleteVariant,

    noteForm, setNoteForm, clearNoteForm,
    handleNoteSubmit, handleDeleteNote,

  };
}
