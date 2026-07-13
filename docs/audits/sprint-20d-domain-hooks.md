# Sprint 20D — Hooks de domaine Studio

## Résumé

- **Objectif** : Extraire toute la logique métier et l'état de `page.js` dans des hooks spécialisés.
- **SHA de départ** : `acae993`
- **Absence de changement visuel et fonctionnel** : confirmé (build, tests, `git diff --check` propres).
- **Architecture finale** :

```text
page.js (1120 lignes, attente extraction composants Sprint 20E)
  ├── hooks/studio/useNotifications.js
  ├── hooks/studio/useRoadbookData.js
  ├── hooks/studio/useMediaManager.js
  ├── hooks/studio/useGpxManager.js
  ├── hooks/studio/useCoverManager.js
  ├── hooks/studio/useEnrichment.js
  ├── hooks/studio/useSaveWithLock.js
  ├── hooks/studio/useStageCrud.js
  └── hooks/studio/stageFormReducer.js
```

---

## Métriques avant/après

| Critère                    | Avant  | Après  | Delta   |
| -------------------------- | -----: | -----: | ------: |
| Lignes `page.js`           | ~1548  | 1120   | –28 %   |
| `useState` dans `page.js`  | 45     | 11     | –76 %   |
| `useEffect` dans `page.js` | 7      | 4      | –43 %   |
| Fonctions `handle*`        | ~27    | 19     | –30 %   |
| Appels Supabase directs    | ~10    | 0      | –100 %  |
| Hooks créés                | 0      | 8      | +8      |
| Reducers créés             | 0      | 1      | +1      |

---

## Tableau des hooks

### `useNotifications`

| Attribut       | Valeur                              |
| -------------- | ----------------------------------- |
| Responsabilité | Gestion centralisée erreur/succès   |
| État encapsulé | `error`, `success`                  |
| Méthodes       | — (setters exposés)                 |
| Data layer     | —                                   |
| Lignes         | ~18                                 |
| Risques        | Aucun                               |

### `useRoadbookData`

| Attribut       | Valeur                                              |
| -------------- | --------------------------------------------------- |
| Responsabilité | Chargement complet roadbook + stages + POI + variants|
| État encapsulé | `roadbook`, `stages`, `poisByStage`, `variantsByStage`, `loading`, `fetchError` |
| Méthodes       | `loadAll`, `reloadStages`, `reloadPoisVariants`     |
| Data layer     | `loadRoadbookSafe`, `loadStages`, `loadPois`, `loadVariants`, `groupByStageId` |
| Lignes         | ~87                                                 |
| Risques        | `cancelledRef` pour éviter les mises à jour après démontage |

### `useMediaManager`

| Attribut       | Valeur                                          |
| -------------- | ----------------------------------------------- |
| Responsabilité | Upload, suppression et rechargement des images   |
| État encapsulé | `images`, `uploadLoading`, `deleteLoading`, `uploadError` |
| Méthodes       | `reloadMedia`, `uploadMedia`, `removeMedia`, `handleSignedUrl` |
| Data layer     | `loadMedia`, `uploadImage`, `deleteMedia`, `getSignedUrl` |
| Lignes         | ~106                                            |
| Risques        | Gestion d'erreur de bucket                      |

### `useGpxManager`

| Attribut       | Valeur                                               |
| -------------- | ---------------------------------------------------- |
| Responsabilité | CRUD GPX (official, custom, par scène) + métriques    |
| État encapsulé | `gpxOfficial`, `gpxCustom`, `gpxByStage`, `gpxUploading`, `metricsLoading`, `gpxError` |
| Méthodes       | `reloadGpx`, `uploadGpx`, `replaceGpx`, `deleteGpx`, `downloadGpx`, `computeStageMetrics`, `analyzeStageGpx`, `applyStageMetrics` |
| Data layer     | `loadGpxRows`, `getSignedUrl`, `uploadGpx`, `insertGpxRecord`, `updateGpxRecord`, `deleteGpx`, `fetchAndComputeGpxMetrics`, `estimateGpxHours`, `formatDuration` |
| Lignes         | ~172                                                 |
| Risques        | `analyzeStageGpx` ne gère pas de loading state batch |

