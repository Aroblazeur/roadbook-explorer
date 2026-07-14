"use client";

import StudioCatalog from "@/components/studio/StudioCatalog";
import StudioShell from "@/components/studio/StudioShell";

export default function RoadbooksPage() {
  return (
    <StudioShell>
      <StudioCatalog />
      <section className="card studio-panel" aria-labelledby="studio-detail-title">
        <div className="studio-panel__header">
          <div>
            <p className="studio-eyebrow">Éditeur</p>
            <h2 id="studio-detail-title">Sélectionne un roadbook</h2>
          </div>
          <div className="studio-actions">
            <button type="button" disabled>Enregistrer les modifications</button>
            <button type="button" disabled>Ajouter une étape</button>
            <button type="button" disabled>Rendre public</button>
          </div>
        </div>
        <div className="studio-detail studio-detail--empty">
          <p>Sélectionnez un roadbook ou créez-en un nouveau pour commencer.</p>
        </div>
      </section>
    </StudioShell>
  );
}
