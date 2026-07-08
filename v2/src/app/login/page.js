"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, supabase } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  if (user) {
    router.push("/dashboard");
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
      router.push("/dashboard");
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
