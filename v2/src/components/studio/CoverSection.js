"use client";

export default function CoverSection({
  coverUrl, setCoverUrl,
  coverPreview,
  images,
  coverMode, coverMediaId,
  handleSetCoverFromUrl,
  handleRemoveCover,
  handleSetCoverFromMedia,
  handleUploadCover,
  uploadLoading,
  embedded = false,
}) {
  return (
    <div className={embedded ? "studio-section-block" : "studio-card"}>
      <div className={embedded ? "studio-section-block__header" : "studio-card__header"}>
        {embedded ? <h4>Image de couverture</h4> : <h3>Image de couverture</h3>}
      </div>
      <div className={embedded ? "studio-section-block__body" : "studio-card__body"}>
        <div className="cover-selector">
          {coverPreview
            ? <img src={coverPreview} alt="Couverture" className="cover-preview" />
            : <div className="cover-placeholder">Aucune image de couverture</div>}
          <label>Image de couverture (URL ou fichier)</label>
          <div className="studio-resource-field">
            <input aria-label="URL de l'image de couverture" type="url" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." />
            <button type="button" onClick={() => handleSetCoverFromUrl(coverUrl)} className="studio-action-button--compact">Définir</button>
            <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
              {uploadLoading ? "Import…" : "Importer"}
              <input type="file" accept="image/*" disabled={uploadLoading} onChange={handleUploadCover} />
            </label>
            <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={handleRemoveCover}>Retirer</button>
          </div>
          {images.length > 0 && (
            <div className="page-section">
              <p className="text-muted">Ou depuis les images uploadées :</p>
              <div className="studio-media-thumbs">
                {images.map(img => (
                  <div key={img.id} className="studio-media-thumb" data-active={(coverMode === "media" && coverMediaId === img.id) || undefined} onClick={() => handleSetCoverFromMedia(img.id)}>
                    {img.signedUrl && <img src={img.signedUrl} alt={img.file_name ?? ""} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
