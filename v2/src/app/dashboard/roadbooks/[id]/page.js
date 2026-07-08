"use client";

import { useAuth } from "@/lib/auth-context";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function RoadbookDetailPage() {
  const { user, loading: authLoading, supabase } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const [roadbook, setRoadbook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [stages, setStages] = useState([]);
  const [stageDayNumber, setStageDayNumber] = useState("");
  const [stageTitle, setStageTitle] = useState("");
  const [stageStart, setStageStart] = useState("");
  const [stageEnd, setStageEnd] = useState("");
  const [stageDist, setStageDist] = useState("");
  const [stageGain, setStageGain] = useState("");
  const [stageLoss, setStageLoss] = useState("");
  const [stageDifficulty, setStageDifficulty] = useState("");
  const [stageAccommodation, setStageAccommodation] = useState("");
  const [stageDescription, setStageDescription] = useState("");
  const [stageNotes, setStageNotes] = useState("");
  const [stageWarning, setStageWarning] = useState("");
  const [stageError, setStageError] = useState(null);
  const [stageSuccess, setStageSuccess] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading]);

  function loadData() {
    if (!user || !id) return;
    supabase.from("roadbooks").select("*").eq("id", id).single()
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); }
        else if (!data) { setError("Roadbook introuvable."); }
        else {
          setRoadbook(data);
          setTitle(data.title);
          setDescription(data.description ?? "");
          setIsPublic(data.is_public);
        }
        setLoading(false);
      });

    supabase.from("stages").select("*").eq("roadbook_id", Number(id))
      .order("stage_number", { ascending: true })
      .then(({ data }) => { if (data) setStages(data); });
  }

  useEffect(() => { loadData(); }, [user, id]);

  async function handleSave(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSaving(true);
    const { error: updateError } = await supabase
      .from("roadbooks").update({ title, description }).eq("id", id);
    if (updateError) setError(updateError.message);
    else { setSuccess("Roadbook mis à jour."); setRoadbook(prev => ({ ...prev, title, description })); }
    setSaving(false);
  }

  async function handleToggleVisibility() {
    const { error: updateError } = await supabase
      .from("roadbooks").update({ is_public: !isPublic }).eq("id", id);
    if (updateError) setError(updateError.message);
    else { setIsPublic(!isPublic); setSuccess(isPublic ? "Roadbook passé en privé." : "Roadbook passé en public."); }
  }

  function clearStageForm() {
    setStageDayNumber(""); setStageTitle(""); setStageStart(""); setStageEnd("");
    setStageDist(""); setStageGain(""); setStageLoss(""); setStageDifficulty("");
    setStageAccommodation(""); setStageDescription(""); setStageNotes(""); setStageWarning("");
    setEditingStage(null);
  }

  function fillStageForm(stage) {
    const meta = stage.metadata ?? {};
    setStageDayNumber(String(stage.stage_number));
    setStageTitle(stage.title ?? ""); setStageStart(stage.departure ?? "");
    setStageEnd(stage.arrival ?? "");
    setStageDist(stage.distance_km != null ? String(stage.distance_km) : "");
    setStageGain(stage.elevation_gain_m != null ? String(stage.elevation_gain_m) : "");
    setStageLoss(stage.elevation_loss_m != null ? String(stage.elevation_loss_m) : "");
    setStageDifficulty(meta.difficulty ?? ""); setStageAccommodation(stage.accommodation_name ?? "");
    setStageDescription(meta.description ?? "");
    setStageNotes(stage.notes?.length ? stage.notes.map(n => n.text ?? n).join("\n") : "");
    setStageWarning(meta.warning ?? "");
    setEditingStage(stage);
  }

  async function handleStageSubmit(e) {
    e.preventDefault();
    setStageError(null); setStageSuccess(null);
    const dayNumber = Number(stageDayNumber);
    if (!dayNumber) { setStageError("Le numéro d'étape est obligatoire."); return; }
    const notes = stageNotes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text }));
    const metadata = {};
    if (stageDifficulty) metadata.difficulty = stageDifficulty;
    if (stageDescription) metadata.description = stageDescription;
    if (stageWarning) metadata.warning = stageWarning;
    const record = {
      roadbook_id: Number(id), stage_number: dayNumber, title: stageTitle || null,
      departure: stageStart || null, arrival: stageEnd || null,
      distance_km: stageDist ? Number(stageDist) : null,
      elevation_gain_m: stageGain ? Number(stageGain) : null,
      elevation_loss_m: stageLoss ? Number(stageLoss) : null,
      accommodation_name: stageAccommodation || null,
      notes: notes.length ? notes : [], metadata,
    };

    if (editingStage) {
      const { error: updateError } = await supabase.from("stages").update(record).eq("id", editingStage.id);
      if (updateError) { setStageError(updateError.message); return; }
      setStageSuccess("Étape mise à jour.");
    } else {
      const { error: insertError } = await supabase.from("stages").insert(record);
      if (insertError) { setStageError(insertError.message); return; }
      setStageSuccess("Étape créée.");
    }
    clearStageForm();
    const { data } = await supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number", { ascending: true });
    if (data) setStages(data);
  }

  async function handleDeleteStage(stageId) {
    if (!window.confirm("Supprimer cette étape ?")) return;
    setDeleting(stageId);
    const { error: deleteError } = await supabase.from("stages").delete().eq("id", stageId);
    if (deleteError) { setStageError(deleteError.message); }
    else { setStages(prev => prev.filter(s => s.id !== stageId)); setStageSuccess("Étape supprimée."); }
    setDeleting(null);
  }

  if (authLoading || loading) return <main><p>Chargement…</p></main>;
  if (!user) return null;
  if (error && !roadbook) return <main><p style={{ color: "red" }}>{error}</p><Link href="/dashboard/roadbooks">Retour</Link></main>;

  return (
    <main>
      <h1>{roadbook?.title ?? "Roadbook"}</h1>

      <form onSubmit={handleSave}>
        <label>Titre<input type="text" value={title} onChange={e => setTitle(e.target.value)} required /></label>
        <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} /></label>
        {error && <p style={{ color: "red" }}>{error}</p>}
        {success && <p style={{ color: "green" }}>{success}</p>}
        <button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
      </form>

      <section>
        <h2>Visibilité</h2>
        <p>Actuellement : {isPublic ? "public" : "privé"}</p>
        <button type="button" onClick={handleToggleVisibility}>Passer en {isPublic ? "privé" : "public"}</button>
      </section>

      <section>
        <h2>Étapes ({stages.length})</h2>
        {stageSuccess && <p style={{ color: "green" }}>{stageSuccess}</p>}
        {stageError && <p style={{ color: "red" }}>{stageError}</p>}

        <form onSubmit={handleStageSubmit}>
          <fieldset>
            <legend>{editingStage ? "Modifier l'étape" : "Nouvelle étape"}</legend>
            <label>N° étape<input type="number" value={stageDayNumber} onChange={e => setStageDayNumber(e.target.value)} required /></label>
            <label>Titre<input type="text" value={stageTitle} onChange={e => setStageTitle(e.target.value)} /></label>
            <label>Départ<input type="text" value={stageStart} onChange={e => setStageStart(e.target.value)} /></label>
            <label>Arrivée<input type="text" value={stageEnd} onChange={e => setStageEnd(e.target.value)} /></label>
            <label>Distance (km)<input type="number" step="0.01" value={stageDist} onChange={e => setStageDist(e.target.value)} /></label>
            <label>D+ (m)<input type="number" value={stageGain} onChange={e => setStageGain(e.target.value)} /></label>
            <label>D- (m)<input type="number" value={stageLoss} onChange={e => setStageLoss(e.target.value)} /></label>
            <label>Difficulté<input type="text" value={stageDifficulty} onChange={e => setStageDifficulty(e.target.value)} placeholder="ex: modéré" /></label>
            <label>Hébergement<input type="text" value={stageAccommodation} onChange={e => setStageAccommodation(e.target.value)} /></label>
            <label>Description<textarea value={stageDescription} onChange={e => setStageDescription(e.target.value)} /></label>
            <label>Notes (une par ligne)<textarea value={stageNotes} onChange={e => setStageNotes(e.target.value)} placeholder="Note 1&#10;Note 2" /></label>
            <label>Avertissement<input type="text" value={stageWarning} onChange={e => setStageWarning(e.target.value)} /></label>
            <button type="submit">{editingStage ? "Mettre à jour" : "Créer l'étape"}</button>
            {editingStage && <button type="button" onClick={clearStageForm}>Annuler</button>}
          </fieldset>
        </form>

        {stages.length === 0 && <p>Aucune étape.</p>}
        <ul>
          {stages.map(stage => {
            const meta = stage.metadata ?? {};
            return (
              <li key={stage.id}>
                <strong>Jour {stage.stage_number}</strong>{stage.title && <> — {stage.title}</>}
                <br />
                {stage.departure && <>Départ : {stage.departure}</>}
                {stage.arrival && <> → Arrivée : {stage.arrival}</>}
                {stage.distance_km != null && <> — {stage.distance_km} km</>}
                {stage.elevation_gain_m != null && <> — D+ {stage.elevation_gain_m}m</>}
                {stage.elevation_loss_m != null && <> — D- {stage.elevation_loss_m}m</>}
                {meta.difficulty && <> — {meta.difficulty}</>}
                {stage.accommodation_name && <> — {stage.accommodation_name}</>}
                {meta.warning && <p style={{ color: "orange" }}>{meta.warning}</p>}
                <div>
                  <button type="button" onClick={() => fillStageForm(stage)} disabled={deleting === stage.id}>Modifier</button>
                  <button type="button" onClick={() => handleDeleteStage(stage.id)} disabled={deleting === stage.id}>Supprimer</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Informations</h2>
        <dl>
          <dt>Slug</dt><dd><code>{roadbook?.slug}</code></dd>
          <dt>ID</dt><dd><code>{roadbook?.id}</code></dd>
          <dt>Créé le</dt><dd>{roadbook?.created_at ? new Date(roadbook.created_at).toLocaleDateString() : ""}</dd>
        </dl>
      </section>

      <nav>
        <Link href={`/roadbooks/${roadbook?.slug}`}>Voir le roadbook</Link>
        {" | "}
        <Link href="/dashboard/roadbooks">Retour à la liste</Link>
      </nav>
    </main>
  );
}
