"use client";

import { START_POINT_MAX_WAYPOINTS, buildGoogleMapsDirectionsUrl, normalizeStartPoint } from "@/lib/roadbooks/start-point";

const TRANSPORTS = [
  ["car", "Voiture"], ["train", "Train / transports en commun"], ["bicycle", "Vélo"],
  ["walk", "À pied"], ["motorcycle", "Moto"], ["other", "Autre"],
];

function AccommodationFields({ item, onChange, prefix, photoMedia, onUploadPhoto, uploadLoading }) {
  return <div className="studio-form-grid studio-form-grid--compact">
    <label htmlFor={`${prefix}-name`}>Nom<input id={`${prefix}-name`} value={item.name} onChange={e => onChange("name", e.target.value)} /></label>
    <label htmlFor={`${prefix}-type`}>Type<input id={`${prefix}-type`} value={item.type} onChange={e => onChange("type", e.target.value)} /></label>
    <label className="studio-form-grid__full" htmlFor={`${prefix}-price`}>Prix<input id={`${prefix}-price`} value={item.price} onChange={e => onChange("price", e.target.value)} /></label>
    <label className="studio-form-grid__full" htmlFor={`${prefix}-url`}>Lien<input id={`${prefix}-url`} type="url" value={item.url} onChange={e => onChange("url", e.target.value)} /></label>
    <div className="studio-form-grid__full">
      <label htmlFor={`${prefix}-photo`}>Photo (URL ou fichier)</label>
      <div className="studio-resource-field">
        <input id={`${prefix}-photo`} type="url" value={item.photo} onChange={e => onChange("photo", e.target.value)} />
        {photoMedia && <span className="studio-resource-field__file">{photoMedia.file_name}</span>}
        <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
          {uploadLoading ? "Import…" : "Importer"}
          <input type="file" accept="image/*" disabled={uploadLoading} onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) await onUploadPhoto?.(file);
          }} />
        </label>
      </div>
    </div>
    <label className="studio-form-grid__full" htmlFor={`${prefix}-note`}>Note<textarea id={`${prefix}-note`} value={item.note} onChange={e => onChange("note", e.target.value)} /></label>
  </div>;
}

