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

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || !id) return;
    supabase
      .from("roadbooks")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error: err }) => {
        if (err) {
          console.error(err);
          setError(err.message);
        } else if (!data) {
          setError("Roadbook introuvable.");
        } else {
          setRoadbook(data);
          setTitle(data.title);
          setDescription(data.description ?? "");
          setIsPublic(data.is_public);
        }
        setLoading(false);
      });
  }, [user, id]);

  async function handleSave(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    const slug = roadbook.slug;
    const { error: updateError } = await supabase
      .from("roadbooks")
      .update({ title, description, slug })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess("Roadbook mis à jour.");
      setRoadbook((prev) => ({ ...prev, title, description }));
    }
    setSaving(false);
  }

  async function handleToggleVisibility() {
    const { error: updateError } = await supabase
      .from("roadbooks")
      .update({ is_public: !isPublic })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setIsPublic(!isPublic);
      setRoadbook((prev) => ({ ...prev, is_public: !isPublic }));
      setSuccess(isPublic ? "Roadbook passé en privé." : "Roadbook passé en public.");
    }
  }

  if (authLoading || loading) return <main><p>Chargement…</p></main>;
  if (!user) return null;
  if (error && !roadbook) return <main><p style={{ color: "red" }}>{error}</p><Link href="/dashboard/roadbooks">Retour</Link></main>;

  return (
    <main>
      <h1>{roadbook?.title ?? "Roadbook"}</h1>

      <form onSubmit={handleSave}>
        <label>
          Titre
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error && <p style={{ color: "red" }}>{error}</p>}
        {success && <p style={{ color: "green" }}>{success}</p>}

        <button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      <section>
        <h2>Visibilité</h2>
        <p>Actuellement : {isPublic ? "public" : "privé"}</p>
        <button type="button" onClick={handleToggleVisibility}>
          Passer en {isPublic ? "privé" : "public"}
        </button>
      </section>

      <section>
        <h2>Informations</h2>
        <dl>
          <dt>Slug</dt>
          <dd><code>{roadbook?.slug}</code></dd>
          <dt>ID</dt>
          <dd><code>{roadbook?.id}</code></dd>
          <dt>Créé le</dt>
          <dd>{new Date(roadbook?.created_at).toLocaleDateString()}</dd>
        </dl>
      </section>

      <p><Link href="/dashboard/roadbooks">Retour à la liste</Link></p>
    </main>
  );
}
