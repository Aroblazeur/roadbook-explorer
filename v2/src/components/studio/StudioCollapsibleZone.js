export default function StudioCollapsibleZone({ tone, title, summary, children, defaultOpen = false }) {
  return <details className={`studio-zone studio-zone--${tone} studio-collapsible-zone`} open={defaultOpen || undefined}>
    <summary className="studio-collapsible-zone__summary">
      <span className="studio-zone__title">{title}</span>
      <span className="studio-collapsible-zone__preview">{summary || "Non renseigné"}</span>
    </summary>
    <div className="studio-collapsible-zone__body">{children}</div>
  </details>;
}
