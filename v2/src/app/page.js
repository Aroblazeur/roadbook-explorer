import CatalogHeader from "@/components/CatalogHeader";
import Link from "next/link";

export const metadata = {
  title: "RoadBook Explorer",
  description: "Consulter et créer des roadbooks de voyage",
};

export default function HomePage() {
  return (
    <>
      <CatalogHeader />
      <main className="container home-access-main">
        <section className="card home-access-section" aria-labelledby="home-access-title">
          <div className="home-access-heading">
            <p className="home-access-eyebrow">Bienvenue</p>
            <h2 id="home-access-title">Choisissez votre espace</h2>
            <p>Consultez vos itinéraires, découvrez les roadbooks partagés ou ouvrez le Studio.</p>
          </div>

          <div className="home-access-grid">
            <Link href="/dashboard/roadbooks" className="home-access-card">
              <span className="home-access-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
                  <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
                  <path d="M9 7h6M9 10h4" />
                </svg>
              </span>
              <span className="home-access-card__content">
                <strong>Nos roadbooks</strong>
                <span>Retrouvez la liste de vos roadbooks et choisissez celui à consulter.</span>
              </span>
              <span className="home-access-card__arrow" aria-hidden="true">→</span>
            </Link>

            <Link href="/explore" className="home-access-card">
              <span className="home-access-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" />
                </svg>
              </span>
              <span className="home-access-card__content">
                <strong>Roadbooks publics</strong>
                <span>Explorez les itinéraires rendus publics par la communauté.</span>
              </span>
              <span className="home-access-card__arrow" aria-hidden="true">→</span>
            </Link>

            <Link href="/dashboard" className="home-access-card">
              <span className="home-access-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m14.7 6.3 3 3" />
                  <path d="m4 20 4.2-1 9.9-9.9a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
                  <path d="M13 20h7" />
                </svg>
              </span>
              <span className="home-access-card__content">
                <strong>Studio</strong>
                <span>Créez, enrichissez et mettez à jour vos roadbooks.</span>
              </span>
              <span className="home-access-card__arrow" aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
