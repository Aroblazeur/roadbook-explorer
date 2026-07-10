"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CatalogHeader() {
  const { user, supabase } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="header">
      <div className="container">
        <div className="header-title-wrapper">
          <svg className="header-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 48" aria-hidden="true" focusable="false">
            <circle cx="28" cy="36" r="10" fill="none" stroke="white" strokeWidth="2.5"/>
            <circle cx="28" cy="36" r="2.5" fill="white"/>
            <circle cx="60" cy="36" r="10" fill="none" stroke="white" strokeWidth="2.5"/>
            <circle cx="60" cy="36" r="2.5" fill="white"/>
            <line x1="28" y1="36" x2="44" y2="16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="44" y1="16" x2="60" y2="36" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="44" y1="16" x2="44" y2="36" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="28" y1="36" x2="44" y2="36" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="60" y1="36" x2="62" y2="20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="58" y1="20" x2="66" y2="20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="44" y1="16" x2="48" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <line x1="45" y1="14" x2="52" y2="14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="28" y1="36" x2="10" y2="36" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round"/>
            <rect x="2" y="27" width="18" height="11" rx="2" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2"/>
            <circle cx="11" cy="38" r="5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2"/>
            <circle cx="11" cy="38" r="1.5" fill="rgba(255,255,255,0.85)"/>
            <polyline points="68,26 78,10 88,26" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinejoin="round"/>
            <polyline points="82,26 90,14 98,26" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          <h1>RoadBook Explorer</h1>
          <svg className="header-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 48" aria-hidden="true" focusable="false">
            <polyline points="4,38 22,14 38,38" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
            <polyline points="30,38 52,10 76,38" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" strokeLinejoin="round"/>
            <path d="M50 38 L66 20 L82 38 Z" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
            <path d="M66 20 L66 38" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2"/>
            <path d="M8 42 C26 38, 42 44, 60 40 C72 37, 84 39, 94 35" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="86" cy="10" r="2" fill="white"/>
          </svg>
        </div>
        <nav className="header-nav">
          {user ? (
            <>
              <span className="header-nav__email">{user.email}</span>
              <Link href="/dashboard/roadbooks">Mes roadbooks</Link>
              <button onClick={handleLogout}>Déconnexion</button>
            </>
          ) : (
            <Link href="/login">Connexion</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
