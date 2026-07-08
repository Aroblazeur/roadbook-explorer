"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";

export default function DashboardPage() {
  const { user, loading, supabase } = useAuth();

  if (loading) return <main><p>Chargement…</p></main>;

  if (!user) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p>Vous devez être connecté pour accéder au tableau de bord.</p>
        <p><Link href="/login">Se connecter</Link></p>
        <p><Link href="/">Retour à l&apos;accueil</Link></p>
      </main>
    );
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Connecté en tant que : <strong>{user.email}</strong></p>
      <p>ID utilisateur : <code>{user.id}</code></p>
      <nav>
        <Link href="/explore">Explorer</Link>
        {" | "}
        <Link href="/dashboard/roadbooks">Mes roadbooks</Link>
      </nav>
      <button type="button" onClick={handleLogout}>
        Se déconnecter
      </button>
      <p><Link href="/">Retour à l&apos;accueil</Link></p>
    </main>
  );
}