export default function StartPointSection({ value, onChange, images = [], onUploadAccommodationPhoto, uploadLoading = false }) {
  const point = normalizeStartPoint(value);
  const update = patch => onChange(previous => ({ ...normalizeStartPoint(previous), ...patch }));
  const mapsUrl = buildGoogleMapsDirectionsUrl(point);

  const changeArrayItem = (key, index, field, nextValue) => update({
    [key]: point[key].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: nextValue, ...(key === "accommodations" && field === "photo" ? { photoMediaId: null } : {}) } : item),
  });

  const uploadAccommodationPhoto = async (file, index) => {
    const media = await onUploadAccommodationPhoto?.(file);
    if (!media?.id) return;
    update({ accommodations: point.accommodations.map((item, itemIndex) => itemIndex === index ? { ...item, photo: "", photoMediaId: media.id } : item) });
  };

  return <details className="studio-general-info studio-start-point">
    <summary className="studio-general-info__header"><span className="studio-general-info__title" role="heading" aria-level="3">Point de départ</span></summary>
    <div className="studio-general-info__body studio-start-point__body">
      <p className="studio-help">Ces informations expliquent comment rejoindre le départ du roadbook. Les champs vides de distance et de durée sont calculés lors de l’enregistrement si Google Maps est configuré.</p>
      <div className="studio-form-grid">
        <label>Ville de départ<input value={point.departure_city} onChange={e => update({ departure_city: e.target.value })} /></label>
        <label>Ville d’arrivée<input value={point.arrival_city} onChange={e => update({ arrival_city: e.target.value })} /></label>
      </div>

      <section className="studio-section-block">
        <div className="studio-stage-extra__header"><h4>Villes étapes</h4><button type="button" className="terrain-button terrain-button--secondary" disabled={point.waypoints.length >= START_POINT_MAX_WAYPOINTS} onClick={() => update({ waypoints: [...point.waypoints, ""] })}>Ajouter une ville étape</button></div>
        {point.waypoints.map((city, index) => <div className="studio-inline-row" key={`waypoint-${index}`}>
          <label className="studio-inline-row__field">Ville étape {index + 1}<input value={city} onChange={e => update({ waypoints: point.waypoints.map((item, itemIndex) => itemIndex === index ? e.target.value : item) })} /></label>
          <button type="button" className="terrain-button terrain-button--danger" onClick={() => update({ waypoints: point.waypoints.filter((_, itemIndex) => itemIndex !== index) })}>Supprimer</button>
        </div>)}
        {!point.waypoints.length && <p className="studio-detail--empty">Aucune ville étape.</p>}
      </section>

      <div className="studio-form-grid">
        <label>Moyen de transport<select value={point.transport_mode} onChange={e => update({ transport_mode: e.target.value })}>{TRANSPORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Distance (km)<input type="number" min="0" step="0.1" value={point.distance_km} onChange={e => update({ distance_km: e.target.value })} /></label>
        <label>Durée<input value={point.duration} onChange={e => update({ duration: e.target.value })} /></label>
        <label className="studio-form-grid__full">Description<textarea value={point.description} onChange={e => update({ description: e.target.value })} /></label>
      </div>
      {mapsUrl && <p className="studio-generated-link"><a href={mapsUrl} target="_blank" rel="noreferrer">Ouvrir l’itinéraire complet dans Google Maps</a></p>}

      <section className="studio-section-block">
        <div className="studio-stage-extra__header"><h4>Hébergements</h4><button type="button" className="terrain-button terrain-button--secondary" onClick={() => update({ accommodations: [...point.accommodations, { name: "", type: "", url: "", photo: "", photoMediaId: null, price: "", note: "" }] })}>Ajouter un hébergement</button></div>
        {point.accommodations.map((item, index) => <article className="studio-subitem-card" key={`start-accommodation-${index}`}>
          <AccommodationFields item={item} prefix={`start-accommodation-${index}`} onChange={(field, nextValue) => changeArrayItem("accommodations", index, field, nextValue)} photoMedia={images.find(image => Number(image.id) === Number(item.photoMediaId)) ?? null} onUploadPhoto={file => uploadAccommodationPhoto(file, index)} uploadLoading={uploadLoading} />
          <button type="button" className="terrain-button terrain-button--danger" onClick={() => update({ accommodations: point.accommodations.filter((_, itemIndex) => itemIndex !== index) })}>Supprimer</button>
        </article>)}
        {!point.accommodations.length && <p className="studio-detail--empty">Aucun hébergement.</p>}
      </section>

      <section className="studio-section-block">
        <div className="studio-stage-extra__header"><h4>Points d’intérêt</h4><button type="button" className="terrain-button terrain-button--secondary" onClick={() => update({ pois: [...point.pois, { name: "", region: "", link_url: "", description: "" }] })}>Ajouter un POI</button></div>
        {point.pois.map((item, index) => <article className="studio-subitem-card" key={`start-poi-${index}`}>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>Nom<input value={item.name} onChange={e => changeArrayItem("pois", index, "name", e.target.value)} /></label>
            <label>Région / ville<input value={item.region} onChange={e => changeArrayItem("pois", index, "region", e.target.value)} /></label>
            <label className="studio-form-grid__full">Lien<input type="url" value={item.link_url} onChange={e => changeArrayItem("pois", index, "link_url", e.target.value)} /></label>
            <label className="studio-form-grid__full">Description<textarea value={item.description} onChange={e => changeArrayItem("pois", index, "description", e.target.value)} /></label>
          </div>
          <button type="button" className="terrain-button terrain-button--danger" onClick={() => update({ pois: point.pois.filter((_, itemIndex) => itemIndex !== index) })}>Supprimer</button>
        </article>)}
        {!point.pois.length && <p className="studio-detail--empty">Aucun POI.</p>}
      </section>
    </div>
  </details>;
}
