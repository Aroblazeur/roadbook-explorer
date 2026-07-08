"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function RoadbooksPage() {
  const { user, loading, supabase } = useAuth();
  const router = useRouter();
  const [roadbooks, setRoadbooks] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("roadbooks")
      .select("id, slug, title, description, is_public, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) console.error(err);
        else setRoadbooks(data ?? []);
        setFetching(false);
      });
  }, [user]);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `roadbook-${Date.now()}`;

    const { error: insertError } = await supabase.from("roadbooks").insert({
      slug,
      owner_id: user.id,
      title,
      description,
      is_public: isPublic,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setTitle("");
      setDescription("");
      setIsPublic(false);
      const { data } = await supabase
        .from("roadbooks")
        .select("id, slug, title, description, is_public, created_at")
        .order("created_at", { ascending: false });
      setRoadbooks(data ?? []);
    }
  }

  if (loading || fetching) return <main><p>Chargement…</p></main>;
  if (!user) return null;

  return (
    <main>
      <h1>Mes roadbooks</h1>

      <section>
        <h2>Créer un roadbook</h2>
        <form onSubmit={handleCreate}>
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
          <label>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            Public
          </label>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit">Créer</button>
        </form>
      </section>

      <section>
        <h2>Liste ({roadbooks.length})</h2>
        {roadbooks.length === 0 && <p>Aucun roadbook pour le moment.</p>}
        <ul>
          {roadbooks.map((rb) => (
            <li key={rb.id}>
              <Link href={`/dashboard/roadbooks/${rb.id}`}>
                {rb.title}
              </Link>
              {" — "}
              {rb.is_public ? "public" : "privé"}
              {rb.description && <> — {rb.description}</>}
              {" — "}
              <Link href={`/roadbooks/${rb.slug}`}>Voir</Link>
            </li>
          ))}
        </ul>
      </section>

      <p><Link href="/dashboard">Retour au dashboard</Link></p>
    </main>
  );
}
