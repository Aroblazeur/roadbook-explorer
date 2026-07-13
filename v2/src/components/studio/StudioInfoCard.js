export default function StudioInfoCard({ roadbook }) {
  return (
    <div className="studio-card studio-card--muted">
      <dl className="studio-info-grid">
        <dt>Slug</dt><dd><code>{roadbook?.slug}</code></dd>
        <dt>ID</dt><dd><code>{roadbook?.id}</code></dd>
        <dt>Créé le</dt><dd>{roadbook?.created_at ? new Date(roadbook.created_at).toLocaleDateString() : ""}</dd>
      </dl>
    </div>
  );
}