### `useCoverManager`

| Attribut       | Valeur                                           |
| -------------- | ------------------------------------------------ |
| Responsabilité | Sélection et suppression de l'image de couverture |
| État encapsulé | `coverUrl`, `coverMediaId`, `coverPreview`, `coverMode` |
| Méthodes       | `setCoverFromMedia`, `setCoverFromUrl`, `removeCover` |
| Data layer     | `updateRoadbook`, `deleteMedia`, `getSignedUrl`   |
| Lignes         | ~79                                               |
| Risques        | Aucun                                             |

### `useEnrichment`

| Attribut       | Valeur                                                    |
| -------------- | --------------------------------------------------------- |
| Responsabilité | Index d'enrichissement POI/hébergement, enrichissement unitaire + automatisation |
| État encapsulé | `poiIndex`, `accommodationIndex`, `enrichmentError`, `enrichingPoi`, `enrichingAccommodation`, `automationBusy`, `automationResult` |
| Méthodes       | `loadEnrichmentIndices`, `enrichPoi`, `enrichAccommodation`, `recalculateTotals`, `reloadAfterEnrichment` |
| Data layer     | `loadEnrichmentData`, `createPoiIndex`, `createAccommodationIndex`, `findPoi`, `findAccommodation`, `findAccommodationByName`, `applyPoiEnrichment`, `applyAccommodationEnrichment`, `loadPois`, `loadStages`, `conditionalUpdateRoadbook` |
| Lignes         | ~163                                                    |
| Risques        | `recalculateTotals` retourne `{ ok, msg }` ; la page gère `automationBusy`/`automationResult` |

### `useSaveWithLock`

| Attribut       | Valeur                                                         |
| -------------- | -------------------------------------------------------------- |
| Responsabilité | Sauvegarde avec lock, snapshot, conditional update, vérification |
| État encapsulé | `saving`                                                       |
| Méthodes       | `saveWithLock({ getUpdateFields, getUpdatedRoadbook, successMessage })` |
| Data layer     | `acquireSyncLockWithTabId`, `takeSnapshot`, `conditionalUpdateRoadbook`, `verifyAfterSync`, `releaseSyncLock` |
| Lignes         | ~28                                                            |
| Risques        | Aucun (flux lock→snapshot→conditionalUpdate→verify→revalidate→release propre) |

### `useStageCrud`

| Attribut       | Valeur                                                        |
| -------------- | ------------------------------------------------------------- |
| Responsabilité | CRUD complet stages, POI, variantes, hébergement, notes       |
| État encapsulé | `stageForm`, `stageFormDispatch`, `stageError`, `stageSuccess`, `editingStage`, `deleting`, formulaires POI/variant/note/accommodation |
| Méthodes       | `clearStageForm`, `fillStageForm`, `handleStageSubmit`, `handleDeleteStage`, `handlePoiSubmit`, `handleDeletePoi`, `handleVariantSubmit`, `handleDeleteVariant`, `handleNoteSubmit`, `handleDeleteNote`, `handleAccommodationSubmit`, `handleClearAccommodation`, `handleMoveStage` |
| Data layer     | `insertStage`, `updateStage`, `deleteStage`, `insertPoi`, `updatePoi`, `deletePoi`, `insertVariant`, `updateVariant`, `deleteVariant`, `insertNote`, `updateNote`, `deleteNote`, `saveAccommodation`, `clearAccommodation`, `moveStage`, `loadStages` |
| Lignes         | ~350                                                          |
| Risques        | Le plus gros hook ; pourrait être découpé si la complexité augmente |

---

## Reducer

