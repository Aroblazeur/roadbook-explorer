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
}) {
  return (
    <div className="studio-hero">
      <div className="studio-hero__info">
        <h1 className="studio-hero__title">{roadbook?.title ?? "Roadbook"}</h1>
        <div className="studio-hero__meta">
          <span className={`studio-badge ${isPublic ? "studio-badge--public" : "studio-badge--private"}`}>
            {isPublic ? "Public" : "Privé"}
          </span>
          {activity && <span className="studio-hero__tag">{activity}</span>}
          {destination && <span className="studio-hero__tag">{destination}</span>}
          {project && <span className="studio-hero__tag">{project}</span>}
        </div>
      </div>
      <div className="studio-hero__actions">
        <Link href="/dashboard/roadbooks" className="terrain-button--secondary studio-action-button--compact">Retour</Link>
        <Link href={`/roadbooks/${roadbook?.slug}`} className="terrain-button--secondary studio-action-button--compact">Voir</Link>
        <button type="button" onClick={handleDuplicate} disabled={duplicating} className="terrain-button--secondary studio-action-button--compact">
          {duplicating ? "..." : "Dupliquer"}
        </button>
        <button type="button" onClick={() => downloadDraftExport(user?.id, id, `${roadbook?.slug ?? "roadbook"}-brouillon.json`)} className="terrain-button--secondary studio-action-button--compact">
          Export brouillon
        </button>
      </div>
    </div>
  );
}
