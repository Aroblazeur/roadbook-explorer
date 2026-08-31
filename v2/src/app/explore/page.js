import CatalogHeader from "@/components/CatalogHeader";
import { getPublicRoadbooks } from "@/lib/getPublicRoadbooks";
import Link from "next/link";

export const metadata = {
  title: "Roadbooks publics — RoadBook Explorer",
  description: "Catalogue des roadbooks publics",
};

export default async function ExplorePage() {
  const roadbooks = await getPublicRoadbooks();

  return (
    <>
      <CatalogHeader />
      <main className="container">
        <div className="catalog-page-heading">
          <p className="home-access-eyebrow">Explorer</p>
          <h2>Roadbooks publics</h2>
        </div>
        {roadbooks.length === 0 && (
          <section className="card">
            <p className="empty">Aucun roadbook public pour le moment.</p>
          </section>
        )}
        <div className="roadbook-library-grid">
          {roadbooks.map(roadbook => (
            <RoadbookCard key={roadbook.id} roadbook={roadbook} />
          ))}
        </div>
      </main>
    </>
  );
}

function RoadbookCard({ roadbook }) {
  const metaParts = [
    roadbook.activity,
    roadbook.destination,
    roadbook.distance_km != null && `${roadbook.distance_km} km`,
    roadbook.stage_count > 0 && `${roadbook.stage_count} étapes`,
  ].filter(Boolean);

  return (
    <Link href={`/roadbooks/${roadbook.slug}`} className="roadbook-library-card">
      <div className={roadbook.coverSignedUrl ? "roadbook-library-card__cover" : "roadbook-library-card__cover roadbook-library-card__cover--placeholder"}>
        {roadbook.coverSignedUrl ? (
          <img
            src={roadbook.coverSignedUrl}
            alt={`Couverture ${roadbook.title}`}
            className="roadbook-library-card__cover-image"
            loading="lazy"
          />
        ) : (
          <span>
            <span aria-hidden="true">🧭</span>
            {roadbook.coverMediaAccess?.status === "inaccessible" && " Image indisponible"}
          </span>
        )}
      </div>
      <div className="roadbook-library-card__content">
        <h3 className="roadbook-library-card__title">{roadbook.title}</h3>
        {metaParts.length > 0 && (
          <p className="roadbook-library-card__meta">{metaParts.join(" · ")}</p>
        )}
        {roadbook.description && (
          <p className="roadbook-library-card__description">
            {roadbook.description.length > 150 ? `${roadbook.description.slice(0, 150)}…` : roadbook.description}
          </p>
        )}
      </div>
    </Link>
  );
}
