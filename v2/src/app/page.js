import CatalogHeader from "@/components/CatalogHeader";
import { getPublicRoadbooks } from "@/lib/getPublicRoadbooks";
import Link from "next/link";

export const metadata = {
  title: "RoadBook Explorer",
  description: "Catalogue des roadbooks publics",
};

function resolveProjectGroup(rb) {
  const value = rb.projectStatus || rb.project || "";
  const n = String(value).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["done", "deja fait", "deja faits", "deja-fait", "fait", "termine", "voyage realise", "voyage-realise", "realise", "realized"].includes(n)) return "done";
  if (["todo", "a faire", "a-faire", "planned", "en projet", "en-projet", "projet"].includes(n)) return "todo";
  return "other";
}

function groupRoadbooks(roadbooks) {
  const groups = [
    { key: "todo", title: "En projet", items: [] },
    { key: "done", title: "Voyage réalisé", items: [] },
    { key: "other", title: "Autres roadbooks", items: [] },
  ];
  const byKey = new Map(groups.map(g => [g.key, g]));
  for (const rb of roadbooks) {
    const key = resolveProjectGroup(rb);
    byKey.get(key).items.push(rb);
  }
  return groups.filter(g => g.items.length > 0);
}

export default async function HomePage() {
  const roadbooks = await getPublicRoadbooks();
  const groups = groupRoadbooks(roadbooks);

  return (
    <>
      <CatalogHeader />
      <main className="container">
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
                {group.items.map(rb => (
                  <RoadbookCard key={rb.id} rb={rb} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}

function RoadbookCard({ rb }) {
  const metaParts = [rb.activity, rb.destination, rb.distance_km != null && `${rb.distance_km} km`, rb.stage_count > 0 && `${rb.stage_count} étapes`].filter(Boolean);

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
        {metaParts.length > 0 && (
          <p className="roadbook-library-card__meta">{metaParts.join(" · ")}</p>
        )}
        {rb.description && (
          <p className="roadbook-library-card__description">
            {rb.description.length > 150 ? rb.description.slice(0, 150) + "…" : rb.description}
          </p>
        )}
      </div>
    </Link>
  );
}
