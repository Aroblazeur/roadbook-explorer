# Studio — Plan de refactorisation

Feuille de route opérationnelle issue de l'audit Sprint 20A.

---

## Architecture cible

```text
page.js (< 400 lignes)
  ├── hooks/studio/*      (8-10 hooks spécialisés)
  ├── components/studio/* (12-15 composants)
  └── lib/roadbooks/*     (fonctions pures + data layer)
```

### Règles strictes

- Aucun changement visuel ou fonctionnel
- Petits commits (un extrait = un commit)
- Tests après chaque extraction
- Pas de réécriture totale
- Pas de nouveau framework d'état sans nécessité

---

## Ordre des extractions

### Sprint 20B — Fonctions pures et mappers

**Objectif** : Extraire les transformations, validations, calculs hors de `page.js`.

| Fichier à créer | Contenu | Risque |
|-----------------|---------|--------|
| `src/lib/roadbooks/validators.js` | `validateGpx()`, `normalizeNumber()`, `validateStageDayNumber()` | Faible |
| `src/lib/roadbooks/mutations.js` | `buildOfficialMeta()`, `buildStagesTotalMeta()`, `calculateTotals(stages)`, `buildDuplicatePayload()` | Faible |

**Critères** : Toutes les fonctions extraites sont pures et testées (0 mocking nécessaire). `page.js` inchangé.

---

### Sprint 20C — Couche données Supabase

**Objectif** : Centraliser tous les appels Supabase.

| Fichier à créer | Contenu | Risque |
|-----------------|---------|--------|
| `src/lib/roadbooks/loaders.js` | `loadRoadbook()`, `loadStages()`, `loadPois()`, `loadVariants()`, `loadMedia()`, `loadGpxRows()`, `getSignedUrl()` | Moyen |
| `src/lib/roadbooks/writers.js` | `saveStage()`, `savePoi()`, `saveVariant()`, `deleteStage()`, `deletePoi()`, `deleteVariant()`, `saveMedia()`, `deleteMedia()`, `saveGpx()`, `deleteGpx()`, `duplicateRoadbook()` | Moyen |
| `src/lib/roadbooks/enrich.js` | `applyPoiEnrichment()`, `applyAccommodationEnrichment()`, `applyBatchEnrichment()` | Moyen |

**Critères** : `page.js` n'appelle plus `supabase` directement. Pattern de reload stages/pois/variants centralisé.

---

### Sprint 20D — Hooks de domaine

**Objectif** : Extraire l'état et la logique dans des hooks spécialisés.

| Fichier à créer | Fonction | Risque |
|-----------------|----------|--------|
| `src/hooks/studio/useRoadbookData.js` | Chargement roadbook + stages + POI + variantes | Élevé |
| `src/hooks/studio/useStageCrud.js` | CRUD stages + POI + variantes (reducer-based) | Élevé |
| `src/hooks/studio/useMediaManager.js` | Chargement + upload + suppression images | Moyen |
| `src/hooks/studio/useGpxManager.js` | Chargement + upload + suppression GPX | Moyen |
| `src/hooks/studio/useCoverManager.js` | Cover URL/media | Faible |
| `src/hooks/studio/useEnrichment.js` | Index + enrich POI/hébergement | Moyen |
| `src/hooks/studio/useNotifications.js` | Gestion centralisée erreur/succès | Faible |
| `src/hooks/studio/useSaveWithLock.js` | Lock + conditionalUpdate + verify | Moyen |

**Critères** : Les 17 `useState` du formulaire d'étape remplacés par un reducer. Les 11 booléens de chargement remplacés par un état structuré. 74 `useState` → < 20.

---

### Sprint 20E — Composants UI

**Objectif** : Extraire le JSX en composants.

