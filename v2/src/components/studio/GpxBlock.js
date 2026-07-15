"use client";

export default function GpxBlock({
  label,
  mediaRow,
  scope,
  role,
  stageId,
  variantId,
  gpxUploading,
  handleGpxDownload,
  handleGpxReplace,
  handleGpxDelete,
  handleGpxUpload,
}) {
  const isUploading = gpxUploading === (role ?? stageId);
  const loadingLabel = gpxUploading === "delete" ? "Suppression..." : isUploading ? "Upload..." : null;
  const accept = ".gpx,application/gpx+xml,application/xml,text/xml";
  const selectFile = async (event, action) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await action(file);
  };
  return (
    <div style={{ marginTop: "0.3rem" }}>
      <strong>{label} :</strong>
      {mediaRow ? (
        <span>
          {mediaRow.file_name}
          <button type="button" onClick={() => handleGpxDownload(mediaRow)} disabled={!!gpxUploading}>Télécharger</button>
          <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
            {isUploading ? "Remplacement..." : "Remplacer"}
            <input type="file" accept={accept} disabled={!!gpxUploading} onChange={event => selectFile(event, file => handleGpxReplace(file, mediaRow, scope, role, stageId, variantId))} />
          </label>
          <button type="button" onClick={() => handleGpxDelete(mediaRow)} disabled={!!gpxUploading}>Supprimer</button>
        </span>
      ) : (
        <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
          {loadingLabel ?? `Upload ${label}`}
          <input type="file" accept={accept} disabled={!!gpxUploading} onChange={event => selectFile(event, file => handleGpxUpload(file, scope, role, stageId, variantId))} />
        </label>
      )}
    </div>
  );
}
