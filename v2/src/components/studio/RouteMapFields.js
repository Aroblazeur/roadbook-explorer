"use client";

export function normalizeRouteMaps(value, legacyUrl = "") {
  const maps = Array.isArray(value)
    ? value.map(item => typeof item === "string" ? { label: "", url: item } : { label: String(item?.label ?? ""), url: String(item?.url ?? "") })
    : [];
  const legacy = String(legacyUrl ?? "");
  if (legacy && !maps.some(item => item.url === legacy)) maps.unshift({ label: "", url: legacy });
  return maps;
}

export default function RouteMapFields({ maps, onChange, idPrefix, onRecalculate, recalculating = false }) {
  const rows = normalizeRouteMaps(maps);
  const update = (index, patch) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <div className="studio-route-map-list">
    {rows.map((item, index) => <div className="studio-route-map-list__item" key={`${idPrefix}-${index}`}>
      <label htmlFor={`${idPrefix}-label-${index}`}>Nom de l’itinéraire<input id={`${idPrefix}-label-${index}`} value={item.label} placeholder={`Itinéraire ${index + 1}`} onChange={event => update(index, { label: event.target.value })} /></label>
      <label htmlFor={`${idPrefix}-url-${index}`}>Lien de carte<input id={`${idPrefix}-url-${index}`} type="url" value={item.url} placeholder="Google Maps ou carte intégrable" onChange={event => update(index, { url: event.target.value })} /></label>
      <div className="studio-route-map-list__actions">
        {index === 0 && onRecalculate && <button type="button" className="terrain-button terrain-button--secondary studio-action-button--compact" onClick={onRecalculate} disabled={recalculating || !item.url}>{recalculating ? "Calcul…" : "Calculer l’itinéraire"}</button>}
        <button type="button" className="terrain-button terrain-button--danger studio-action-button--compact" onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}>Supprimer</button>
      </div>
    </div>)}
    <button type="button" className="terrain-button terrain-button--secondary studio-action-button--compact" onClick={() => onChange([...rows, { label: "", url: "" }])}>Ajouter une carte</button>
  </div>;
}
