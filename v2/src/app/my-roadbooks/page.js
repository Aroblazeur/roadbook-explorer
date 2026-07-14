import CatalogHeader from "@/components/CatalogHeader";
import { getOwnedRoadbooks } from "@/lib/getPublicRoadbooks";
import { createServerSupabase } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Mes roadbooks — RoadBook Explorer",
  description: "Bibliothèque des roadbooks créés par l'utilisateur",
};

export default async function MyRoadbooksPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/my-roadbooks");

  const roadbooks = await getOwnedRoadbooks(user.id);

  return (
    <>
      <CatalogHeader />
      <main className="container">
        <div className="catalog-page-heading">
          <p className="home-access-eyebrow">Ma bibliothèque</p>
          <h2>Mes roadbooks</h2>
          <p>Tous les roadbooks que vous avez créés, qu'ils soient publics ou privés.</p>
        </div>

        <div className="roadbook-library-actions">
          <Link href="/dashboard/roadbooks" className="terrain-button terrain-button--secondary studio-action-button--compact">
            Ouvrir le Studio
          </Link>
        </div>

        {roadbooks.length === 0 && (
          <section className="card">
            <p className="empty">Vous n'avez encore créé aucun roadbook.</p>
          </section>
        )}

        <div className="roadbook-library-grid">
          {roadbooks.map(roadbook => (
            <PersonalRoadbookCard key={roadbook.id} roadbook={roadbook} />
          ))}
        </div>
      </main>
    </>
  );
}

function PersonalRoadbookCard({ roadbook }) {
  const metaParts = [
    roadbook.is_public ? "Public" : "Privé",
    roadbook.activity,
    roadbook.destination,
    roadbook.distance_km != null && `${roadbook.distance_km} km`,
    roadbook.stage_count > 0 && `${roadbook.stage_count} étapes`,
  ].filter(Boolean);

  return (
    <article className="roadbook-library-card roadbook-library-card--personal">
      <div className={roadbook.coverSignedUrl ? "roadbook-library-card__cover" : "roadbook-library-card__cover roadbook-library-card__cover--placeholder"}>
        {roadbook.coverSignedUrl ? (
          <img
            src={roadbook.coverSignedUrl}
            alt={`Couverture ${roadbook.title}`}
            className="roadbook-library-card__cover-image"
            loading="lazy"
          />
        ) : (
          <span aria-hidden="true">🧭</span>
        )}
      </div>
      <div className="roadbook-library-card__content">
        <h3 className="roadbook-library-card__title">{roadbook.title}</h3>
        <p className="roadbook-library-card__meta">{metaParts.join(" · ")}</p>
        {roadbook.description && (
          <p className="roadbook-library-card__description">
            {roadbook.description.length > 150 ? `${roadbook.description.slice(0, 150)}…` : roadbook.description}
          </p>
        )}
        <div className="roadbook-library-card__actions">
          <Link href={`/roadbooks/${roadbook.slug}`} className="terrain-button terrain-button--secondary studio-action-button--compact">
            Consulter
          </Link>
          <Link href={`/dashboard/roadbooks/${roadbook.id}`} className="terrain-button terrain-button--secondary studio-action-button--compact">
            Modifier dans le Studio
          </Link>
        </div>
      </div>
    </article>
  );
}
