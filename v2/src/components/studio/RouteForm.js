"use client";

export default function RouteForm({
  mode,
  values,
  setValues,
  mediaRow,
  gpxUploading,
  handleGpxUpload,
  handleGpxReplace,
  handleGpxDownload,
  handleGpxDelete,
  embedded = false,
}) {
  const isOfficial = mode === "official";
  const role = isOfficial ? "official" : "custom";
  const accept = ".gpx,application/gpx+xml,application/xml,text/xml";
  const selectFile = async (event, action) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await action(file);
  };
  const title = isOfficial ? "Itinéraire officiel" : "Tracé actuel";
  return (
    <div className={embedded ? "studio-section-block studio-section-block--route" : "studio-card"}>
      <div className={embedded ? "studio-section-block__header" : "studio-card__header"}>
        {embedded ? <h4>{title}</h4> : <h3>{title}</h3>}
      </div>
      <div className={embedded ? "studio-section-block__body" : "studio-card__body"}>
        <div className="studio-form-grid studio-form-grid--compact">
          <label>Distance (km)<input type="number" step="0.1" value={values.dist} onChange={e => setValues(prev => ({ ...prev, dist: e.target.value }))} /></label>
          <label>D+ (m)<input type="number" value={values.gain} onChange={e => setValues(prev => ({ ...prev, gain: e.target.value }))} /></label>
          <label>D− (m)<input type="number" value={values.loss} onChange={e => setValues(prev => ({ ...prev, loss: e.target.value }))} /></label>
          <div className="studio-form-grid__full">
            <label htmlFor={`route-gpx-${mode}`}>GPX (URL ou fichier)</label>
            <div className="studio-resource-field">
              <input id={`route-gpx-${mode}`} type="text" value={values.gpx} onChange={e => setValues(prev => ({ ...prev, gpx: e.target.value }))} />
              {mediaRow ? (
                <>
                  <span className="studio-resource-field__file" title={mediaRow.file_name}>{mediaRow.file_name}</span>
                  <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => handleGpxDownload(mediaRow)} disabled={!!gpxUploading}>Télécharger</button>
                  <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
                    {gpxUploading === role ? "Remplacement..." : "Remplacer"}
                    <input type="file" accept={accept} disabled={!!gpxUploading} onChange={event => selectFile(event, file => handleGpxReplace(file, mediaRow, "roadbook", role, null))} />
                  </label>
                  <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={() => handleGpxDelete(mediaRow)} disabled={!!gpxUploading}>Supprimer</button>
                </>
              ) : (
                <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
                  {gpxUploading === (isOfficial ? "official" : "custom") ? "Import…" : "Importer"}
                  <input type="file" accept={accept} disabled={!!gpxUploading} onChange={event => selectFile(event, file => handleGpxUpload(file, "roadbook", role, null))} />
                </label>
              )}
            </div>
          </div>
          <label className="studio-form-grid__full">Carte intégrée<input type="url" value={values.map} onChange={e => setValues(prev => ({ ...prev, map: e.target.value }))} /></label>
        </div>
      </div>
    </div>
  );
}
