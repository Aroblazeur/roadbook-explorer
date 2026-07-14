"use client";

export default function VariantForm({
  stageId,
  stageVariants,
  variantForm,
  setVariantForm,
  clearVariantForm,
  handleVariantSubmit,
  handleDeleteVariant,
}) {
  return (
    <>
      {stageVariants.map(v => {
        const vmeta = v.metadata ?? {};
        return (
          <article key={v.id} className="studio-variant-card" data-expanded="true">
            <div className="studio-variant-card__header">
              <div className="studio-variant-card__header-info">
                <p className="studio-stage-card__eyebrow">Variante</p>
                <h3 className="studio-variant-card__title">{v.label}</h3>
                <p className="studio-stage-card__summary">
                  {[v.description, v.distance_km != null ? `${v.distance_km} km` : null].filter(Boolean).join(" · ") || `Variante`}
                </p>
              </div>
              <div className="studio-stage-card__actions">
                <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => {
                  setVariantForm({ stage_id: v.stage_id, title: v.label, type: vmeta.type ?? "", departure: v.departure ?? vmeta.departure ?? "", arrival: v.arrival ?? vmeta.arrival ?? "", description: v.description ?? "", distance_km: v.distance_km != null ? String(v.distance_km) : "", elevation_gain_m: (v.elevation_gain_m ?? vmeta.elevation_gain_m) != null ? String(v.elevation_gain_m ?? vmeta.elevation_gain_m) : "", elevation_loss_m: (v.elevation_loss_m ?? vmeta.elevation_loss_m) != null ? String(v.elevation_loss_m ?? vmeta.elevation_loss_m) : "", map_embed_url: v.map_embed_url ?? "", notes: Array.isArray(v.notes) && v.notes.length ? v.notes.map(n => n.text ?? n).join("\n") : "", editing: v.id });
                }}>✎</button>
                <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={() => handleDeleteVariant(v.id)}>✕</button>
              </div>
            </div>
          </article>
        );
      })}
      {variantForm.stage_id === stageId && (
        <form onSubmit={handleVariantSubmit} className="studio-create-form" style={{ marginLeft: "1.5rem", marginBottom: "0.75rem" }}>
          <h4>Variante</h4>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>Titre<input type="text" value={variantForm.title} onChange={e => setVariantForm({ ...variantForm, title: e.target.value })} required /></label>
            <label>Type<input type="text" value={variantForm.type} onChange={e => setVariantForm({ ...variantForm, type: e.target.value })} /></label>
            <label>Départ<input type="text" value={variantForm.departure} onChange={e => setVariantForm({ ...variantForm, departure: e.target.value })} /></label>
            <label>Arrivée<input type="text" value={variantForm.arrival} onChange={e => setVariantForm({ ...variantForm, arrival: e.target.value })} /></label>
            <label className="studio-form-grid__full">Description<textarea value={variantForm.description} onChange={e => setVariantForm({ ...variantForm, description: e.target.value })} /></label>
            <label>Distance (km)<input type="number" step="0.01" value={variantForm.distance_km} onChange={e => setVariantForm({ ...variantForm, distance_km: e.target.value })} /></label>
            <label>D+ (m)<input type="number" value={variantForm.elevation_gain_m} onChange={e => setVariantForm({ ...variantForm, elevation_gain_m: e.target.value })} /></label>
            <label>D− (m)<input type="number" value={variantForm.elevation_loss_m} onChange={e => setVariantForm({ ...variantForm, elevation_loss_m: e.target.value })} /></label>
            <label className="studio-form-grid__full">Carte intégrée<input type="url" value={variantForm.map_embed_url} onChange={e => setVariantForm({ ...variantForm, map_embed_url: e.target.value })} /></label>
            <label className="studio-form-grid__full">Notes (une par ligne)<textarea value={variantForm.notes} onChange={e => setVariantForm({ ...variantForm, notes: e.target.value })} /></label>
          </div>
          <div className="studio-create-form__actions">
            <button type="submit" className="terrain-button">{variantForm.editing ? "Mettre à jour" : "Ajouter"}</button>
            <button type="button" className="terrain-button terrain-button--secondary" onClick={clearVariantForm}>Annuler</button>
          </div>
        </form>
      )}
    </>
  );
}
