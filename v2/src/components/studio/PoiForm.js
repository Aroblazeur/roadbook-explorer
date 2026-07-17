"use client";

import useRevealForm from "@/hooks/studio/useRevealForm";

export default function PoiForm({
  stageId,
  variantId = null,
  stagePois,
  poiForm,
  setPoiForm,
  clearPoiForm,
  handlePoiSubmit,
  handleDeletePoi,
  images = [],
  onUploadPhoto,
  uploadLoading = false,
}) {
  const selectedMedia = images.find(image => Number(image.id) === Number(poiForm.photoMediaId)) ?? null;
  const isEditingHere = poiForm.stage_id === stageId && (poiForm.variant_id ?? null) === variantId;
  const formRef = useRevealForm(isEditingHere ? `${stageId}:${variantId ?? "stage"}:${poiForm.editing ?? "new"}` : null);

  return (
    <div className="studio-stage-extra">
      <div className="studio-stage-extra__header">
        <h5>Points d'intérêt ({stagePois.length})</h5>
        <button type="button" className="terrain-button terrain-button--secondary" onClick={() => setPoiForm({ stage_id: stageId, variant_id: variantId, name: "", region: "", link: "", description: "", photoUrl: "", photoMediaId: null, preview: null, metadata: {}, editing: null })}>Ajouter un POI</button>
      </div>
      <div className="studio-sublist__list">
        {stagePois.length === 0 && <p className="studio-detail--empty">Aucun POI.</p>}
        {stagePois.map(poi => (
          <article key={poi.id} className="studio-subitem-card">
            <div className="studio-subitem-card__header">
              <strong>{poi.name}</strong>
              <button type="button" className="terrain-button terrain-button--danger" onClick={() => handleDeletePoi(poi.id)}>Supprimer</button>
            </div>
            <div className="studio-form-grid studio-form-grid--compact">
              {poi.description && <label className="studio-form-grid__full">Description<span>{poi.description}</span></label>}
              {poi.link_url && <label>Lien<span>{poi.link_url}</span></label>}
              {(poi.photo_url || poi.metadata?.poiPhotoMediaId) && <label className="studio-form-grid__full">Photo<span>{poi.photo_url || images.find(image => Number(image.id) === Number(poi.metadata?.poiPhotoMediaId))?.file_name || "Fichier importé"}</span></label>}
              {poi.region && <label>Région / ville<span>{poi.region}</span></label>}
            </div>
            <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => {
                setPoiForm({ stage_id: stageId, variant_id: variantId, name: poi.name, region: poi.region ?? "", link: poi.link_url ?? "", description: poi.description ?? "", photoUrl: poi.photo_url ?? "", photoMediaId: poi.metadata?.poiPhotoMediaId ?? null, preview: poi.metadata?.linkPreview ?? null, metadata: poi.metadata ?? {}, editing: poi.id });
              }}>✎</button>
            </div>
          </article>
        ))}
      </div>
      {isEditingHere && (
        <form ref={formRef} onSubmit={handlePoiSubmit} className="studio-create-form" style={{ marginTop: "0.5rem" }}>
          <h4>{poiForm.editing ? "Modifier le POI" : "Ajouter un POI"}</h4>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>Nom<input data-form-initial-focus type="text" value={poiForm.name} onChange={e => setPoiForm({ ...poiForm, name: e.target.value })} required /></label>
            <label>Région / ville<input type="text" value={poiForm.region} onChange={e => setPoiForm({ ...poiForm, region: e.target.value })} /></label>
            <label className="studio-form-grid__full">Lien<input type="url" value={poiForm.link} onChange={e => setPoiForm({ ...poiForm, link: e.target.value, preview: null })} /></label>
            <div className="studio-form-grid__full">
              <label htmlFor={`poi-photo-${variantId ?? "stage"}-${stageId}`}>Photo (URL ou fichier)</label>
              <div className="studio-resource-field">
                <input id={`poi-photo-${variantId ?? "stage"}-${stageId}`} type="url" value={poiForm.photoUrl} onChange={e => setPoiForm({ ...poiForm, photoUrl: e.target.value, photoMediaId: null })} />
                {selectedMedia && <span className="studio-resource-field__file">{selectedMedia.file_name}</span>}
                <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
                  {uploadLoading ? "Import…" : "Importer"}
                  <input type="file" accept="image/*" disabled={uploadLoading} onChange={async event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const media = await onUploadPhoto?.(file, { stageId, variantId });
                    if (media?.id) setPoiForm(current => ({ ...current, photoUrl: "", photoMediaId: media.id }));
                  }} />
                </label>
              </div>
            </div>
            <label className="studio-form-grid__full">Description<textarea value={poiForm.description} onChange={e => setPoiForm({ ...poiForm, description: e.target.value })} /></label>
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
