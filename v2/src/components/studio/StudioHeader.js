export default function StudioHeader({
  roadbook,
  isPublic,
  activity,
  destination,
  project,
  duplicating,
  handleDuplicate,
  saving,
  deletingRoadbook,
  onSaveAll,
  onDeleteRoadbook,
  onAddStage,
  onToggleVisibility,
  onView,
  canManage,
}) {
  return (
    <div className="studio-panel__header studio-editor-header">
      <div className="studio-editor-header__info">
        <p className="studio-eyebrow">Éditeur</p>
        <h2 id="studio-detail-title">{roadbook?.title ?? "Roadbook"}</h2>
        <div className="studio-editor-meta">
          <span className={`studio-badge ${isPublic ? "studio-badge--public" : "studio-badge--private"}`}>
            {isPublic ? "Public" : "Privé"}
          </span>
          {activity && <span className="studio-hero__tag">{activity}</span>}
          {destination && <span className="studio-hero__tag">{destination}</span>}
          {project && <span className="studio-hero__tag">{project}</span>}
        </div>
      </div>
      <div className="studio-actions studio-editor-actions">
        <button type="button" onClick={onSaveAll} disabled={saving || deletingRoadbook}>
          {saving ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>
        <button type="button" onClick={onAddStage}>Ajouter une étape</button>
        {canManage && <button type="button" onClick={onToggleVisibility}>{isPublic ? "Rendre privé" : "Rendre public"}</button>}
        <button type="button" onClick={onView} disabled={saving || deletingRoadbook} className="terrain-button--secondary studio-action-button--compact">
          {saving ? "Enregistrement…" : "Enregistrer et voir"}
        </button>
        <button type="button" onClick={handleDuplicate} disabled={duplicating} className="terrain-button--secondary studio-action-button--compact">
          {duplicating ? "..." : "Dupliquer"}
        </button>
        {canManage && <button type="button" onClick={onDeleteRoadbook} disabled={saving || deletingRoadbook} className="terrain-button--danger studio-action-button--compact">
          {deletingRoadbook ? "Suppression…" : "Supprimer le roadbook"}
        </button>}
      </div>
    </div>
  );
}