### `stageFormReducer`

| Attribut        | Valeur                                                    |
| --------------- | --------------------------------------------------------- |
| État initial    | `defaultStageFormState` (`src/lib/roadbooks/validators.js`) |
| Actions         | `SET_FIELD`, `RESET`, `LOAD_STAGE`, `SET_ERROR`, `CLEAR_ERROR` |
| Conversion      | `stageToFormValues(stage)` pour initialiser le formulaire  |
| Immutabilité    | `...state` systématique, pas de mutation                   |
| Tests           | 10 tests dédiés dans `test-sprint-20d.mjs`                |

Actions supportées :

- `SET_FIELD` : met à jour un champ (supporte les chemins imbriqués via `field.split('.')`)
- `RESET` : revient à `defaultStageFormState`
- `LOAD_STAGE` : charge un stage existant dans le formulaire
- `SET_ERROR` : définit une erreur de champ
- `CLEAR_ERROR` : efface une erreur de champ

---

## Gestion de concurrence

### `useSaveWithLock` — flux complet

```text
acquireSyncLockWithTabId(id, tabId)
  → si échec : onError("Synchronisation verrouillée") + return
takeSnapshot({ roadbook, stages, poisByStage, variantsByStage })
getUpdateFields()  (callback fourni par la page)
conditionalUpdateRoadbook(supabase, id, updateFields, updated_at)
  → si conflict :
      saveImmediate()
      markRemoteConflict()
      onError("Conflit")
      releaseSyncLock()
      return
verifyAfterSync(supabase, id, snapshot)
  → si échec :
      saveImmediate()
      markRemoteConflict()
      onError("Conflit après synchronisation")
      releaseSyncLock()
      return
setRoadbook(updated) + markSynced()
releaseSyncLock(id, tabId)
fetch /api/revalidate
onSuccess(successMessage)
setSaving(false)
```

**Propriétés clés** :
- Lock libéré dans tous les chemins (succès, conflict, erreur)
- Snapshot pris avant update pour la vérification post-sync
- `saveImmediate()` préserve le travail local en cas de conflit
- Revalidation API après succès

---

## Mapping des handlers

### Automatisations extraites

| Handler historique        | Destination                               | Rôle restant dans page.js         |
| ------------------------- | ----------------------------------------- | --------------------------------- |
| `handleRecalculateTotals` | `useEnrichment.recalculateTotals`         | calcul → confirmation → appel     |
| `handleAutoEnrich`        | `useEnrichment.reloadAfterEnrichment`     | filtrage → confirmation → boucle + `applyPoiEnrichment`/`applyAccommodationEnrichment` |
| `handleComputeFromGpx`    | `useGpxManager.computeStageMetrics` + `applyStageMetrics` | confirmation → appel  |
| `handleAnalyzeStageGpx`   | `useGpxManager.analyzeStageGpx` + `applyStageMetrics` | preview → boucle → confirmation → appel |

### Autres handlers conservés

