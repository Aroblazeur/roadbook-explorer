"use client";

import {
  alternativesFromStage,
  hasAccommodation,
  primaryAccommodationFromStage,
} from "@/lib/roadbooks/accommodations";

function AccommodationDetails({ accommodation }) {
  return (
    <div className="studio-form-grid studio-form-grid--compact">
      <label>Nom<span className="studio-input--readonly">{accommodation.name || "—"}</span></label>
      <label>Type<span className="studio-input--readonly">{accommodation.type || "—"}</span></label>
      <label className="studio-form-grid__full">Lien<span className="studio-input--readonly">{accommodation.url || "—"}</span></label>
      <label className="studio-form-grid__full">Note<span className="studio-input--readonly">{accommodation.note || "—"}</span></label>
      <label className="studio-form-grid__full">
        Photo
        {accommodation.photo
          ? <img src={accommodation.photo} alt="" style={{ maxWidth: "100%", maxHeight: "160px", borderRadius: "4px", marginTop: "0.3rem" }} />
          : <span className="studio-input--readonly">—</span>}
      </label>
    </div>
  );
}

export default function AccommSection({
  stageId,
  variantId = null,
  stage,
  accommodationForm,
  setAccommodationForm,
  clearAccommodationForm,
  handleAccommodationSubmit,
  handleClearAccommodation,
  handleDeleteAlternative,
  handlePromoteAlternative,
  handleDemotePrimary,
}) {
  const primary = primaryAccommodationFromStage(stage);
  const alternatives = alternativesFromStage(stage);
  const hasPrimary = hasAccommodation(primary);
  const formIsOpen = accommodationForm.stage_id === stageId && (accommodationForm.variant_id ?? null) === variantId;

  const openForm = (kind, accommodation = {}, editing = null) => {
    clearAccommodationForm();
    setAccommodationForm({
      stage_id: stageId,
      variant_id: variantId,
      name: accommodation.name ?? "",
      url: accommodation.url ?? "",
      photo: accommodation.photo ?? "",
      type: accommodation.type ?? "",
      note: accommodation.note ?? "",
      kind,
      editing,
    });
  };

  return (
    <>
      <div className="studio-zone studio-zone--accommodation">
        <h4 className="studio-zone__title">Hébergement principal</h4>
        {hasPrimary ? (
          <div>
            <AccommodationDetails accommodation={primary} />
            <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="terrain-button terrain-button--secondary" onClick={() => openForm("primary", primary, "primary")}>Modifier</button>
              <button type="button" className="terrain-button terrain-button--secondary" onClick={() => handleDemotePrimary(stageId, variantId)}>Passer en alternatif</button>
              <button type="button" className="terrain-button terrain-button--danger" onClick={() => handleClearAccommodation(stageId, variantId)}>Supprimer</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="studio-detail--empty">Aucun hébergement principal.</p>
            <button type="button" className="terrain-button terrain-button--secondary" style={{ marginTop: "0.4rem" }} onClick={() => openForm("primary")}>Ajouter l’hébergement principal</button>
          </div>
        )}
      </div>

      <div className="studio-zone studio-zone--alternatives">
        <div className="studio-stage-extra__header">
          <h4 className="studio-zone__title">Hébergements alternatifs</h4>
          <button type="button" className="terrain-button terrain-button--secondary" onClick={() => openForm("alternative")}>Ajouter un hébergement alternatif</button>
        </div>
        {alternatives.length ? alternatives.map((alternative, index) => (
          <article className="studio-subitem-card" key={`${alternative.name}-${alternative.url}-${index}`}>
            <AccommodationDetails accommodation={alternative} />
            <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="terrain-button terrain-button--secondary" onClick={() => handlePromoteAlternative(stageId, index, variantId)}>Rendre principal</button>
              <button type="button" className="terrain-button terrain-button--secondary" onClick={() => openForm("alternative", alternative, index)}>Modifier</button>
              <button type="button" className="terrain-button terrain-button--danger" onClick={() => handleDeleteAlternative(stageId, index, variantId)}>Supprimer</button>
            </div>
          </article>
        )) : <p className="studio-detail--empty">Aucun hébergement alternatif.</p>}
      </div>

      {formIsOpen && (
        <form onSubmit={handleAccommodationSubmit} className="studio-create-form">
          <h4>
            {accommodationForm.editing != null ? "Modifier" : "Ajouter"}{" "}
            {accommodationForm.kind === "alternative" ? "un hébergement alternatif" : "l’hébergement principal"}
          </h4>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>Nom<input type="text" value={accommodationForm.name} onChange={e => setAccommodationForm({ ...accommodationForm, name: e.target.value })} /></label>
            <label>Type<input type="text" value={accommodationForm.type} onChange={e => setAccommodationForm({ ...accommodationForm, type: e.target.value })} /></label>
            <label className="studio-form-grid__full">Lien<input type="url" value={accommodationForm.url} onChange={e => setAccommodationForm({ ...accommodationForm, url: e.target.value })} /></label>
            <label className="studio-form-grid__full">Photo<input type="url" value={accommodationForm.photo} onChange={e => setAccommodationForm({ ...accommodationForm, photo: e.target.value })} /></label>
            <label className="studio-form-grid__full">Note<textarea value={accommodationForm.note} onChange={e => setAccommodationForm({ ...accommodationForm, note: e.target.value })} /></label>
          </div>
          <div className="studio-create-form__actions">
            <button type="submit" className="terrain-button">Enregistrer l’hébergement</button>
            <button type="button" className="terrain-button terrain-button--secondary" onClick={clearAccommodationForm}>Annuler</button>
          </div>
        </form>
      )}
    </>
  );
}
