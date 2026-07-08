import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getRoadbook(slug) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: roadbook } = await supabase
    .from("roadbooks")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!roadbook) return null;

  if (!roadbook.is_public) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== roadbook.owner_id) return { private: true };
  }

  const { data: stages } = await supabase
    .from("stages")
    .select("*")
    .eq("roadbook_id", roadbook.id)
    .order("stage_number", { ascending: true });

  return { roadbook, stages: stages ?? [], private: false };
}

export default async function RoadbookViewPage({ params }) {
  const { slug } = await params;
  const result = await getRoadbook(slug);

  if (!result) return notFound();
  if (result.private) {
    return (
      <main>
        <h1>Roadbook privé</h1>
        <p>Ce roadbook est privé. Connectez-vous avec le compte propriétaire pour le consulter.</p>
        <p><Link href="/login">Se connecter</Link></p>
        <p><Link href="/">Retour à l&apos;accueil</Link></p>
      </main>
    );
  }

  const { roadbook, stages } = result;

  return (
    <main>
      <article>
        <header>
          <h1>{roadbook.title}</h1>
          {roadbook.description && <p>{roadbook.description}</p>}
          <p>Visibilité : {roadbook.is_public ? "public" : "privé"}</p>
        </header>

        {renderMetrics(roadbook)}

        <section>
          <h2>Étapes ({stages.length})</h2>
          {stages.length === 0 && <p>Ce roadbook n&apos;a pas encore d&apos;étapes.</p>}
          <ol style={{ listStyle: "none", padding: 0 }}>
            {stages.map(stage => <li key={stage.id}>{renderStageCard(stage)}</li>)}
          </ol>
        </section>
      </article>

      <p><Link href="/">Retour à l&apos;accueil</Link></p>
    </main>
  );
}

function renderMetrics(roadbook) {
  const metrics = [
    { label: "Distance", value: roadbook.distance_km, unit: "km" },
    { label: "D+", value: roadbook.elevation_gain_m, unit: "m" },
    { label: "D−", value: roadbook.elevation_loss_m, unit: "m" },
  ].filter(m => m.value != null);

  if (!metrics.length) return null;

  return (
    <section>
      <h2>Métriques</h2>
      <dl style={{ display: "flex", gap: "1.5rem" }}>
        {metrics.map(m => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd><strong>{m.value}</strong> {m.unit}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function renderStageCard(stage) {
  const meta = stage.metadata ?? {};
  return (
    <article style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
      <h3>Jour {stage.stage_number}{stage.title ? <> — {stage.title}</> : null}</h3>

      {(stage.departure || stage.arrival) && (
        <p>
          {stage.departure && <span>Départ : {stage.departure}</span>}
          {stage.departure && stage.arrival && <> → </>}
          {stage.arrival && <span>Arrivée : {stage.arrival}</span>}
        </p>
      )}

      {stage.distance_km != null && <p>Distance : {stage.distance_km} km</p>}
      {stage.elevation_gain_m != null && <p>D+ : {stage.elevation_gain_m} m</p>}
      {stage.elevation_loss_m != null && <p>D− : {stage.elevation_loss_m} m</p>}
      {meta.difficulty && <p>Difficulté : {meta.difficulty}</p>}

      {stage.accommodation_name && <p>Hébergement : {stage.accommodation_name}</p>}

      {meta.description && <p>{meta.description}</p>}

      {meta.warning && <p style={{ color: "orange" }}>{meta.warning}</p>}

      {Array.isArray(stage.notes) && stage.notes.length > 0 && (
        <details>
          <summary>Notes ({stage.notes.length})</summary>
          <ul>
            {stage.notes.map((note, i) => (
              <li key={i}>{note.text ?? note}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
