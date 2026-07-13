"use client";

import GpxBlock from "./GpxBlock";

export default function GpxSection({
  gpxError,
  gpxOfficial,
  gpxCustom,
  gpxUploading,
  handleGpxDownload,
  handleGpxReplace,
  handleGpxDelete,
  handleGpxUpload,
}) {
  return (
    <div className="studio-card">
      <div className="studio-card__header">
        <h3>GPX</h3>
      </div>
      <div className="studio-card__body">
        {gpxError && <p className="page-error">{gpxError}</p>}
        <GpxBlock
          label="GPX officiel" mediaRow={gpxOfficial}
          scope="roadbook" role="official" stageId={null}
          gpxUploading={gpxUploading}
          handleGpxDownload={handleGpxDownload}
          handleGpxReplace={handleGpxReplace}
          handleGpxDelete={handleGpxDelete}
          handleGpxUpload={handleGpxUpload}
        />
        <GpxBlock
          label="GPX personnalisé" mediaRow={gpxCustom}
          scope="roadbook" role="custom" stageId={null}
          gpxUploading={gpxUploading}
          handleGpxDownload={handleGpxDownload}
          handleGpxReplace={handleGpxReplace}
          handleGpxDelete={handleGpxDelete}
          handleGpxUpload={handleGpxUpload}
        />
      </div>
    </div>
  );
}
