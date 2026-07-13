# Sprint 20C — Centralisation de la couche données Supabase

## Objectif

Supprimer tous les appels directs `supabase.from(...)`, `supabase.storage(...)` et `supabase.rpc(...)` de `src/app/dashboard/roadbooks/[id]/page.js` en les remplaçant par des fonctions dédiées dans `src/lib/roadbooks/`.

## Avant / Après

| Métrique | Avant | Après |
|----------|-------|-------|
| `supabase.from()` dans page.js | ~55 | **0** |
| `supabase.storage()` dans page.js | ~7 | **0** |
| `supabase.rpc()` dans page.js | 1 | **0** |
| Lignes de page.js | 1783 | ~1691 |

## Fichiers créés

### `src/lib/roadbooks/loaders.js` (10 fonctions)

| Fonction | Rôle |
|----------|------|
| `loadRoadbook(supabase, id)` | Charge un roadbook par id, lève si introuvable |
| `loadRoadbookSafe(supabase, id)` | Idem, retourne null si introuvable |
| `loadStages(supabase, roadbookId)` | Étapes triées par stage_number |
| `loadPois(supabase, stageIds)` | POI filtrés par liste de stage_id, triés par sort_order |
| `loadVariants(supabase, stageIds)` | Variantes filtrées par stage_id |
| `loadMedia(supabase, roadbookId, type?)` | Médias filtrés par type optionnel |
| `loadCoverMedia(supabase, mediaId)` | Récupère bucket + path d'un media |
| `loadMediaWithUrls(supabase, roadbookId)` | Images avec signed URLs |
| `loadGpxRows(supabase, roadbookId)` | Lignes GPX |
| `getSignedUrl(supabase, bucket, path, expiresIn)` | URL signée, retourne null si path null |

### `src/lib/roadbooks/writers.js` (18 fonctions)

| Fonction | Rôle |
|----------|------|
| `insertStage(supabase, record)` | Crée une étape |
| `updateStage(supabase, stageId, updates)` | Met à jour une étape |
| `deleteStage(supabase, stageId)` | Supprime une étape |
| `insertPoi(supabase, record)` | Crée un POI |
| `updatePoi(supabase, poiId, updates)` | Met à jour un POI |
| `deletePoi(supabase, poiId)` | Supprime un POI |
| `insertVariant(supabase, record)` | Crée une variante |
| `updateVariant(supabase, variantId, updates)` | Met à jour une variante |
| `deleteVariant(supabase, variantId)` | Supprime une variante |
| `updateStageNotes(supabase, stageId, notes)` | Met à jour les notes d'une étape |
| `updateStageAccommodation(supabase, stageId, payload)` | Met à jour l'hébergement |
| `clearStageAccommodation(supabase, stageId)` | Vide les champs hébergement |
| `uploadImage(supabase, userId, roadbookId, file, blob)` | Upload image → Storage |
| `insertMediaRecord(supabase, record)` | Crée un enregistrement media en DB |
| `deleteMedia(supabase, mediaRow)` | Supprime storage + DB |
| `deleteMediaRecordOnly(supabase, mediaId)` | Supprime seulement la DB |
| `uploadGpx(supabase, bucket, path, file)` | Upload GPX → Storage |
| `removeStorageFile(supabase, bucket, path)` | Supprime un fichier Storage |
| `insertGpxRecord(supabase, record)` | Crée un enregistrement GPX en DB |
| `updateGpxRecord(supabase, mediaId, updates)` | Met à jour un enregistrement GPX |
| `deleteGpx(supabase, mediaRow, bucket)` | Supprime storage + DB pour GPX |
| `swapStageNumbers(supabase, idA, idB)` | Échange les numéros d'étape (RPC + fallback) |
| `insertRoadbook(supabase, record)` | Crée un roadbook, retourne l'id |
| `duplicateRoadbook(supabase, roadbook, stages, poisByStage, variantsByStage, slug, userId)` | Duplication complète |

### `src/lib/roadbooks/enrich.js` (4 fonctions)

| Fonction | Rôle |
|----------|------|
| `applyPoiEnrichment(supabase, poiId, found)` | Enrichit un POI via buildEnrichPoiUpdate |
| `applyAccommodationEnrichment(supabase, stageId, found)` | Enrichit un hébergement |
| `applyBatchPoiEnrichment(supabase, operations)` | Enrichit plusieurs POI en séquence |
| `applyBatchAccommodationEnrichment(supabase, operations)` | Enrichit plusieurs hébergements |

### `scripts/test-sprint-20c.mjs` (48 tests)

- 15 tests loaders
- 24 tests writers
- 8 tests enrich
- 1 test helper (mock Supabase)

## Convention d'erreur

Toutes les fonctions de data layer lèvent `new Error(message)` en cas d'échec Supabase. Les handlers dans `page.js` attrapent l'erreur et appellent `setXxx(err.message)`.

## Stratégie de reload

Après chaque mutation :
```js
await updateStage(supabase, id, updates);      // writer
const refreshed = await loadStages(supabase, id); // loader
setStages(refreshed);                              // state
```

Les reloads de POIs et variantes passent par `reloadPoisVariants(stageIds)` qui appelle `loadPois` + `loadVariants` en parallèle.

## Tests

| Suite | Résultat |
|-------|----------|
| Sprint 20C | 48/48 ✅ |
| Sprint 20B | 42/42 ✅ |
| Sprint 18D | 35/35 ✅ |
| Migration 18C | 10/10 ✅ |
| Build (`npm run build`) | 0 erreur ✅ |

## Test manuel recommandé

1. Charger le Studio → vérifier que roadbook, stages, POI, variantes s'affichent
2. Éditer un champ titre → sauvegarder → F5 → persistance
3. Créer/modifier une étape → vérifier reload
4. Créer/supprimer un POI → vérifier reload
5. Upload image → vérifier affichage
6. Upload GPX → télécharger → vérifier
7. Enrichir POI → vérifier mise à jour
8. Dupliquer un roadbook → vérifier redirection

## Décision

**GO** pour le Sprint 20D (hooks de domaine).
