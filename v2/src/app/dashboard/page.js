"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DashboardPage() {
  const { user, supabase } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Connecté en tant que : <strong>{user?.email}</strong></p>
      <nav>
        <Link href="/explore">Explorer</Link>
        {" | "}
        <Link href="/my-roadbooks">Mes roadbooks</Link>
        {" | "}
        <Link href="/dashboard/roadbooks">Gérer mes roadbooks dans le Studio</Link>
      </nav>
      <button type="button" onClick={handleLogout}>
        Se déconnecter
      </button>
      <p><Link href="/">Retour à l&apos;accueil</Link></p>
    </main>
  );
}
