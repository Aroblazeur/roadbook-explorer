"use client";

export default function MediaSection({
  images,
  uploadLoading,
  uploadError,
  handleUploadImage,
  handleDeleteImage,
  deleteLoading,
}) {
  return (
    <div className="studio-card">
      <div className="studio-card__header">
        <h3>Médias</h3>
        <span className="studio-badge">{images.length}</span>
      </div>
      <div className="studio-card__body">
        {uploadError && <p className="page-error">{uploadError}</p>}
        <div className="studio-media-upload">
          <label className="terrain-button--secondary studio-action-button--compact" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
            {uploadLoading ? "Upload..." : "Choisir une image"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUploadImage} disabled={uploadLoading} />
          </label>
        </div>
        {images.length === 0 && <p className="text-muted">Aucune image.</p>}
        <div className="studio-media-grid">
          {images.map(img => (
            <div key={img.id} className="studio-media-item">
              {img.signedUrl && <img src={img.signedUrl} alt={img.file_name ?? "image"} className="studio-media-item__image" />}
              <div className="studio-media-item__info">
                <span className="text-muted studio-media-item__name">{img.file_name}</span>
                <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={() => handleDeleteImage(img)} disabled={deleteLoading === img.id}>
                  {deleteLoading === img.id ? "..." : "Supprimer"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
