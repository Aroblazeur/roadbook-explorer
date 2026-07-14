"use client";

export default function GeneralInfoForm({
  title, setTitle,
  description, setDescription,
  activity, setActivity,
  destination, setDestination,
  project, setProject,
  embedded = false,
}) {
  return (
    <div className={embedded ? "studio-section-block" : "studio-card studio-card--accent"}>
      {!embedded && <div className="studio-card__header"><h3>Informations générales</h3></div>}
      <div className={embedded ? "studio-section-block__body" : "studio-card__body"}>
        <div className="studio-form-grid studio-form-grid--compact">
          <label className="studio-form-grid__full">Titre<input type="text" value={title} onChange={e => setTitle(e.target.value)} required /></label>
          <label className="studio-form-grid__full">Description<textarea value={description} onChange={e => setDescription(e.target.value)} /></label>
          <label>Activité<input type="text" value={activity} onChange={e => setActivity(e.target.value)} placeholder="ex: vélo, randonnée" /></label>
          <label>Destination<input type="text" value={destination} onChange={e => setDestination(e.target.value)} placeholder="ex: Espagne, Alpes" /></label>
          <label>Projet<select value={project} onChange={e => setProject(e.target.value)}>
            <option value="">—</option>
            <option value="En projet">En projet</option>
            <option value="Voyage réalisé">Voyage réalisé</option>
            <option value="À faire">À faire</option>
          </select></label>
        </div>
      </div>
    </div>
  );
}
