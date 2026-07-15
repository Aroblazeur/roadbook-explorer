"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "./supabase";

const AuthContext = createContext(null);

function keepStableUser(previousUser, nextUser) {
  if (!previousUser && !nextUser) return previousUser;
  if (!previousUser || !nextUser) return nextUser;

  const isSameUserState =
    previousUser.id === nextUser.id &&
    previousUser.email === nextUser.email &&
    previousUser.updated_at === nextUser.updated_at &&
    previousUser.app_metadata?.role === nextUser.app_metadata?.role;

  return isSameUserState ? previousUser : nextUser;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(createClient);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((currentUser) => keepStableUser(currentUser, session?.user ?? null));
      setLoading(false);
    });

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser((currentUser) => keepStableUser(currentUser, user ?? null));
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, loading, supabase }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
