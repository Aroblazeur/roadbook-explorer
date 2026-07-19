"use client";

export default function GpxBlock({
  label,
  mediaRow,
  mediaRows,
  scope,
  role,
  stageId,
  variantId,
  target,
  gpxUploading,
  metricsLoading,
  handleGpxDownload,
  handleGpxReplace,
  handleGpxDelete,
  handleGpxUpload,
  handleGpxRecalculate,
}) {
  const rows = Array.isArray(mediaRows) ? mediaRows : mediaRow ? [mediaRow] : [];
  const isUploading = gpxUploading === (role ?? stageId);
  const isRecalculating = metricsLoading === `${scope}:${target?.id}`;
  const loadingLabel = gpxUploading === "delete" ? "Suppression..." : isUploading ? "Upload..." : null;
  const accept = ".gpx,application/gpx+xml,application/xml,text/xml";
  const selectFile = async (event, action) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await action(file);
  };
  return (
    <div className="studio-gpx-list" style={{ marginTop: "0.3rem" }}>
      <strong>{label}{rows.length > 1 ? ` (${rows.length})` : ""} :</strong>
      {rows.map((row, index) => <div className="studio-gpx-list__item" key={row.id ?? `${row.file_name}-${index}`}>
        <span>{row.file_name}</span>
        <button type="button" onClick={() => handleGpxDownload(row)} disabled={!!gpxUploading}>Télécharger</button>
        {target && ["stage", "variant"].includes(scope) && <button type="button" className="terrain-button terrain-button--secondary studio-action-button--compact" onClick={() => handleGpxRecalculate(row, target, scope)} disabled={!!gpxUploading || metricsLoading != null}>{isRecalculating ? "Recalcul…" : "Recalculer"}</button>}
        <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
          {isUploading ? "Remplacement..." : "Remplacer"}
          <input type="file" accept={accept} disabled={!!gpxUploading} onChange={event => selectFile(event, file => handleGpxReplace(file, row, scope, role, stageId, variantId))} />
        </label>
        <button type="button" onClick={() => handleGpxDelete(row)} disabled={!!gpxUploading}>Supprimer</button>
      </div>)}
      <label className="terrain-button--secondary studio-action-button--compact studio-file-button studio-gpx-list__add">
        {loadingLabel ?? (rows.length ? "Ajouter un GPX" : `Importer ${label}`)}
        <input type="file" accept={accept} disabled={!!gpxUploading} onChange={event => selectFile(event, file => handleGpxUpload(file, scope, role, stageId, variantId, crypto.randomUUID()))} />
      </label>
    </div>
  );
}
