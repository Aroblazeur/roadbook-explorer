import { useCallback, useReducer, useState } from "react";
import { loadStages } from "@/lib/roadbooks/loaders";
import {
  insertStage, updateStage, deleteStage,
  insertPoi, updatePoi, deletePoi,
  insertVariant, updateVariant, deleteVariant,
  updateStageNotes, updateStageAccommodation,
  swapStageNumbers,
} from "@/lib/roadbooks/writers";
import { defaultStageForm, stageFormReducer } from "./stageFormReducer";
import { buildPoiRecord } from "@/lib/roadbooks/validators";
import {
  buildAlternativeAccommodationUpdate,
  buildClearPrimaryAccommodationUpdate,
  buildDemotePrimaryUpdate,
  buildPrimaryAccommodationUpdate,
  buildPromoteAlternativeUpdate,
  buildRemoveAlternativeUpdate,
} from "@/lib/roadbooks/accommodations";

export function useStageCrud({ supabase, roadbookId, stages, setStages, reloadPoisVariants, reloadStages }) {
  const [stageForm, stageFormDispatch] = useReducer(stageFormReducer, { ...defaultStageForm });
  const [stageError, setStageError] = useState(null);
  const [stageSuccess, setStageSuccess] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Sub-entity forms
  const [poiForm, setPoiForm] = useState({ stage_id: null, name: "", region: "", link: "", description: "", editing: null });
  const [variantForm, setVariantForm] = useState({ stage_id: null, title: "", type: "", departure: "", arrival: "", description: "", distance_km: "", elevation_gain_m: "", elevation_loss_m: "", map_embed_url: "", notes: "", editing: null });
  const [noteForm, setNoteForm] = useState({ stage_id: null, text: "", editing: null });
  const [accommodationForm, setAccommodationForm] = useState({ stage_id: null, name: "", url: "", photo: "", type: "", note: "", kind: "primary", editing: null });

  const clearStageForm = useCallback(() => {
    stageFormDispatch({ type: "RESET" });
  }, []);

  const handleStageSubmit = useCallback(async (e) => {
    e.preventDefault();
    setStageError(null); setStageSuccess(null);
    const dayNumber = Number(stageForm.dayNumber);
    if (!dayNumber) { setStageError("Le numéro d'étape est obligatoire."); return; }
    const notes = stageForm.notes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text }));
    const metadata = {};
    if (stageForm.difficulty) metadata.difficulty = stageForm.difficulty;
    if (stageForm.description) metadata.description = stageForm.description;
    if (stageForm.warning) metadata.warning = stageForm.warning;
    const record = {
      roadbook_id: Number(roadbookId), stage_number: dayNumber, title: stageForm.title || null,
      departure: stageForm.start || null, arrival: stageForm.end || null,
      distance_km: stageForm.dist ? Number(stageForm.dist) : null,
      elevation_gain_m: stageForm.gain ? Number(stageForm.gain) : null,
      elevation_loss_m: stageForm.loss ? Number(stageForm.loss) : null,
      accommodation_name: stageForm.accommodation || null,
      map_embed_url: stageForm.mapEmbed || null,
      stage_photo_url: stageForm.photoUrl || null,
      day: stageForm.day || null,
      stage_label: stageForm.label || null,
      duration: stageForm.duration || null,
      notes: notes.length ? notes : [], metadata,
    };

    await insertStage(supabase, record);
    setStageSuccess("Étape créée.");
    clearStageForm();
    const stagesData = await loadStages(supabase, roadbookId);
    setStages(stagesData);
  }, [supabase, roadbookId, stageForm, clearStageForm, setStages]);

  const handleDeleteStage = useCallback(async (stageId) => {
    if (!window.confirm("Supprimer cette étape ?")) return;
    setDeleting(stageId);
    try {
      await deleteStage(supabase, stageId);
      setStages(prev => prev.filter(s => s.id !== stageId));
      setStageSuccess("Étape supprimée.");
    } catch (err) { setStageError(err.message); }
    setDeleting(null);
  }, [supabase, setStages]);

  const clearPoiForm = useCallback(() => setPoiForm({ stage_id: null, name: "", region: "", link: "", description: "", editing: null }), []);
  const clearVariantForm = useCallback(() => setVariantForm({ stage_id: null, title: "", type: "", departure: "", arrival: "", description: "", distance_km: "", elevation_gain_m: "", elevation_loss_m: "", map_embed_url: "", notes: "", editing: null }), []);
  const clearNoteForm = useCallback(() => setNoteForm({ stage_id: null, text: "", editing: null }), []);
  const clearAccommodationForm = useCallback(() => setAccommodationForm({ stage_id: null, name: "", url: "", photo: "", type: "", note: "", kind: "primary", editing: null }), []);

  const handlePoiSubmit = useCallback(async (e) => {
    e.preventDefault();
    setStageError(null); setStageSuccess(null);
    const record = buildPoiRecord(poiForm);
    if (poiForm.editing) {
      await updatePoi(supabase, poiForm.editing, record);
      setStageSuccess("POI mis à jour.");
    } else {
      await insertPoi(supabase, record);
      setStageSuccess("POI créé.");
    }
    clearPoiForm();
    await reloadPoisVariants(stages.map(s => s.id));
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
    const meta = {};
    if (variantForm.type) meta.type = variantForm.type;
    const notesArr = variantForm.notes ? variantForm.notes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text })) : [];
    const record = { stage_id: variantForm.stage_id, label: variantForm.title, description: variantForm.description || null, distance_km: variantForm.distance_km ? Number(variantForm.distance_km) : null, departure: variantForm.departure || null, arrival: variantForm.arrival || null, elevation_gain_m: variantForm.elevation_gain_m ? Number(variantForm.elevation_gain_m) : null, elevation_loss_m: variantForm.elevation_loss_m ? Number(variantForm.elevation_loss_m) : null, map_embed_url: variantForm.map_embed_url || null, notes: notesArr.length ? notesArr : [], metadata: Object.keys(meta).length ? meta : {} };
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
    const { stage_id, text, editing } = noteForm;
    if (!stage_id) return;
    const stage = stages.find(s => s.id === stage_id);
    if (!stage) return;
    const notes = Array.isArray(stage.notes) ? [...stage.notes] : [];
    if (editing != null && notes[editing]) {
      notes[editing] = { ...notes[editing], text: text.trim() };
    } else {
      notes.push({ text: text.trim() });
    }
    try {
      await updateStageNotes(supabase, stage_id, notes);
      setStageSuccess(editing != null ? "Note modifiée." : "Note ajoutée.");
      clearNoteForm();
      const refreshed = await loadStages(supabase, roadbookId);
      if (refreshed) setStages(refreshed);
    } catch (err) { setStageError(err.message ?? String(err)); }
  }, [supabase, roadbookId, noteForm, stages, clearNoteForm, setStages]);

  const handleDeleteNote = useCallback(async (stageId, noteIndex) => {
    if (!window.confirm("Supprimer cette note ?")) return;
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;
    const notes = Array.isArray(stage.notes) ? [...stage.notes] : [];
    notes.splice(noteIndex, 1);
    try {
      await updateStageNotes(supabase, stageId, notes);
      setStageSuccess("Note supprimée.");
      const refreshed = await loadStages(supabase, roadbookId);
      if (refreshed) setStages(refreshed);
    } catch (err) { setStageError(err.message ?? String(err)); }
  }, [supabase, roadbookId, stages, setStages]);

  const handleAccommodationSubmit = useCallback(async (e) => {
    e.preventDefault();
    const { stage_id, name, url, photo, type, note, kind, editing } = accommodationForm;
    if (!stage_id || ![name, url, photo].some(value => value.trim())) {
      setStageError("Renseignez au moins le nom, le lien ou la photo de l'hébergement.");
      return;
    }
    const stage = stages.find(item => item.id === stage_id);
    if (!stage) return;
    try {
      const value = { name, url, photo, type, note };
      const payload = kind === "alternative"
        ? buildAlternativeAccommodationUpdate(stage, value, editing)
        : buildPrimaryAccommodationUpdate(stage, value);
      await updateStageAccommodation(supabase, stage_id, payload);
      setStageSuccess(editing != null ? "Hébergement modifié." : "Hébergement ajouté.");
      clearAccommodationForm();
      const refreshed = await loadStages(supabase, roadbookId);
      if (refreshed) setStages(refreshed);
    } catch (err) { setStageError(err.message ?? String(err)); }
  }, [supabase, roadbookId, accommodationForm, stages, clearAccommodationForm, setStages]);

  const handleClearAccommodation = useCallback(async (stageId) => {
    if (!window.confirm("Vider les informations d'hébergement de cette étape ?")) return;
    try {
      const stage = stages.find(item => item.id === stageId);
      if (!stage) return;
      await updateStageAccommodation(supabase, stageId, buildClearPrimaryAccommodationUpdate(stage));
      setStageSuccess("Hébergement supprimé.");
      const refreshed = await loadStages(supabase, roadbookId);
      if (refreshed) setStages(refreshed);
    } catch (err) { setStageError(err.message ?? String(err)); }
  }, [supabase, roadbookId, stages, setStages]);

  const updateAccommodationPlacement = useCallback(async (stageId, buildUpdate, successMessage) => {
    const stage = stages.find(item => item.id === stageId);
    if (!stage) return;
    try {
      await updateStageAccommodation(supabase, stageId, buildUpdate(stage));
      setStageSuccess(successMessage);
      clearAccommodationForm();
      const refreshed = await loadStages(supabase, roadbookId);
      if (refreshed) setStages(refreshed);
    } catch (err) { setStageError(err.message ?? String(err)); }
  }, [supabase, roadbookId, stages, clearAccommodationForm, setStages]);

  const handleDeleteAlternative = useCallback(async (stageId, index) => {
    if (!window.confirm("Supprimer cet hébergement alternatif ?")) return;
    await updateAccommodationPlacement(stageId, stage => buildRemoveAlternativeUpdate(stage, index), "Hébergement alternatif supprimé.");
  }, [updateAccommodationPlacement]);

  const handlePromoteAlternative = useCallback(async (stageId, index) => {
    await updateAccommodationPlacement(stageId, stage => buildPromoteAlternativeUpdate(stage, index), "Hébergement défini comme principal.");
  }, [updateAccommodationPlacement]);

  const handleDemotePrimary = useCallback(async (stageId) => {
    await updateAccommodationPlacement(stageId, buildDemotePrimaryUpdate, "Hébergement déplacé dans les alternatives.");
  }, [updateAccommodationPlacement]);

  const handleMoveStage = useCallback(async (stage, direction) => {
    const index = stages.indexOf(stage);
    if (index < 0) return;
    const otherIndex = direction === "up" ? index - 1 : index + 1;
    if (otherIndex < 0 || otherIndex >= stages.length) return;
    const other = stages[otherIndex];
    try {
      await swapStageNumbers(supabase, stage.id, other.id);
      const stagesData = await loadStages(supabase, roadbookId);
      setStages(stagesData);
    } catch (err) { setStageError(err.message); }
  }, [supabase, roadbookId, stages, setStages]);

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

    accommodationForm, setAccommodationForm, clearAccommodationForm,
    handleAccommodationSubmit, handleClearAccommodation,
    handleDeleteAlternative, handlePromoteAlternative, handleDemotePrimary,

    handleMoveStage,
  };
}
