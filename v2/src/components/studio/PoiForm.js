"use client";

export default function PoiForm({
  stageId,
  stagePois,
  poiForm,
  setPoiForm,
  clearPoiForm,
  handlePoiSubmit,
  handleDeletePoi,
  poiIndex,
  handleEnrichPoi,
  enrichingPoi,
}) {
  return (
    <div className="studio-stage-extra">
      <div className="studio-stage-extra__header">
        <h5>Points d'intérêt ({stagePois.length})</h5>
        <button type="button" className="terrain-button terrain-button--secondary" onClick={() => setPoiForm({ ...poiForm, stage_id: stageId })}>Ajouter un POI</button>
      </div>
      <div className="studio-sublist__list">
        {stagePois.length === 0 && <p className="studio-detail--empty">Aucun POI.</p>}
        {stagePois.map(poi => (
          <article key={poi.id} className="studio-subitem-card">
            <div className="studio-subitem-card__header">
              <strong>{poi.poi_type && <span>[{poi.poi_type}] </span>}{poi.name}</strong>
              <button type="button" className="terrain-button terrain-button--danger" onClick={() => handleDeletePoi(poi.id)}>Supprimer</button>
            </div>
            <div className="studio-form-grid studio-form-grid--compact">
              {poi.description && <label className="studio-form-grid__full">Description<span>{poi.description}</span></label>}
              {poi.link_url && <label>Lien<span>{poi.link_url}</span></label>}
              {poi.image_url && <label className="studio-form-grid__full">Image<img src={poi.image_url} alt="" style={{ maxWidth: "100%", maxHeight: "160px", borderRadius: "4px", marginTop: "0.3rem" }} /></label>}
              {poi.region && <label>Région<span>{poi.region}</span></label>}
            </div>
            <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => {
                setPoiForm({ stage_id: stageId, type: poi.poi_type ?? "", name: poi.name, region: poi.region ?? "", description: poi.description ?? "", editing: poi.id });
              }}>✎</button>
              {poiIndex && (
                <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => handleEnrichPoi(poi, stageId)} disabled={enrichingPoi === poi.id}>
                  {enrichingPoi === poi.id ? "..." : "Enrichir"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {poiForm.stage_id === stageId && (
        <form onSubmit={handlePoiSubmit} className="studio-create-form" style={{ marginTop: "0.5rem" }}>
          <h4>{poiForm.editing ? "Modifier le POI" : "Ajouter un POI"}</h4>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>Nom<input type="text" value={poiForm.name} onChange={e => setPoiForm({ ...poiForm, name: e.target.value })} required /></label>
            <label>Type<input type="text" value={poiForm.type} onChange={e => setPoiForm({ ...poiForm, type: e.target.value })} placeholder="ex: eau, vue" /></label>
            <label>Région<input type="text" value={poiForm.region} onChange={e => setPoiForm({ ...poiForm, region: e.target.value })} placeholder="ex: Savoie" /></label>
            <label className="studio-form-grid__full">Description<textarea value={poiForm.description} onChange={e => setPoiForm({ ...poiForm, description: e.target.value })} /></label>
            <p className="studio-form-grid__full text-muted">Le lien Google Maps est généré automatiquement à partir du nom et de la région.</p>
          </div>
          <div className="studio-create-form__actions">
            <button type="submit" className="terrain-button">Enregistrer le point d’intérêt</button>
            <button type="button" className="terrain-button terrain-button--secondary" onClick={clearPoiForm}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}
