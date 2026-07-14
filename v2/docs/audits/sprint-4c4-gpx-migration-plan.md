# Sprint 4C4 — Plan de migration GPX

Date : 14/07/2026
Commit : 615a64965dbb8c661b230d1e6cca2f8fe58cb501
Base : Supabase production (wuberwxheznzntdyqwyj)
Outil : `scripts/plan-gpx-migration.mjs`
Tests : `scripts/test-sprint-4c4.mjs` (108 tests, 0 échecs)

---

## Objectif

Construire un plan de migration **dry-run** (lecture seule) pour les 19 médias GPX legacy-compatibles identifiés dans le sprint 4C3. Le plan propose des opérations `UPDATE` canoniques — scope + rôle normalisés, `stage_id` corrigé — sans effectuer aucune écriture.

## Règles

1. **Lecture seule** — aucune requête `.insert()`, `.update()`, `.upsert()`, `.delete()`, `.remove()`, `.move()`.
2. **media.id=41 exclu** — le variant ambigu (`legacy-variant-target-is-incomplete`) n'est pas inclus dans les opérations.
3. **Pas de flag applicatif** — `--apply`, `--write`, `--execute`, `--migrate`, `--fix`, `--update`, `--commit` sont rejetés avec code 2.
4. **Ordre déterministe** — `roadbookId` → `scope` → `stageId` → `variantId` → `role` → `mediaId`.
5. **Préconditions** — chaque opération documente `expectedMediaId`, `expectedRoadbookId`, `expectedStageId`, `expectedCurrentRole`, `expectedUpdatedAt`.
6. **Snapshots réversibles** — chaque opération inclut son `reversibleSnapshot` (`stage_id`, `metadata`, `updated_at`).

## Architecture

```
┌─────────────────────┐
│  loadGpxMigration-  │  7.1 Load — Supabase read-only
│  PlanningData()     │
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  buildGpxMigration- │  7.2 Build — Pure function
│  Plan(input)        │
│                     │
│  classifyGpxMedia() │
│  buildGpxBusiness-  │
│  Identity()         │
│  selectUnique-      │
│  GpxMedia()         │
│  buildCanonical-    │
│  GpxMediaInput()    │
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  validateGpx-       │  14. Validate — Pure function
│  MigrationPlan()    │
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  formatGpxMigration-│  7.3 Format — JSON / Markdown
│  PlanJson() /       │
│  PlanMarkdown()     │
└─────────────────────┘
```

## Flux d'exclusion

| Étape | Condition | Raison | Revue |
|-------|-----------|--------|-------|
| 1 | `status === "canonical"` | — | — |
| 2 | `status === "ambiguous"` | `classification.reason` | `manual` |
| 3 | `status === "invalid"` | `invalid-media` | `auto` |
| 4 | `!buildGpxBusinessIdentity()` | `no-business-identity` | `auto` |
| 5 | `duplicateIds.has(media.id)` | `duplicate-identity` | `auto` |
| 6 | `!rbMap.has(roadbook_id)` | `missing-roadbook` | `auto` |
| 7 | `scope=stage && !stageMap.has(stageId)` | `missing-stage` | `auto` |
| 8 | `scope=variant && !stageMap.has(stageId)` | `missing-stage` | `auto` |
| 9 | `scope=variant && stage.roadbook_id !== media.roadbook_id` | `stage-roadbook-mismatch` | `auto` |
| 10 | `scope=step && stage.roadbook_id !== media.roadbook_id` | `stage-roadbook-mismatch` | `auto` |
| 11 | `scope=variant && variantId == null` | `missing-variant` | `auto` |
| 12 | `scope=variant && stageId == null` | `legacy-variant-target-is-incomplete` | `manual` |

## Résultat attendu (fixtures)

| Métrique | Valeur |
|----------|--------|
| Médias analysés | 13 |
| Canonicaux | 1 |
| Legacy-compatibles | 9 |
| Ambigus | 2 |
| Invalides | 1 |
| Groupes doublons | 2 |
| Éligibles | 3 |
| Exclus | 9 |
| Opérations | 3 |

## Exécution réelle

Utiliser `node scripts/plan-gpx-migration.mjs --output=./reports/gpx-migration-plan.json` pour générer le plan réel depuis Supabase production.

Le fichier `reports/gpx-migration-plan.json` contient des données réelles et ne doit pas être versionné.

## Prochaine étape (Sprint 4C5)

Si le plan est validé et que le cas `media.id=41` est résolu manuellement :
1. Revalider les préconditions par une relecture Supabase
2. Exécuter les `UPDATE` dans l'ordre du plan
3. Valider par `selectUniqueGpxMedia()` que chaque identité a une seul canonique
4. Commit `feat(migration): apply canonical GPX updates`

---
*Document généré automatiquement. Le plan 4C4 ne modifie aucune donnée.*
