import styles from "./page.module.css";
import Link from "next/link";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Roadbook Explorer V2</h1>
        <p>
          Roadbook Explorer nouvelle génération — Next.js + Supabase.
        </p>
        <div className={styles.ctas}>
          <Link className={styles.primary} href="/explore">
            Explorer
          </Link>
          <Link className={styles.secondary} href="/login">
            Connexion
          </Link>
          <Link className={styles.secondary} href="/dashboard">
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
