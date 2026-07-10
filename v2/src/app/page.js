import CatalogHeader from "@/components/CatalogHeader";
import { getPublicRoadbooks } from "@/lib/getPublicRoadbooks";
import Link from "next/link";

export const metadata = {
  title: "RoadBook Explorer",
  description: "Catalogue des roadbooks publics",
};

export default async function HomePage() {
  const roadbooks = await getPublicRoadbooks();

  return (
    <>
      <CatalogHeader />
      <main className="container">
        <section className="card">
          <h2>Tous les roadbooks</h2>
          {roadbooks.length === 0 && <p className="empty">Aucun roadbook public pour le moment.</p>}
          <div className="roadbook-library-grid">
            {roadbooks.map(rb => (
              <RoadbookCard key={rb.id} rb={rb} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function RoadbookCard({ rb }) {
  return (
    <Link href={`/roadbooks/${rb.slug}`} className="roadbook-library-card">
      <div className={rb.coverSignedUrl ? "roadbook-library-card__cover" : "roadbook-library-card__cover roadbook-library-card__cover--placeholder"}>
        {rb.coverSignedUrl ? (
          <img
            src={rb.coverSignedUrl}
            alt={`Couverture ${rb.title}`}
            className="roadbook-library-card__cover-image"
            loading="lazy"
          />
        ) : (
          <span aria-hidden="true">🧭</span>
        )}
      </div>
      <div className="roadbook-library-card__content">
        <h3 className="roadbook-library-card__title">{rb.title}</h3>
        <p className="roadbook-library-card__meta">
          {[rb.distance_km != null && `${rb.distance_km} km`, rb.stage_count > 0 && `${rb.stage_count} étapes`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {rb.description && (
          <p className="roadbook-library-card__description">
            {rb.description.length > 150 ? rb.description.slice(0, 150) + "…" : rb.description}
          </p>
        )}
      </div>
    </Link>
  );
}
