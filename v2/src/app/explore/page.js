import CatalogHeader from "@/components/CatalogHeader";
import { getPublicRoadbooks } from "@/lib/getPublicRoadbooks";
import Link from "next/link";

export const metadata = {
  title: "Roadbooks publics — RoadBook Explorer",
  description: "Catalogue des roadbooks publics",
};

function resolveProjectGroup(rb) {
  const value = rb.projectStatus || rb.project || "";
  const normalized = String(value).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["done", "deja fait", "deja faits", "deja-fait", "fait", "termine", "voyage realise", "voyage-realise", "realise", "realized"].includes(normalized)) return "done";
  if (["todo", "a faire", "a-faire", "planned", "en projet", "en-projet", "projet"].includes(normalized)) return "todo";
  return "other";
}

function groupRoadbooks(roadbooks) {
  const groups = [
    { key: "todo", title: "En projet", items: [] },
    { key: "done", title: "Voyage réalisé", items: [] },
    { key: "other", title: "Autres roadbooks", items: [] },
  ];
  const byKey = new Map(groups.map(group => [group.key, group]));
  for (const roadbook of roadbooks) {
    byKey.get(resolveProjectGroup(roadbook)).items.push(roadbook);
  }
  return groups.filter(group => group.items.length > 0);
}

export default async function ExplorePage() {
  const roadbooks = await getPublicRoadbooks();
  const groups = groupRoadbooks(roadbooks);

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
          {groups.map(group => (
            <section key={group.key} className="roadbook-library-group" aria-labelledby={`rlg-${group.key}`}>
              <h3 id={`rlg-${group.key}`} className="roadbook-library-group__title">{group.title}</h3>
              <div className="roadbook-library-group__items">
                {group.items.map(roadbook => (
                  <RoadbookCard key={roadbook.id} roadbook={roadbook} />
                ))}
              </div>
            </section>
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
          <span aria-hidden="true">🧭</span>
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
