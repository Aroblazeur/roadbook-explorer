"use client";

import { useState } from "react";
import {
  START_POINT_MAX_WAYPOINTS,
  TRANSPORT_OPTIONS,
  buildGoogleMapsDirectionsUrl,
  createEmptyTransportSegment,
  normalizeJourney,
} from "@/lib/roadbooks/start-point";
import useRevealForm from "@/hooks/studio/useRevealForm";
import GpxBlock from "./GpxBlock";
import RouteMapFields from "./RouteMapFields";
import ZoomableImage from "@/components/ZoomableImage";

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
          <input type="file" accept="image/*" disabled={uploadLoading} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) await onUploadPhoto?.(file); }} />
        </label>
      </div>
    </div>
    <label className="studio-form-grid__full" htmlFor={`${prefix}-description`}>Description (automatique si vide)<textarea id={`${prefix}-description`} value={item.description} onChange={e => onChange("description", e.target.value)} /></label>
    <label className="studio-form-grid__full" htmlFor={`${prefix}-note`}>Note<textarea id={`${prefix}-note`} value={item.note} onChange={e => onChange("note", e.target.value)} /></label>
  </div>;
}

function TransportSegment({ segment, index, scope, onChange, onRemove, initialRef }) {
  const mapsUrl = buildGoogleMapsDirectionsUrl(segment);
  const update = patch => onChange({ ...segment, ...patch });
  return <article ref={initialRef} className="studio-subitem-card studio-transport-segment">
    <div className="studio-stage-extra__header"><h4>Trajet {index + 1}</h4><button type="button" className="terrain-button terrain-button--danger" onClick={onRemove}>Supprimer</button></div>
    <div className="studio-form-grid">
      <label>Ville de départ<input data-form-initial-focus value={segment.departure_city} onChange={e => update({ departure_city: e.target.value })} /></label>
      <label>Ville d’arrivée<input value={segment.arrival_city} onChange={e => update({ arrival_city: e.target.value })} /></label>
      <label>Mode de transport<select value={segment.transport_mode} onChange={e => update({ transport_mode: e.target.value })}>{TRANSPORT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Distance (km)<input type="number" min="0" step="0.1" value={segment.distance_km} onChange={e => update({ distance_km: e.target.value })} /></label>
      <label>Durée<input value={segment.duration} onChange={e => update({ duration: e.target.value })} /></label>
    </div>
    <section className="studio-section-block studio-transport-segment__waypoints">
      <div className="studio-stage-extra__header"><h5>Villes étapes</h5><button type="button" className="terrain-button terrain-button--secondary studio-action-button--compact" disabled={segment.waypoints.length >= START_POINT_MAX_WAYPOINTS} onClick={() => update({ waypoints: [...segment.waypoints, ""] })}>Ajouter</button></div>
      {segment.waypoints.map((city, waypointIndex) => <div className="studio-inline-row" key={`${scope}-segment-${index}-waypoint-${waypointIndex}`}>
        <label className="studio-inline-row__field">Ville étape {waypointIndex + 1}<input value={city} onChange={e => update({ waypoints: segment.waypoints.map((item, itemIndex) => itemIndex === waypointIndex ? e.target.value : item) })} /></label>
        <button type="button" className="terrain-button terrain-button--danger" onClick={() => update({ waypoints: segment.waypoints.filter((_, itemIndex) => itemIndex !== waypointIndex) })}>Supprimer</button>
      </div>)}
    </section>
    {mapsUrl && <p className="studio-generated-link"><a href={mapsUrl} target="_blank" rel="noreferrer">Ouvrir ce trajet dans Google Maps</a></p>}
  </article>;
}

function JourneyPhotoFields({ item, index, scope, media, onChange, onUpload, onRemove, uploadLoading, initialRef }) {
  const previewUrl = media?.signedUrl || item.url;
  return <article ref={initialRef} className="studio-subitem-card studio-journey-photo">
    {previewUrl && <ZoomableImage className="studio-journey-photo__preview" src={previewUrl} alt={item.caption || `Photo ${index + 1}`} />}
    <div className="studio-form-grid studio-form-grid--compact">
      <label className="studio-form-grid__full" htmlFor={`${scope}-photo-url-${index}`}>Adresse de l’image
        <input id={`${scope}-photo-url-${index}`} data-form-initial-focus type="url" value={item.url} placeholder="https://…" onChange={event => onChange({ url: event.target.value, photoMediaId: null })} />
      </label>
      <label className="studio-form-grid__full" htmlFor={`${scope}-photo-caption-${index}`}>Légende (facultative)
        <input id={`${scope}-photo-caption-${index}`} value={item.caption} onChange={event => onChange({ caption: event.target.value })} />
      </label>
    </div>
    <div className="studio-journey-photo__actions">
      <label className="terrain-button terrain-button--secondary studio-action-button--compact studio-file-button">
        {uploadLoading ? "Import…" : media ? "Remplacer le fichier" : "Importer un fichier"}
        <input type="file" accept="image/*" disabled={uploadLoading} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) await onUpload(file); }} />
      </label>
      {media && <span className="studio-resource-field__file">{media.file_name}</span>}
      <button type="button" className="terrain-button terrain-button--danger" onClick={onRemove}>Supprimer</button>
    </div>
  </article>;
}

