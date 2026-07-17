"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  insertPoi,
  updateStageAccommodation,
  updateStageNotes,
  updateVariantAccommodation,
  updateVariantNotes,
} from "@/lib/roadbooks/writers";
import {
  buildQuickAccommodationUpdate,
  buildQuickNoteUpdate,
  buildQuickPoiRecord,
} from "@/lib/roadbooks/quick-add";

const CONFIG = {
  note: { label: "Ajouter une note", success: "Note ajoutée." },
  poi: { label: "Ajouter un point d’intérêt", success: "Point d’intérêt ajouté." },
  accommodation: { label: "Ajouter un hébergement alternatif", success: "Hébergement alternatif ajouté." },
};

const EMPTY_VALUES = {
  note: { text: "" },
  poi: { name: "", region: "", link: "", description: "" },
  accommodation: { name: "", type: "", url: "", note: "" },
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function QuickAddEditor({ kind, stageId, variantId = null }) {
  const config = CONFIG[kind];
  const formId = useId();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => ({ ...EMPTY_VALUES[kind] }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const updateValue = (field, value) => setValues(current => ({ ...current, [field]: value }));
  const close = () => {
    setOpen(false);
    setError("");
    setValues({ ...EMPTY_VALUES[kind] });
  };

  const loadTarget = async (columns) => {
    const table = variantId == null ? "stages" : "stage_variants";
    const targetId = variantId == null ? stageId : variantId;
    const { data, error: loadError } = await supabase
      .from(table)
      .select(columns)
      .eq("id", Number(targetId))
      .single();
    if (loadError) throw new Error(loadError.message);
    return data;
  };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (kind === "note") {
        const entity = await loadTarget("notes");
        const update = buildQuickNoteUpdate(entity, values.text);
        if (variantId == null) await updateStageNotes(supabase, stageId, update.notes);
        else await updateVariantNotes(supabase, variantId, update.notes);
      } else if (kind === "poi") {
        await insertPoi(supabase, buildQuickPoiRecord(stageId, variantId, values));
      } else {
        const entity = await loadTarget("alternatives");
        const update = buildQuickAccommodationUpdate(entity, values);
        if (variantId == null) await updateStageAccommodation(supabase, stageId, update);
        else await updateVariantAccommodation(supabase, variantId, update);
      }
      close();
      setMessage(config.success);
      router.refresh();
    } catch (submitError) {
      setError(submitError?.message ?? "L’enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quick-add">
      <button
        type="button"
        className="quick-add__toggle"
        aria-label={config.label}
        title={config.label}
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => {
          setOpen(current => !current);
          setError("");
          setMessage("");
        }}
      >
        <PlusIcon />
      </button>
      {open && (
        <form id={formId} className="quick-add__form" onSubmit={submit}>
          <strong>{config.label}</strong>
          {kind === "note" && (
            <label>Texte<textarea value={values.text} onChange={event => updateValue("text", event.target.value)} required autoFocus /></label>
          )}
          {kind === "poi" && (
            <>
              <label>Nom<input value={values.name} onChange={event => updateValue("name", event.target.value)} required autoFocus /></label>
              <label>Ville ou région<input value={values.region} onChange={event => updateValue("region", event.target.value)} /></label>
              <label>Lien<input type="url" value={values.link} onChange={event => updateValue("link", event.target.value)} /></label>
              <label>Description<textarea value={values.description} onChange={event => updateValue("description", event.target.value)} /></label>
            </>
          )}
          {kind === "accommodation" && (
            <>
              <label>Nom<input value={values.name} onChange={event => updateValue("name", event.target.value)} required autoFocus /></label>
              <label>Type<input value={values.type} onChange={event => updateValue("type", event.target.value)} placeholder="Camping, gîte, hôtel…" /></label>
              <label>Lien<input type="url" value={values.url} onChange={event => updateValue("url", event.target.value)} /></label>
              <label>Note<textarea value={values.note} onChange={event => updateValue("note", event.target.value)} /></label>
            </>
          )}
          {error && <p className="quick-add__feedback quick-add__feedback--error" role="alert">{error}</p>}
          <div className="quick-add__actions">
            <button type="submit" className="stage-detail-button" disabled={saving}>{saving ? "Enregistrement…" : "Ajouter"}</button>
            <button type="button" className="stage-detail-button stage-detail-button--secondary" onClick={close} disabled={saving}>Annuler</button>
          </div>
        </form>
      )}
      {message && <span className="quick-add__feedback" role="status">{message}</span>}
    </div>
  );
}
