"use client";

export default function RouteForm({
  mode,
  values,
  setValues,
  handleSave,
  saving,
  embedded = false,
}) {
  const isOfficial = mode === "official";
  const title = isOfficial ? "Itinéraire officiel" : "Tracé actuel";
  return (
    <div className={embedded ? "studio-section-block studio-section-block--route" : "studio-card"}>
      <div className={embedded ? "studio-section-block__header" : "studio-card__header"}>
        {embedded ? <h4>{title}</h4> : <h3>{title}</h3>}
      </div>
      <div className={embedded ? "studio-section-block__body" : "studio-card__body"}>
        <form onSubmit={handleSave} className="studio-form-grid studio-form-grid--compact">
          <label>Distance (km)<input type="number" step="0.1" value={values.dist} onChange={e => setValues(prev => ({ ...prev, dist: e.target.value }))} /></label>
          <label>D+ (m)<input type="number" value={values.gain} onChange={e => setValues(prev => ({ ...prev, gain: e.target.value }))} /></label>
          <label>D− (m)<input type="number" value={values.loss} onChange={e => setValues(prev => ({ ...prev, loss: e.target.value }))} /></label>
          <label className="studio-form-grid__full">GPX<input type="text" value={values.gpx} onChange={e => setValues(prev => ({ ...prev, gpx: e.target.value }))} placeholder="URL du fichier GPX" /></label>
          <label className="studio-form-grid__full">Carte intégrée<input type="url" value={values.map} onChange={e => setValues(prev => ({ ...prev, map: e.target.value }))} placeholder="https://www.google.com/maps/embed?..." /></label>
          <button type="submit" disabled={saving} className="terrain-button--secondary studio-action-button--compact" style={{ gridColumn: "1 / -1", width: "auto", justifySelf: "start" }}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}
