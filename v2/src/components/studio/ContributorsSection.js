"use client";

import { useCallback, useEffect, useState } from "react";

export default function ContributorsSection({ supabase, roadbookId, creatorEmail, canManage }) {
  const [contributors, setContributors] = useState([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const loadContributors = useCallback(async () => {
    if (!roadbookId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("roadbook_contributors")
      .select("user_id, email, created_at")
      .eq("roadbook_id", Number(roadbookId))
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setContributors(data ?? []);
  }, [supabase, roadbookId]);

  useEffect(() => { loadContributors(); }, [loadContributors]);

  async function addContributor(event) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("add_roadbook_contributor", {
      target_roadbook_id: Number(roadbookId),
      contributor_email: normalizedEmail,
    });
    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setEmail("");
    setMessage({ type: "success", text: "Contributeur ajouté." });
    await loadContributors();
  }

  async function removeContributor(contributor) {
    if (!window.confirm(`Retirer ${contributor.email} des auteurs de ce roadbook ?`)) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("remove_roadbook_contributor", {
      target_roadbook_id: Number(roadbookId),
      contributor_user_id: contributor.user_id,
    });
    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setMessage({ type: "success", text: "Contributeur retiré." });
    await loadContributors();
  }

  return (
    <section className="studio-contributors" aria-labelledby="studio-contributors-title">
      <div>
        <p className="studio-eyebrow">Auteurs</p>
        <h3 id="studio-contributors-title">Contributeurs</h3>
        <p className="studio-contributors__creator">Créateur : {creatorEmail}</p>
      </div>
      {loading ? <p>Chargement des contributeurs…</p> : (
        <ul className="studio-contributors__list">
          {contributors.length === 0 && <li>Aucun contributeur.</li>}
          {contributors.map(contributor => (
            <li key={contributor.user_id}>
              <span>{contributor.email}</span>
              {canManage && (
                <button type="button" className="terrain-button--secondary studio-action-button--compact" disabled={saving} onClick={() => removeContributor(contributor)}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form className="studio-contributors__form" onSubmit={addContributor}>
          <label>
            Adresse e-mail du contributeur
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} required />
          </label>
          <button type="submit" disabled={saving}>{saving ? "Ajout…" : "Ajouter"}</button>
          <small>Le contributeur doit déjà disposer d’un compte confirmé.</small>
        </form>
      )}
      {message && <p className={message.type === "error" ? "page-error" : "page-success"}>{message.text}</p>}
    </section>
  );
}
