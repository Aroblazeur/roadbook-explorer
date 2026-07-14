"use client";

export default function NoteForm({
  stageId,
  variantId = null,
  stage,
  noteForm,
  setNoteForm,
  clearNoteForm,
  handleNoteSubmit,
  handleDeleteNote,
}) {
  const notes = Array.isArray(stage.notes) ? stage.notes : [];
  return (
    <div className="studio-stage-extra">
      <div className="studio-stage-extra__header">
        <h5>Notes ({notes.length})</h5>
        <button type="button" className="terrain-button terrain-button--secondary" onClick={() => setNoteForm({ ...noteForm, stage_id: stageId, variant_id: variantId })}>Ajouter une note</button>
      </div>
      <div className="studio-sublist__list">
        {notes.length > 0 ? notes.map((note, ni) => (
          <article key={ni} className="studio-subitem-card">
            <div className="studio-subitem-card__header">
              <strong>Note {ni + 1}</strong>
              <div style={{ display: "flex", gap: "0.3rem" }}>
                <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => setNoteForm({ stage_id: stageId, variant_id: variantId, text: note.text ?? "", editing: ni })}>✎</button>
                <button type="button" className="terrain-button terrain-button--danger" onClick={() => handleDeleteNote(stageId, ni, variantId)}>Supprimer</button>
              </div>
            </div>
            <div className="studio-form-grid studio-form-grid--compact" style={{ marginTop: "0.3rem" }}>
              {(note.text ?? note) && <label className="studio-form-grid__full" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{(note.text ?? note)}</label>}
              {note.photo && <label className="studio-form-grid__full" style={{ margin: 0 }}><img src={note.photo} alt="" style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "4px" }} /></label>}
            </div>
          </article>
        )) : <p className="studio-detail--empty">Aucune note.</p>}
      </div>
      {noteForm.stage_id === stageId && (noteForm.variant_id ?? null) === variantId && (
        <form onSubmit={handleNoteSubmit} className="studio-create-form" style={{ marginTop: "0.5rem" }}>
          <h4>{noteForm.editing != null ? "Modifier la note" : "Ajouter une note"}</h4>
          <div className="studio-form-grid studio-form-grid--compact">
            <label className="studio-form-grid__full">Texte<textarea value={noteForm.text} onChange={e => setNoteForm({ ...noteForm, text: e.target.value })} required /></label>
          </div>
          <div className="studio-create-form__actions">
            <button type="submit" className="terrain-button">Enregistrer la note</button>
            <button type="button" className="terrain-button terrain-button--secondary" onClick={clearNoteForm}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}
