const STATUS_LABELS = {
  idle: "",
  unsaved: "Modifications non enregistrées",
  saving: "Enregistrement local…",
  saved: "Enregistré localement",
  synced: "Synchronisé",
  error: "Erreur de sauvegarde locale",
  conflict: "Conflit détecté",
};

const STATUS_COLORS = {
  idle: "inherit",
  unsaved: "#e67e22",
  saving: "#3498db",
  saved: "#27ae60",
  synced: "#27ae60",
  error: "#e74c3c",
  conflict: "#e74c3c",
};

export default function DraftStatus({ status, error, restoredInfo, onResetInfo, onDismissConflict, onClearDraft }) {
  if (status === "idle" && !restoredInfo) return null;

  return (
    <div style={{ fontSize: "0.85rem", padding: "4px 0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      {restoredInfo && (
        <span style={{ color: "#e67e22" }}>
          {restoredInfo.message}
          <button type="button" onClick={onResetInfo} style={{ marginLeft: 8, cursor: "pointer", background: "none", border: "1px solid #e67e22", borderRadius: 4, padding: "2px 8px", fontSize: "0.8rem" }}>
            OK
          </button>
        </span>
      )}

      {status !== "idle" && (
        <span style={{ color: STATUS_COLORS[status] }}>
          {STATUS_LABELS[status]}
          {status === "saving" && <SavingDots />}
        </span>
      )}

      {error && status === "error" && (
        <span style={{ color: "#e74c3c", fontSize: "0.8rem" }}>{error}</span>
      )}

      {status === "conflict" && (
        <>
          <span style={{ color: "#e74c3c", fontSize: "0.8rem" }}>{error}</span>
          {onDismissConflict && (
            <button type="button" onClick={onDismissConflict} style={{ cursor: "pointer", background: "none", border: "1px solid #e74c3c", borderRadius: 4, padding: "2px 8px", fontSize: "0.8rem" }}>
              Conserver ma version
            </button>
          )}
          <button type="button" onClick={() => window.location.reload()} style={{ cursor: "pointer", background: "none", border: "1px solid #3498db", borderRadius: 4, padding: "2px 8px", fontSize: "0.8rem" }}>
            Recharger
          </button>
        </>
      )}

      {status === "saved" && onClearDraft && (
        <button type="button" onClick={onClearDraft} style={{ cursor: "pointer", background: "none", border: "1px solid #999", borderRadius: 4, padding: "2px 8px", fontSize: "0.8rem", marginLeft: 8 }}>
          Ignorer le brouillon
        </button>
      )}
    </div>
  );
}

function SavingDots() {
  return (
    <span style={{ display: "inline-flex", marginLeft: 4 }}>
      <span style={{ animation: "dotPulse 1.4s infinite", animationDelay: "0s" }}>.</span>
      <span style={{ animation: "dotPulse 1.4s infinite", animationDelay: "0.2s" }}>.</span>
      <span style={{ animation: "dotPulse 1.4s infinite", animationDelay: "0.4s" }}>.</span>
      <style>{`@keyframes dotPulse { 0%, 80%, 100% { opacity: 0; } 40% { opacity: 1; } }`}</style>
    </span>
  );
}
