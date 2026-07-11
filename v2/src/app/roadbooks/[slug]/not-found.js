import Link from "next/link";

export default function RoadbookNotFound() {
  return (
    <main className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
      <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1>Roadbook introuvable</h1>
        <p>Ce roadbook n&apos;existe pas ou n&apos;est pas accessible.</p>
        <p style={{ marginTop: "1.5rem" }}>
          <Link href="/">Retour à l&apos;accueil</Link>
        </p>
      </div>
    </main>
  );
}
