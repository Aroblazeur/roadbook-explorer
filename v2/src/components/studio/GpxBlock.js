"use client";

export default function GpxBlock({
  label,
  mediaRow,
  scope,
  role,
  stageId,
  gpxUploading,
  handleGpxDownload,
  handleGpxReplace,
  handleGpxDelete,
  handleGpxUpload,
}) {
  const isUploading = gpxUploading === (role ?? stageId);
  const loadingLabel = gpxUploading === "delete" ? "Suppression..." : isUploading ? "Upload..." : null;
  return (
    <div style={{ marginTop: "0.3rem" }}>
      <strong>{label} :</strong>
      {mediaRow ? (
        <span>
          {mediaRow.file_name}
          <button type="button" onClick={() => handleGpxDownload(mediaRow)} disabled={!!gpxUploading}>Télécharger</button>
          <button type="button" onClick={() => handleGpxReplace(mediaRow, scope, role, stageId)} disabled={!!gpxUploading}>Remplacer</button>
          <button type="button" onClick={() => handleGpxDelete(mediaRow)} disabled={!!gpxUploading}>Supprimer</button>
        </span>
      ) : (
        <button type="button" onClick={() => scope === "stage" ? handleGpxUpload("stage", null, stageId) : handleGpxUpload("roadbook", role, null)} disabled={!!gpxUploading}>
          {loadingLabel ?? `Upload ${label}`}
        </button>
      )}
    </div>
  );
}
