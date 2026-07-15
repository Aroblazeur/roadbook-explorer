"use client";

import {
  alternativesFromStage,
  buildClearPrimaryAccommodationUpdate,
  buildDemotePrimaryUpdate,
  buildPromoteAlternativeUpdate,
  hasAccommodation,
  primaryAccommodationFromStage,
} from "@/lib/roadbooks/accommodations";

const PRIMARY_FIELDS = {
  name: "accommodation_name",
  type: "accommodation_type",
  url: "accommodation_url",
  photo: "accommodation_photo",
};

function AccommodationFields({ accommodation, onChange, idPrefix }) {
  return (
    <div className="studio-form-grid studio-form-grid--compact">
      <label htmlFor={`${idPrefix}-name`}>Nom<input id={`${idPrefix}-name`} type="text" value={accommodation.name} onChange={event => onChange("name", event.target.value)} /></label>
      <label htmlFor={`${idPrefix}-type`}>Type<input id={`${idPrefix}-type`} type="text" value={accommodation.type} onChange={event => onChange("type", event.target.value)} /></label>
      <label className="studio-form-grid__full" htmlFor={`${idPrefix}-url`}>Lien<input id={`${idPrefix}-url`} type="url" value={accommodation.url} onChange={event => onChange("url", event.target.value)} /></label>
      <label className="studio-form-grid__full" htmlFor={`${idPrefix}-photo`}>Photo<input id={`${idPrefix}-photo`} type="url" value={accommodation.photo} onChange={event => onChange("photo", event.target.value)} /></label>
      <label className="studio-form-grid__full" htmlFor={`${idPrefix}-note`}>Note<textarea id={`${idPrefix}-note`} value={accommodation.note} onChange={event => onChange("note", event.target.value)} /></label>
    </div>
  );
}

export default function AccommSection({ stageId, variantId = null, stage, onChange }) {
  const primary = primaryAccommodationFromStage(stage);
  const alternatives = alternativesFromStage(stage);
  const targetPrefix = variantId == null ? `stage-${stageId}` : `variant-${variantId}`;

  const changePrimary = (field, value) => {
    if (field === "note") {
      onChange({ metadata: { ...(stage.metadata ?? {}), accommodationNote: value } });
      return;
    }
    onChange({ [PRIMARY_FIELDS[field]]: value });
  };

  const changeAlternative = (index, field, value) => {
    const nextAlternatives = alternatives.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    ));
    onChange({ alternatives: nextAlternatives });
  };

  const addAlternative = () => {
    onChange({ alternatives: [...alternatives, { name: "", type: "", url: "", photo: "", note: "" }] });
  };

  const removeAlternative = (index) => {
    if (!window.confirm("Supprimer cet hébergement alternatif ?")) return;
    onChange({ alternatives: alternatives.filter((_, itemIndex) => itemIndex !== index) });
  };

  return (
    <>
      <div className="studio-zone studio-zone--accommodation">
        <h4 className="studio-zone__title">Hébergement principal</h4>
        <AccommodationFields accommodation={primary} onChange={changePrimary} idPrefix={`${targetPrefix}-accommodation-primary`} />
        {hasAccommodation(primary) && (
          <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
            <button type="button" className="terrain-button terrain-button--secondary" onClick={() => onChange(buildDemotePrimaryUpdate(stage))}>Passer en alternatif</button>
            <button type="button" className="terrain-button terrain-button--danger" onClick={() => {
              if (window.confirm("Supprimer l'hébergement principal ?")) onChange(buildClearPrimaryAccommodationUpdate(stage));
            }}>Supprimer</button>
          </div>
        )}
      </div>

      <div className="studio-zone studio-zone--alternatives">
        <div className="studio-stage-extra__header">
          <h4 className="studio-zone__title">Hébergements alternatifs</h4>
          <button type="button" className="terrain-button terrain-button--secondary" onClick={addAlternative}>Ajouter un hébergement alternatif</button>
        </div>
        {alternatives.length ? alternatives.map((alternative, index) => (
          <article className="studio-subitem-card" key={`${targetPrefix}-alternative-${index}`}>
            <AccommodationFields
              accommodation={alternative}
              onChange={(field, value) => changeAlternative(index, field, value)}
              idPrefix={`${targetPrefix}-accommodation-alternative-${index}`}
            />
            <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="terrain-button terrain-button--secondary" onClick={() => onChange(buildPromoteAlternativeUpdate(stage, index))}>Rendre principal</button>
              <button type="button" className="terrain-button terrain-button--danger" onClick={() => removeAlternative(index)}>Supprimer</button>
            </div>
          </article>
        )) : <p className="studio-detail--empty">Aucun hébergement alternatif.</p>}
      </div>
    </>
  );
}
