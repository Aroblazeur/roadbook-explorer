"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const { user, loading, supabase } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading]);

  if (loading) return <main><p>Chargement…</p></main>;

  if (!user) return null;

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
