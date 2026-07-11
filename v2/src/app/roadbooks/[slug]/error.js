"use client";

import Link from "next/link";

export default function RoadbookError({ error, reset }) {
  return (
    <main className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
      <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1>Erreur technique</h1>
        <p>Impossible de charger ce roadbook pour le moment.</p>
        {process.env.NODE_ENV === "development" && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-light)", marginTop: "0.75rem" }}>
            {error.message}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <button onClick={reset} style={{ display: "inline-flex", padding: "0.6rem 1.2rem", borderRadius: 8 }}>
            Réessayer
          </button>
          <Link href="/" className="terrain-button terrain-button--secondary" style={{ display: "inline-flex", padding: "0.6rem 1.2rem", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>
            Accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
