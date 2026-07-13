"use client";

export default function CoverSection({
  coverUrl, setCoverUrl,
  coverPreview,
  images,
  coverMode, coverMediaId,
  handleSetCoverFromUrl,
  handleRemoveCover,
  handleSetCoverFromMedia,
  handleToggleVisibility,
  isPublic,
}) {
  return (
    <div className="studio-card">
      <div className="studio-card__header">
        <h3>Image de couverture</h3>
      </div>
      <div className="studio-card__body">
        <div className="cover-selector">
          {coverPreview
            ? <img src={coverPreview} alt="Couverture" className="cover-preview" />
            : <div className="cover-placeholder">Aucune image de couverture</div>}
          <label>URL externe :
            <input type="url" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." />
          </label>
          <div className="studio-actions">
            <button type="button" onClick={() => handleSetCoverFromUrl(coverUrl)} className="studio-action-button--compact">Définir</button>
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
        <div className="studio-stage-extra">
          <div className="studio-stage-extra__header">
            <h5>Visibilité</h5>
            <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={handleToggleVisibility}>
              Passer en {isPublic ? "privé" : "public"}
            </button>
          </div>
          <p className="text-muted">Actuellement : {isPublic ? "public" : "privé"}</p>
        </div>
      </div>
    </div>
  );
}