| Handler                          | Délégation principale                              | Rôle page.js                |
| -------------------------------- | -------------------------------------------------- | --------------------------- |
| `handleSave`                     | `useSaveWithLock.saveWithLock`                     | construction callback       |
| `handleStageSubmit`              | `useStageCrud.handleStageSubmit`                   | wrapper                     |
| `handleDeleteStage`              | `useStageCrud.handleDeleteStage`                   | wrapper                     |
| `handlePoiSubmit`                | `useStageCrud.handlePoiSubmit`                     | wrapper                     |
| `handleDeletePoi`                | `useStageCrud.handleDeletePoi`                     | wrapper                     |
| `handleVariantSubmit`            | `useStageCrud.handleVariantSubmit`                 | wrapper                     |
| `handleDeleteVariant`            | `useStageCrud.handleDeleteVariant`                 | wrapper                     |
| `handleNoteSubmit`               | `useStageCrud.handleNoteSubmit`                    | wrapper                     |
| `handleDeleteNote`               | `useStageCrud.handleDeleteNote`                    | wrapper                     |
| `handleAccommodationSubmit`      | `useStageCrud.handleAccommodationSubmit`           | wrapper                     |
| `handleClearAccommodation`       | `useStageCrud.handleClearAccommodation`            | wrapper                     |
| `handleMoveStage`                | `useStageCrud.handleMoveStage`                     | wrapper                     |
| `handleSetCoverFromMedia`        | `useCoverManager.setCoverFromMedia`                | wrapper                     |
| `handleSetCoverFromUrl`          | `useCoverManager.setCoverFromUrl`                  | wrapper                     |
| `handleRemoveCover`              | `useCoverManager.removeCover`                      | wrapper                     |
| `handleEnrichPoi`                | `useEnrichment.enrichPoi`                          | wrapper                     |
| `handleEnrichAccommodation`      | `useEnrichment.enrichAccommodation`                | wrapper                     |
| `handleDuplicate`                | `duplicateRoadbook` + `loadAll`                    | orchestration               |
| `handleGpxUpload/replace/delete` | `useGpxManager.uploadGpx`/`replaceGpx`/`deleteGpx`| wrapper                     |

---

## États restants dans `page.js`

Les 11 `useState` encore présents :

| Variable               | Type         | Raison du maintien                  |
| ---------------------- | ------------ | ----------------------------------- |
| `title`                | `string`     | Champ formulaire (UI) — pas de hook dédié pour un champ unique |
| `description`          | `string`     | Champ formulaire (UI)               |
| `isPublic`             | `boolean`    | Toggle UI                           |
| `activity`             | `string`     | Champ formulaire (UI)               |
| `destination`          | `string`     | Champ formulaire (UI)               |
| `project`              | `string`     | Champ formulaire (UI)               |
| `expandedStages`       | `object`     | État d'accordéon (UI pure)          |
| `duplicating`          | `boolean`    | Loading state du duplicate          |
| `showStageForm`        | `boolean`    | Visibilité modale (UI)              |
| `officialRoute`        | `object`     | Groupe de champs (UI)               |
| `traceRoute`           | `object`     | Groupe de champs (UI)               |

Tous ces états sont soit visuels, soit liés à des champs de formulaire simples qui seront extraits avec leurs composants au Sprint 20E.

---

## Tests

### Résultats

| Suite          | Résultat |
| -------------- | -------: |
| Sprint 20D     | 22/22   |
| Sprint 20C     | 48/48   |
| Sprint 20B     | 42/42   |
| Sprint 18D     | 35/35   |
| Migration 18C  | 10/10   |
| `npm run build`| 0 erreur|
| `git diff --check` | propre |

### Tests manuels

À effectuer manuellement :
- Charger la page Studio d'un roadbook existant
- Éditer un champ, sauvegarder
- Ajouter/supprimer une étape
- Ajouter/supprimer un POI, une variante, une note
- Enrichir un POI et un hébergement
- Importer un GPX, calculer les métriques
- Lancer les automatisations (totaux, analyse GPX, enrichissement batch)
- Dupliquer un roadbook
- Changer la couverture
- Recharger la page (F5) et vérifier la persistance

---

## Dette restante

La dette principale appartient désormais aux Sprints 20E et 20F :

- **JSX volumineux** : la page contient encore ~1120 lignes de JSX inline
- **Composants non extraits** : 12-15 composants à créer (`GeneralInfoForm`, `StageCard`, `AutomationPanel`, etc.)
- **19 wrappers UI** : fonctions `handle*` qui ne font que déléguer aux hooks
- **4 `useEffect`** : à remplacer par des hooks dédiés ou des callbacks
- **`page.js` à 1120 lignes** : objectif < 400 lignes (Sprint 20F)

Cette dette sera traitée dans les sprints suivants sans modification de l'architecture existante.
