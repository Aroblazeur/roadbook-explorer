import Link from "next/link";

export default function StudioHeader({
  roadbook,
  isPublic,
  activity,
  destination,
  project,
  duplicating,
  handleDuplicate,
  downloadDraftExport,
  user,
  id,
  onAddStage,
  onToggleVisibility,
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
        <button type="button" onClick={onAddStage}>Ajouter une étape</button>
        <button type="button" onClick={() => downloadDraftExport(user?.id, id, `${roadbook?.slug ?? "roadbook"}.json`)} className="terrain-button--secondary">
          Télécharger le JSON
        </button>
        <button type="button" onClick={onToggleVisibility}>{isPublic ? "Rendre privé" : "Rendre public"}</button>
        <Link href="/dashboard/roadbooks" className="terrain-button--secondary studio-action-button--compact">Retour</Link>
        <Link href={`/roadbooks/${roadbook?.slug}`} className="terrain-button--secondary studio-action-button--compact">Voir</Link>
        <button type="button" onClick={handleDuplicate} disabled={duplicating} className="terrain-button--secondary studio-action-button--compact">
          {duplicating ? "..." : "Dupliquer"}
        </button>
      </div>
    </div>
  );
}