| Fichier à créer | Remplace | Risque |
|-----------------|----------|--------|
| `src/components/studio/GeneralInfoForm.js` | Carte 1 (infos générales) | Faible |
| `src/components/studio/RouteForm.js` | Cartes 3 + 4 (itinéraire + tracé) | Faible |
| `src/components/studio/CoverSection.js` | Partie cover de la carte 2 | Faible |
| `src/components/studio/MediaSection.js` | Carte 5 (médias) | Faible |
| `src/components/studio/GpxSection.js` | Carte 6 (GPX) | Faible |
| `src/components/studio/AutomationPanel.js` | Carte 7 (automatisations) | Faible |
| `src/components/studio/StageForm.js` | Formulaire nouvelle étape | Faible |
| `src/components/studio/StageCard.js` | Carte étape expandable | Faible |
| `src/components/studio/PoiForm.js` | Formulaire POI | Faible |
| `src/components/studio/VariantForm.js` | Formulaire variante | Faible |
| `src/components/studio/AccommSection.js` | Zone hébergement | Faible |
| `src/components/studio/NoteForm.js` | Zone notes | Faible |

**Critères** : `page.js` ne contient que des imports de composants et une orchestration minimale. Aucun JSX inline de plus de 20 lignes.

---

### Sprint 20F — Réduction de `page.js`

**Objectif** : Dernière passe de nettoyage.

| Action | Risque |
|--------|--------|
| Remplacer les 4 `useEffect` par des hooks dédiés | Faible |
| Supprimer les imports devenus inutiles | Faible |
| Vérifier que `page.js` < 400 lignes | Faible |
| Nettoyer les commentaires de sections devenus obsolètes | Faible |

**Critères** : `page.js` < 400 lignes, < 5 `useState`, 0 appel Supabase direct, 0 handler métier majeur.

---

## Fichiers à réduire

| Fichier | Lignes actuelles | Objectif | Sprint |
|---------|:----------------:|:--------:|:------:|
| `src/app/dashboard/roadbooks/[id]/page.js` | 1783 | < 400 | 20F |
| `src/hooks/useStudioDraft.js` | 306 | < 200 | 20D (réduction interface) |

## Fichiers à créer

| Fichier | Sprint |
|---------|--------|
| `src/lib/roadbooks/validators.js` | 20B |
| `src/lib/roadbooks/mutations.js` | 20B |
| `src/lib/roadbooks/loaders.js` | 20C |
| `src/lib/roadbooks/writers.js` | 20C |
| `src/lib/roadbooks/enrich.js` | 20C |
| `src/hooks/studio/useRoadbookData.js` | 20D |
| `src/hooks/studio/useStageCrud.js` | 20D |
| `src/hooks/studio/useMediaManager.js` | 20D |
| `src/hooks/studio/useGpxManager.js` | 20D |
| `src/hooks/studio/useCoverManager.js` | 20D |
| `src/hooks/studio/useEnrichment.js` | 20D |
| `src/hooks/studio/useNotifications.js` | 20D |
| `src/hooks/studio/useSaveWithLock.js` | 20D |
| 12-15 composants dans `src/components/studio/` | 20E |

## Fichiers à conserver inchangés

- `src/lib/studio-drafts.js` — bien structuré
- `src/lib/sync-helpers.js` — bien isolé
- `src/lib/gpx-metrics.js` — fonctions pures, testées
- `src/lib/enrichment.js` — bien conçu
- `src/components/DraftStatus.js` — composant simple, stable
- `src/lib/auth-context.js` — stable

## Dépendances entre sprints

```text
20B (fonctions pures) ──→ 20C (couche data) ──→ 20D (hooks) ──→ 20E (composants) ──→ 20F (finalisation)
                                                                                          │
                                                                                          ▼
                                                                                    page.js < 400 L
```

## Tests de validation

Chaque sprint doit passer avant de commencer le suivant :

```bash
node scripts/test-sprint-18d.mjs     # 35/35
node scripts/verify-migration-18c.mjs # 10/10
npm run build                         # 0 erreur
```

### Tests manuels additionnels

| Sprint | Tests |
|--------|-------|
| 20C | Charger Studio, éditer un champ, sauvegarder, F5 |
| 20D | Changer de roadbook,éditer, F5, vérifier brouillon |
| 20E | Responsive, upload image, GPX |
| 20F | Session complète : tout le workflow utilisateur |
