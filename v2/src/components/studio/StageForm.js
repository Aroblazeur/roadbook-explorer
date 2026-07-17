"use client";

import { buildStageTitle } from "@/lib/roadbooks/stage-order";
import useRevealForm from "@/hooks/studio/useRevealForm";

export default function StageForm({
  showStageForm,
  setShowStageForm,
  stageForm,
  stageFormDispatch,
  clearStageForm,
  handleStageSubmit,
}) {
  const formRef = useRevealForm(showStageForm ? "new-stage" : null);

  if (showStageForm) {
    const generatedTitle = buildStageTitle(
      { departure: stageForm.start, arrival: stageForm.end },
      stageForm.dayNumber || "…",
    );
    return (
      <div className="studio-create-form" ref={formRef}>
        <h3>Nouvelle étape</h3>
        <form onSubmit={handleStageSubmit}>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>N° étape<input data-form-initial-focus type="number" value={stageForm.dayNumber} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "dayNumber", value: e.target.value })} required /></label>
            <label>Titre personnalisé (facultatif)<input type="text" value={stageForm.title} placeholder={generatedTitle} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "title", value: e.target.value })} /></label>
            <label>Départ<input type="text" value={stageForm.start} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "start", value: e.target.value })} /></label>
            <label>Arrivée<input type="text" value={stageForm.end} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "end", value: e.target.value })} /></label>
            <label>Distance (km)<input type="number" step="0.01" value={stageForm.dist} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "dist", value: e.target.value })} /></label>
            <label>D+ (m)<input type="number" value={stageForm.gain} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "gain", value: e.target.value })} /></label>
            <label>D- (m)<input type="number" value={stageForm.loss} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "loss", value: e.target.value })} /></label>
            <label>Description<textarea value={stageForm.description} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "description", value: e.target.value })} /></label>
            <label>Notes (une par ligne)<textarea value={stageForm.notes} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "notes", value: e.target.value })} /></label>
            <label>Jour<textarea value={stageForm.day} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "day", value: e.target.value })} /></label>
            <label>Durée (automatique si vide)<input type="text" value={stageForm.duration} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "duration", value: e.target.value })} /></label>
            <div>
              <label htmlFor="stage-photo-url">Photo (URL ou fichier)</label>
              <div className="studio-resource-field">
                <input id="stage-photo-url" type="url" value={stageForm.photoUrl} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "photoUrl", value: e.target.value })} />
              </div>
              <small className="text-muted">L'import de fichier sera disponible après la création de l'étape.</small>
            </div>
            <label className="studio-form-grid__full">Carte (lien Google Maps ou intégration)<input type="url" value={stageForm.mapEmbed} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "mapEmbed", value: e.target.value })} /></label>
          </div>
          <div className="studio-create-form__actions">
            <button type="submit">Créer l'étape</button>
            <button type="button" className="terrain-button--secondary" onClick={() => { clearStageForm(); setShowStageForm(false); }}>Annuler</button>
          </div>
        </form>
      </div>
    );
  }

  return null;
}