export default function StartPointSection({
  value,
  onChange,
  kind = "start",
  images = [],
  onUploadAccommodationPhoto,
  onUploadPoiPhoto,
  onUploadJourneyPhoto,
  onRemoveJourneyPhoto,
  uploadLoading = false,
  gpx,
}) {
  const isReturn = kind === "return";
  const scope = isReturn ? "return" : "start";
  const [newItem, setNewItem] = useState({ type: null, index: null, sequence: 0 });
  const point = normalizeJourney(value);
  const update = patch => onChange(previous => ({ ...normalizeJourney(previous), ...patch }));
  const newItemRef = useRevealForm(newItem.type ? `${scope}:${newItem.type}:${newItem.sequence}` : null);
  const revealNewItem = (type, index) => setNewItem(previous => ({ type, index, sequence: previous.sequence + 1 }));

  const changeArrayItem = (key, index, field, nextValue) => update({
    [key]: point[key].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: nextValue, ...(key === "accommodations" && field === "photo" ? { photoMediaId: null } : {}), ...(key === "accommodations" && field === "url" ? { preview: null } : {}) } : item),
  });
  const uploadAccommodationPhoto = async (file, index) => {
    const media = await onUploadAccommodationPhoto?.(file);
    if (media?.id) update({ accommodations: point.accommodations.map((item, itemIndex) => itemIndex === index ? { ...item, photo: "", photoMediaId: media.id } : item) });
  };
  const uploadPoiPhoto = async (file, index) => {
    const media = await onUploadPoiPhoto?.(file);
    if (media?.id) update({ pois: point.pois.map((item, itemIndex) => itemIndex === index ? { ...item, photo_url: "", photoMediaId: media.id } : item) });
  };
  const uploadJourneyPhoto = async (file, index) => {
    const previousMedia = images.find(image => Number(image.id) === Number(point.photos[index]?.photoMediaId)) ?? null;
    const media = await onUploadJourneyPhoto?.(file);
    if (!media?.id) return;
    onChange(previous => {
      const journey = normalizeJourney(previous);
      return { ...journey, photos: journey.photos.map((item, itemIndex) => itemIndex === index ? { ...item, url: "", photoMediaId: media.id } : item) };
    });
    if (previousMedia) await onRemoveJourneyPhoto?.(previousMedia);
  };
  const removeJourneyPhoto = async index => {
    const media = images.find(image => Number(image.id) === Number(point.photos[index]?.photoMediaId)) ?? null;
    update({ photos: point.photos.filter((_, itemIndex) => itemIndex !== index) });
    if (media) await onRemoveJourneyPhoto?.(media);
  };
  const changeJourneyPhoto = async (index, patch) => {
    const media = images.find(image => Number(image.id) === Number(point.photos[index]?.photoMediaId)) ?? null;
    update({ photos: point.photos.map((photo, itemIndex) => itemIndex === index ? { ...photo, ...patch } : photo) });
    if (Object.hasOwn(patch, "url") && media) await onRemoveJourneyPhoto?.(media);
  };

  return <details className="studio-general-info studio-start-point">
    <summary className="studio-general-info__header"><span className="studio-general-info__title" role="heading" aria-level="3">{isReturn ? "Retour" : "Point de départ"}</span></summary>
    <div className="studio-general-info__body studio-start-point__body">
      <p className="studio-help">{isReturn ? "Décrivez le retour après la dernière étape." : "Décrivez comment rejoindre le départ du roadbook."} Ajoutez un trajet par mode de transport, par exemple vélo puis train. Les distances et durées vides sont calculées à l’enregistrement si Google Maps est configuré.</p>

      <section className="studio-section-block">
        <div className="studio-stage-extra__header"><h4>Trajets et modes de transport</h4><button type="button" className="terrain-button terrain-button--secondary" onClick={() => { revealNewItem("segment", point.transport_segments.length); update({ transport_segments: [...point.transport_segments, createEmptyTransportSegment()] }); }}>Ajouter un trajet</button></div>
        {point.transport_segments.map((segment, index) => <TransportSegment key={`${scope}-segment-${index}`} scope={scope} segment={segment} index={index} initialRef={newItem.type === "segment" && newItem.index === index ? newItemRef : null} onChange={next => update({ transport_segments: point.transport_segments.map((item, itemIndex) => itemIndex === index ? next : item) })} onRemove={() => update({ transport_segments: point.transport_segments.filter((_, itemIndex) => itemIndex !== index) })} />)}
        {!point.transport_segments.length && <p className="studio-detail--empty">Aucun trajet. Ajoutez-en un pour choisir un mode de transport.</p>}
      </section>

      <section className="studio-section-block">
        <div className="studio-stage-extra__header"><h4>Cartes et fichiers GPX</h4></div>
        <RouteMapFields maps={point.route_maps} onChange={maps => update({ route_maps: maps })} idPrefix={`${scope}-route-map`} />
        {gpx && <GpxBlock label="GPX" mediaRows={isReturn ? gpx.returnGpxRoutes : gpx.startGpxRoutes} scope={scope} role="official" gpxUploading={gpx.gpxUploading} metricsLoading={gpx.metricsLoading} handleGpxReplace={gpx.handleGpxReplace} handleGpxDelete={gpx.handleGpxDelete} handleGpxUpload={gpx.handleGpxUpload} />}
      </section>

      <label className="studio-form-grid__full">Description<textarea value={point.description} onChange={e => update({ description: e.target.value })} /></label>

      <section className="studio-section-block">
        <div className="studio-stage-extra__header"><h4>Photos</h4><div className="studio-journey-photo__add-actions">
          <button type="button" className="terrain-button terrain-button--secondary" onClick={() => { revealNewItem("photo", point.photos.length); update({ photos: [...point.photos, { url: "", photoMediaId: null, caption: "" }] }); }}>Ajouter par URL</button>
          <label className="terrain-button terrain-button--secondary studio-file-button">{uploadLoading ? "Import…" : "Importer des photos"}<input type="file" accept="image/*" multiple disabled={uploadLoading} onChange={async event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; for (const file of files) { const media = await onUploadJourneyPhoto?.(file); if (media?.id) onChange(previous => { const journey = normalizeJourney(previous); return { ...journey, photos: [...journey.photos, { url: "", photoMediaId: media.id, caption: "" }] }; }); } }} /></label>
        </div></div>
        <div className="studio-journey-photo-list">
          {point.photos.map((item, index) => <JourneyPhotoFields key={`${scope}-photo-${item.photoMediaId ?? "url"}-${index}`} item={item} index={index} scope={scope} media={images.find(image => Number(image.id) === Number(item.photoMediaId)) ?? null} initialRef={newItem.type === "photo" && newItem.index === index ? newItemRef : null} uploadLoading={uploadLoading} onChange={patch => changeJourneyPhoto(index, patch)} onUpload={file => uploadJourneyPhoto(file, index)} onRemove={() => removeJourneyPhoto(index)} />)}
        </div>
        {!point.photos.length && <p className="studio-detail--empty">Aucune photo.</p>}
      </section>

      <section className="studio-section-block">
        <div className="studio-stage-extra__header"><h4>Hébergements</h4><button type="button" className="terrain-button terrain-button--secondary" onClick={() => { revealNewItem("accommodation", point.accommodations.length); update({ accommodations: [...point.accommodations, { name: "", type: "", url: "", photo: "", photoMediaId: null, price: "", note: "", description: "", preview: null }] }); }}>Ajouter un hébergement</button></div>
        {point.accommodations.map((item, index) => <article ref={newItem.type === "accommodation" && newItem.index === index ? newItemRef : null} className="studio-subitem-card" key={`${scope}-accommodation-${index}`}>
          <AccommodationFields item={item} prefix={`${scope}-accommodation-${index}`} onChange={(field, nextValue) => changeArrayItem("accommodations", index, field, nextValue)} photoMedia={images.find(image => Number(image.id) === Number(item.photoMediaId)) ?? null} onUploadPhoto={file => uploadAccommodationPhoto(file, index)} uploadLoading={uploadLoading} />
          <button type="button" className="terrain-button terrain-button--danger" onClick={() => update({ accommodations: point.accommodations.filter((_, itemIndex) => itemIndex !== index) })}>Supprimer</button>
        </article>)}
        {!point.accommodations.length && <p className="studio-detail--empty">Aucun hébergement.</p>}
      </section>

      <section className="studio-section-block">
        <div className="studio-stage-extra__header"><h4>Points d’intérêt</h4><button type="button" className="terrain-button terrain-button--secondary" onClick={() => { revealNewItem("poi", point.pois.length); update({ pois: [...point.pois, { name: "", region: "", link_url: "", description: "", photo_url: "", photoMediaId: null, preview: null }] }); }}>Ajouter un POI</button></div>
        {point.pois.map((item, index) => <article ref={newItem.type === "poi" && newItem.index === index ? newItemRef : null} className="studio-subitem-card" key={`${scope}-poi-${index}`}>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>Nom<input value={item.name} onChange={e => changeArrayItem("pois", index, "name", e.target.value)} /></label>
            <label>Région / ville<input value={item.region} onChange={e => changeArrayItem("pois", index, "region", e.target.value)} /></label>
            <label className="studio-form-grid__full">Lien<input type="url" value={item.link_url} onChange={e => update({ pois: point.pois.map((poi, itemIndex) => itemIndex === index ? { ...poi, link_url: e.target.value, preview: null } : poi) })} /></label>
            <div className="studio-form-grid__full"><label htmlFor={`${scope}-poi-photo-${index}`}>Photo (URL ou fichier)</label><div className="studio-resource-field">
              <input id={`${scope}-poi-photo-${index}`} type="url" value={item.photo_url} onChange={e => update({ pois: point.pois.map((poi, itemIndex) => itemIndex === index ? { ...poi, photo_url: e.target.value, photoMediaId: null } : poi) })} />
              {item.photoMediaId && <span className="studio-resource-field__file">{images.find(image => Number(image.id) === Number(item.photoMediaId))?.file_name || "Fichier importé"}</span>}
              <label className="terrain-button--secondary studio-action-button--compact studio-file-button">{uploadLoading ? "Import…" : "Importer"}<input type="file" accept="image/*" disabled={uploadLoading} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) await uploadPoiPhoto(file, index); }} /></label>
            </div></div>
            <label className="studio-form-grid__full">Description<textarea value={item.description} onChange={e => changeArrayItem("pois", index, "description", e.target.value)} /></label>
          </div>
          <button type="button" className="terrain-button terrain-button--danger" onClick={() => update({ pois: point.pois.filter((_, itemIndex) => itemIndex !== index) })}>Supprimer</button>
        </article>)}
        {!point.pois.length && <p className="studio-detail--empty">Aucun POI.</p>}
      </section>
    </div>
  </details>;
}
