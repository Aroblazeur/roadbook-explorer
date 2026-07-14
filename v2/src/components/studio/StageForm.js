"use client";

export default function StageForm({
  showStageForm,
  setShowStageForm,
  stageForm,
  stageFormDispatch,
  clearStageForm,
  handleStageSubmit,
}) {
  if (showStageForm) {
    return (
      <div className="studio-create-form">
        <h3>Nouvelle étape</h3>
        <form onSubmit={handleStageSubmit}>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>N° étape<input type="number" value={stageForm.dayNumber} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "dayNumber", value: e.target.value })} required /></label>
            <label>Titre<input type="text" value={stageForm.title} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "title", value: e.target.value })} /></label>
            <label>Départ<input type="text" value={stageForm.start} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "start", value: e.target.value })} /></label>
            <label>Arrivée<input type="text" value={stageForm.end} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "end", value: e.target.value })} /></label>
            <label>Distance (km)<input type="number" step="0.01" value={stageForm.dist} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "dist", value: e.target.value })} /></label>
            <label>D+ (m)<input type="number" value={stageForm.gain} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "gain", value: e.target.value })} /></label>
            <label>D- (m)<input type="number" value={stageForm.loss} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "loss", value: e.target.value })} /></label>
            <label>Difficulté<input type="text" value={stageForm.difficulty} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "difficulty", value: e.target.value })} /></label>
            <label>Hébergement<input type="text" value={stageForm.accommodation} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "accommodation", value: e.target.value })} /></label>
            <label>Description<textarea value={stageForm.description} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "description", value: e.target.value })} /></label>
            <label>Notes (une par ligne)<textarea value={stageForm.notes} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "notes", value: e.target.value })} /></label>
            <label>Avertissement<input type="text" value={stageForm.warning} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "warning", value: e.target.value })} /></label>
            <label>Jour<textarea value={stageForm.day} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "day", value: e.target.value })} /></label>
            <label>Libellé étape<input type="text" value={stageForm.label} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "label", value: e.target.value })} /></label>
            <label>Durée<input type="text" value={stageForm.duration} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "duration", value: e.target.value })} /></label>
            <div>
              <label htmlFor="stage-photo-url">Photo (URL ou fichier)</label>
              <div className="studio-resource-field">
                <input id="stage-photo-url" type="url" value={stageForm.photoUrl} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "photoUrl", value: e.target.value })} />
              </div>
              <small className="text-muted">L'import de fichier sera disponible après la création de l'étape.</small>
            </div>
            <label className="studio-form-grid__full">Carte intégrée (iframe)<input type="url" value={stageForm.mapEmbed} onChange={e => stageFormDispatch({ type: "SET_FIELD", field: "mapEmbed", value: e.target.value })} /></label>
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
