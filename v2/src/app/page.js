import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Roadbook Explorer V2</h1>
        <p>
          Roadbook Explorer nouvelle génération — Next.js + Supabase.
        </p>
        <div className={styles.ctas}>
          <a className={styles.primary} href="/login">
            Connexion
          </a>
          <a className={styles.secondary} href="/dashboard">
            Dashboard
          </a>
        </div>
      </main>
    </div>
  );
}
