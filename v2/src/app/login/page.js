"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { sanitizeNextPath } from "@/lib/sanitize-next";

function LoginForm() {
  const { user, supabase } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  if (user) {
    router.push(next);
    return null;
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      router.push(next);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
    } else {
      setMessage("Inscription réussie. Vérifiez votre email si la confirmation est requise.");
    }
  }

  return (
    <main>
      <h1>Connexion</h1>

      <form onSubmit={handleLogin}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p style={{ color: "red" }}>{error}</p>}
        {message && <p style={{ color: "green" }}>{message}</p>}

        <button type="submit">Se connecter</button>
        <button type="button" onClick={handleSignUp}>
          Créer un compte
        </button>
      </form>

      <p>
        <a href="/">Retour à l&apos;accueil</a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
