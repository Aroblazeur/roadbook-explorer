"use client";

export default function AutomationPanel({
  automationResult,
  automationBusy,
  handleRecalculateTotals,
  handleAnalyzeStageGpx,
  handleAutoEnrich,
}) {
  return (
    <div className="studio-card">
      <div className="studio-card__header">
        <h3>Automatisations</h3>
      </div>
      <div className="studio-card__body">
        {automationResult && <div className="studio-automation-result">{automationResult}</div>}
        <div className="studio-automation-actions">
          <button type="button" onClick={handleRecalculateTotals} disabled={!!automationBusy} className="terrain-button--secondary studio-action-button--compact">
            {automationBusy === "totals" ? "Calcul..." : "Recalculer les totaux"}
          </button>
          <button type="button" onClick={handleAnalyzeStageGpx} disabled={!!automationBusy} className="terrain-button--secondary studio-action-button--compact">
            {automationBusy === "gpx" ? "Analyse..." : "Analyser GPX"}
          </button>
          <button type="button" onClick={handleAutoEnrich} disabled={!!automationBusy} className="terrain-button--secondary studio-action-button--compact">
            {automationBusy === "enrich" ? "..." : "Enrichir POI/hébergements"}
          </button>
        </div>
      </div>
    </div>
  );
}
