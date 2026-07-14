"use client";

export default function AccommSection({
  stageId,
  stage,
  accommodationForm,
  setAccommodationForm,
  clearAccommodationForm,
  handleAccommodationSubmit,
  handleClearAccommodation,
}) {
  return (
    <div className="studio-zone studio-zone--accommodation">
      <h4 className="studio-zone__title">Hébergement principal</h4>
      {stage.accommodation_name ? (
        <div className="studio-form-grid studio-form-grid--compact">
          <label>Nom<span className="studio-input--readonly">{stage.accommodation_name}</span></label>
          <label>Lien<span className="studio-input--readonly">{stage.accommodation_url || "—"}</span></label>
          <label className="studio-form-grid__full">
            Photo
            {stage.accommodation_photo
              ? <img src={stage.accommodation_photo} alt="" style={{ maxWidth: "100%", maxHeight: "160px", borderRadius: "4px", marginTop: "0.3rem" }} />
              : <span className="studio-input--readonly">—</span>}
          </label>
          <div className="studio-actions">
            <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => {
              clearAccommodationForm();
              setAccommodationForm({ stage_id: stageId, name: stage.accommodation_name, url: stage.accommodation_url ?? "", photo: stage.accommodation_photo ?? "", editing: true });
            }}>✎</button>
            <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={() => handleClearAccommodation(stageId)}>Vider</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="studio-detail--empty">Aucun hébergement.</p>
          <button type="button" className="terrain-button terrain-button--secondary" style={{ marginTop: "0.4rem" }} onClick={() => setAccommodationForm({ ...accommodationForm, stage_id: stageId })}>Ajouter un hébergement</button>
        </div>
      )}
      {accommodationForm.stage_id === stageId && (
        <form onSubmit={handleAccommodationSubmit} className="studio-create-form" style={{ marginTop: "0.5rem" }}>
          <h4>{accommodationForm.editing ? "Modifier l'hébergement" : "Ajouter un hébergement"}</h4>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>Nom<input type="text" value={accommodationForm.name} onChange={e => setAccommodationForm({ ...accommodationForm, name: e.target.value })} required /></label>
            <label>URL<input type="url" value={accommodationForm.url} onChange={e => setAccommodationForm({ ...accommodationForm, url: e.target.value })} /></label>
            <label className="studio-form-grid__full">Photo<input type="url" value={accommodationForm.photo} onChange={e => setAccommodationForm({ ...accommodationForm, photo: e.target.value })} placeholder="URL de l'image" /></label>
          </div>
          <div className="studio-create-form__actions">
            <button type="submit" className="terrain-button">Enregistrer l’hébergement</button>
            <button type="button" className="terrain-button terrain-button--secondary" onClick={clearAccommodationForm}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}
