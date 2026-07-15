"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { duplicateRoadbook } from "@/lib/roadbooks/writers";

function groupBy(items, key) {
  return (items ?? []).reduce((groups, item) => {
    const value = item[key];
    if (!groups[value]) groups[value] = [];
    groups[value].push(item);
    return groups;
  }, {});
}

export default function DuplicateRoadbookButton({ roadbook, stages, pois, variants, startPoint }) {
  const { user, supabase } = useAuth();
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState(null);

  async function duplicate() {
    if (!user || duplicating) return;
    if (!window.confirm("Dupliquer ce roadbook comme modèle ? Les fichiers téléversés (images et GPX) ne seront pas copiés.")) return;
    setDuplicating(true);
    setError(null);
    try {
      const poisByStage = groupBy((pois ?? []).filter(poi => poi.variant_id == null), "stage_id");
      const poisByVariant = groupBy((pois ?? []).filter(poi => poi.variant_id != null), "variant_id");
      const variantsByStage = groupBy(variants, "stage_id");
      const newId = await duplicateRoadbook(
        supabase, roadbook, stages, poisByStage, variantsByStage,
        `${roadbook.slug}-copie-${Date.now()}`, user.id, poisByVariant, startPoint,
      );
      router.push(`/dashboard/roadbooks/${newId}`);
    } catch (caught) {
      setError(caught?.message ?? String(caught));
      setDuplicating(false);
    }
  }

  return (
    <span className="roadbook-duplicate-action">
      <button type="button" className="header-nav__button" onClick={duplicate} disabled={duplicating}>
        {duplicating ? "Duplication…" : "Dupliquer comme modèle"}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
