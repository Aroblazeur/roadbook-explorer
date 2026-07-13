# Sprint 20A — Rapport d'audit de maintenabilité du Studio

## 1. Informations générales

| Champ | Valeur |
|-------|--------|
| SHA de départ | `5a5f514` |
| Branche | `v2-next-supabase` |
| Objet | Audit complet de maintenabilité du Studio d'édition des roadbooks |
| Fichier cible principal | `src/app/dashboard/roadbooks/[id]/page.js` |
| Aucun refactor commencé | ✅ |
| Build | ✅ 0 erreur |
| Tests 18D | ✅ 35/35 |
| Migration 18C | ✅ 10/10 |

---

## 2. Statistiques globales

### Fichiers par tranche de lignes

| Tranche | Fichiers |
|---------|----------|
| > 1200 | 1 : `page.js` (1783 lignes) |
| > 800 | 0 |
| > 500 | 0 |
| > 300 | 3 : `useStudioDraft.js` (306), `studio-drafts.js` (310) |
| > 100 | 5 : `roadbooks/[slug]/page.js` (478), `gpx-metrics.js` (153), `sync-helpers.js` (139), `enrichment.js` (117), `roadbooks/page.js` (186) |

### Tous les fichiers source (hors scripts)

| Fichier | Lignes | useState | useEffect | Requêtes Supabase | Responsabilités |
|---------|-------:|---------:|----------:|------------------:|-----------------|
| `dashboard/roadbooks/[id]/page.js` | **1783** | **74** | **4** | **~70** | **14** |
| `roadbooks/[slug]/page.js` | 478 | 0 (RSC) | 0 | 6 | 3 |
| `lib/studio-drafts.js` | 310 | 0 | 0 | 1 | 1 (persistance localStorage) |
| `hooks/useStudioDraft.js` | 306 | 3 | 6 | 0 | 1 (autosave brouillon) |
| `dashboard/roadbooks/page.js` | 186 | — | — | — | liste roadbooks |
| `lib/gpx-metrics.js` | 153 | 0 | 0 | 0 | 1 (parse GPX) |
| `lib/sync-helpers.js` | 139 | 0 | 0 | 3 | 1 (lock + conditional update) |
| `lib/enrichment.js` | 117 | 0 | 0 | 0 | 1 (indexation POI/hébergement) |
| `components/DraftStatus.js` | 78 | 0 | 0 | 0 | 1 (affichage statut) |
| `components/MapViewer.jsx` | 78 | — | — | — | 1 (carte) |
| `components/CatalogHeader.js` | 61 | — | — | — | 1 (entête catalogue) |
| `lib/auth-context.js` | 40 | 2 | 1 | 0 | 1 (auth provider) |

---

## 3. Analyse détaillée de `page.js`

### Métriques clés

| Métrique | Valeur |
|----------|--------|
| Lignes totales | **1783** |
| `useState` | **74** (dont 50% pour les formulaires d'étape uniquement) |
| `useEffect` | **4** (auth redirect, loadData, restore draft, beforeunload) |
| Handlers / fonctions | **43** |
| Requêtes Supabase directes | **~70** |
| Composants internes (JSX) | **0** (tout est inline) |
| Importations | **10** lignes d'import |
| Responsabilités distinctes | **14** |

### Cartographie fonctionnelle

```text
page.js (1783 lignes, 74 useState, ~70 requêtes Supabase)
├── 1. Auth / guard (l. 152-154)
│   └── useEffect → redirect if !user
├── 2. Chargement initial (l. 156-232)
│   └── loadData() → roadbook + stages + pois + variants + media + GPX + enrichment
├── 3. Restauration brouillon (l. 234-264)
│   └── useEffect → set all states from restoredDraft
├── 4. Formulaire infos générales (l. 266-288)
│   ├── handleSave → lock + snapshot + conditionalUpdate + revalidate
│   └── title, description, activity, destination, project
├── 5. Itinéraire officiel + tracé (l. 290-329)
│   ├── handleSaveRoute → conditionalUpdate + revalidate
│   └── officialDist/Gain/Loss/Gpx/Map, traceDist/Gain/Loss/Gpx/Map
├── 6. Visibilité (l. 331-342)
│   └── handleToggleVisibility → conditionalUpdate + revalidate
├── 7. CRUD Étapes (l. 344-418)
│   ├── clearStageForm, fillStageForm
│   ├── handleStageSubmit → insert/update stage + reload
│   └── handleDeleteStage → delete stage
├── 8. CRUD POI (l. 420-460)
│   ├── clearPoiForm, handlePoiSubmit, handleDeletePoi
│   └── reloadPoisVariants
├── 9. CRUD Variantes (l. 462-488)
│   ├── clearVariantForm, handleVariantSubmit, handleDeleteVariant
│   └── reloadPoisVariants
├── 10. Médias / Images (l. 490-563)
│   ├── resizeImage, handleSignedUrl, loadImages
│   ├── handleUploadImage → storage.upload + media.insert
│   └── handleDeleteImage → storage.remove + media.delete
├── 11. GPX (l. 565-706)
│   ├── buildGpxPath, validateGpx, loadGpx
│   ├── handleGpxDownload, handleGpxReplace, handleGpxUpload
│   ├── handleComputeFromGpx → fetch GPX metrics + stage.update
│   └── handleGpxDelete
├── 12. Enrichissement POI/Hébergement (l. 708-797)
│   ├── handleEnrichPoi, handleEnrichAccommodation
│   └── handleClearAccommodation
├── 13. Hébergement + Notes (l. 799-860)
│   ├── handleAccommodationSubmit, handleDeleteNote, handleNoteSubmit
│   └── clearAccommodationForm, clearNoteForm
├── 14. Automatisations (l. 862-1074)
│   ├── handleRecalculateTotals → somme stages + conditionalUpdate
│   ├── handleAnalyzeStageGpx → batch GPX → stages
│   └── handleAutoEnrich → batch enrich POI + accommodations
├── 15. Cover (l. 1076-1137)
│   ├── handleSetCoverFromMedia, handleSetCoverFromUrl, handleRemoveCover
│   └── renderGpxBlock (interne)
├── 16. Réordonnancement (l. 1140-1156)
│   └── handleMoveStage → rpc swap_stage_numbers
├── 17. Duplication (l. 1159-1218)
│   └── handleDuplicate → insert roadbook + stages + pois + variants
├── 18. beforeunload guard (l. 1220-1229)
│   └── useEffect → draft status check
├── 19. Rendu conditionnel (l. 1231-1234)
│   └── loading/error/user guards
└── 20. JSX (l. 1235-1782)
    ├── DraftStatus bar
    ├── Hero header
    ├── LEFT COLUMN — 8 cartes
    │   ├── Infos générales
    │   ├── Couverture + Visibilité
    │   ├── Itinéraire officiel
    │   ├── Tracé actuel
    │   ├── Médias
    │   ├── GPX
    │   ├── Automatisations
    │   └── Informations (slug/ID)
    ├── RIGHT COLUMN — Étapes
    │   ├── Bandeau nouvelle étape
    │   ├── Formulaire création/édition étape
    │   └── Liste étapes
    │       ├── Infos étape (readonly)
    │       ├── GPX + Carte + POI
    │       ├── Hébergement principal
    │       ├── Hébergements alternatifs (placeholder)
    │       ├── Notes
    │       └── Variantes
    └── (tout JSX inline, 0 composant extrait)
```

---

## 4. Responsabilités mélangées

| Bloc | Responsabilités mélangées | Risque | Destination |
|------|--------------------------|--------|-------------|
| `loadData()` | API + mapping + effets secondaires + enrichment loading | Race condition au mount | Hook `useRoadbookData` |
| `handleSave` | Lock + snapshot + condition update + verify + revalidation + état local | Stale closure sur `roadbook` | Hook `useRoadbookSave` |
| `handleStageSubmit` | Validation + build record + insert/update + reload + form reset | Duplication logique insert/update | Hook `useStageCrud` |
| `handleComputeFromGpx` | Signed URL + fetch GPX + metrics + confirm UI + update stage + reload | UI bloquante (confirm) dans handler métier | Fonction séparée + hook |
| `handleDuplicate` | Insert roadbook + stages + pois + variants + navigation | Transaction non atomique | Fonction utilitaire |
| `handleEnrichPoi` / `handleAutoEnrich` | Index lookup + confirm UI + update + reload | Logique UI dans couche données | Split enrich + confirm |
| JSX des formulaires stages | Présentation + état local + validation inline | `useState` explosifs | Composants dédiés |

---

## 5. Audit des hooks

### Hooks existants

| Hook | Lignes | Responsabilité | Dépendances | Réutilisable | Trop large |
|------|--------|----------------|-------------|-------------|------------|
| `useStudioDraft` | 306 | Autosave localStorage, restauration, détection conflit onglet | 23 props ! | Oui, mais trop de props | Oui — reçoit l'état complet de page.js |
| `useAuth` | 40 | Auth context (user, loading, supabase) | — | Oui | Non |

### Analyse

`useStudioDraft` reçoit 23 props qui sont dérivées des 74 `useState` de `page.js`. Le hook est bien conçu (refs, timers, pagehide), mais son interface est couplée à l'état plat de `page.js`. Idéalement, il ne devrait recevoir que `userId`, `roadbookId`, et une fonction `getCurrentState()` ou un reducer.

### Hooks manquants

| Hook | Justification |
|------|---------------|
| `useRoadbook(id)` | Chargement roadbook + stages + POI + variantes |
| `useMedia(roadbookId)` | Chargement, upload, suppression images |
| `useGpx(roadbookId)` | Chargement, upload, suppression, remplacement GPX |
| `useStageCrud(roadbookId)` | CRUD stages + POI + variantes avec reload |
| `useRoadbookMutations()` | Save + visibility + recalculate + duplicate |
| `useEnrichment(slug)` | Chargement index + find + apply |
| `useCover(roadbookId)` | Cover management (URL, media, remove) |
| `useNotifications()` | Error/success management |

---

## 6. Audit des appels Supabase

### Appels directs dans `page.js`

| Table | Opérations | Nombre approx. | Duplication |
|-------|-----------|---------------|-------------|
| `roadbooks` | select, update (conditionalUpdate), insert | ~10 | `select "*"` répété 3+ fois |
| `stages` | select, insert, update, delete | ~15 | Pattern reload identique 10+ fois : `select("*").eq("roadbook_id", id).order("stage_number")` |
| `stage_pois` | select, insert, update, delete | ~10 | Pattern reload identique 5+ fois |
| `stage_variants` | select, insert, update, delete | ~5 | Pattern reload identique |
| `media` | select, insert, update, delete | ~10 | Load images + load GPX pattern similaire |
| `storage` | upload, remove, createSignedUrl | ~12 | Signed URL pattern répété 5+ fois |

### Problèmes identifiés

1. **Reload pattern dupliqué** : après chaque mutation, le handler relit toutes les étages/POI/variantes de zéro. 10+ occurrences du même bloc `supabase.from("stages").select("*").eq("roadbook_id", Number(id)).order("stage_number")`.
2. **Signed URL pattern dispersé** : 5+ appels `createSignedUrl` avec la même logique.
3. **Gestion d'erreur répétée** : chaque handler vérifie `{ error }` et appelle `setStageError(error.message)`.
4. **Requêtes N+1 potentielles** : `loadData` lance 4 requêtes séquentielles (roadbook → stages → pois → variants).
5. **`conditionalUpdateRoadbook`** : centralisé dans `sync-helpers.js`, bonne pratique — mais duplication du lock + snapshot + verify avant chaque appel.

---

## 7. Audit de l'état React

### Classification des 74 `useState`

| Catégorie | États | Nombre |
|-----------|-------|--------|
| Données métier | `roadbook`, `stages`, `poisByStage`, `variantsByStage`, `images`, `gpxOfficial`, `gpxCustom`, `gpxByStage` | 8 |
| État formulaire (édition) | `title`, `description`, `isPublic`, `activity`, `destination`, `project`, `officialDist/Gain/Loss/Gpx/Map`, `traceDist/Gain/Loss/Gpx/Map`, `coverUrl`, `coverMediaId`, `coverMode`, `coverPreview` | 17 |
| État formulaire (étapes) | `stageDayNumber`, `stageTitle`, `stageStart`, `stageEnd`, `stageDist`, `stageGain`, `stageLoss`, `stageDifficulty`, `stageAccommodation`, `stageDescription`, `stageNotes`, `stageWarning`, `stageMapEmbed`, `stagePhotoUrl`, `stageDay`, `stageLabel`, `stageDuration` | 17 |
| État formulaire (sous-formulaires) | `poiForm` (7 champs), `variantForm` (9 champs), `noteForm` (2 champs), `accommodationForm` (4 champs) | 4 objets |
| État chargement | `loading`, `saving`, `uploading`, `uploadingGpx`, `computingGpx`, `deleting`, `deletingImage`, `duplicating`, `enrichingPoi`, `enrichingAccommodation`, `automationBusy` | 11 |
| État erreur | `fetchError`, `error`, `success`, `stageError`, `stageSuccess`, `uploadError`, `gpxError`, `enrichmentError`, `automationResult` | 9 |
| État UI | `editingStage`, `showStageForm`, `expandedStages`, `coverMode` (déjà compté) | 3 |
| État index | `poiIndex`, `accommodationIndex` | 2 |

### Problèmes identifiés

1. **17 `useState` distincts pour le formulaire d'étape** → doit être un objet unique ou un reducer.
2. **4 objets formulaire** (`poiForm`, `variantForm`, `noteForm`, `accommodationForm`) → gestion fragmentée, logique similaire dupliquée.
3. **9 états d'erreur/succès distincts** → `setError`/`setSuccess`/`setStageError`/`setStageSuccess`/`setUploadError`/`setGpxError`/`setEnrichmentError`/`setAutomationResult` → peut être réduit à 1 état de notification.
4. **11 états de chargement** → beaucoup sont booléens individuels → un état `loading` avec un champ `type` suffirait.
5. **États dérivables** : `coverMode` peut être dérivé de `coverUrl` et `coverMediaId`. `coverPreview` peut être dérivé pareillement.

### Proposition de regroupement

```text
roadbookState = { roadbook, stages, poisByStage, variantsByStage, poiIndex, accommodationIndex }
mediaState = { images, gpxOfficial, gpxCustom, gpxByStage }
formState = { title, description, isPublic, activity, destination, project }
routeFormState = { officialDist, officialGain, officialLoss, officialGpx, officialMap, traceDist, traceGain, traceLoss, traceGpx, traceMap }
stageFormState = { dayNumber, title, start, end, dist, gain, loss, difficulty, accommodation, description, notes, warning, mapEmbed, photoUrl, day, label, duration }
coverState = { coverUrl, coverMediaId, coverPreview }
uiState = { loading, saving, error, success, editingStage, showStageForm, expandedStages }
uploadsState = { uploading, uploadingGpx, computingGpx, deleting, deletingImage, duplicating, enrichingPoi, enrichingAccommodation, automationBusy, automationResult }
```

Soit **8 groupes** au lieu de **74 variables individuelles**.

---

## 8. Audit des effets

### useEffects dans `page.js`

| Effet | Lignes | Déclencheurs | Produit | Risque | Action |
|-------|--------|-------------|---------|--------|--------|
| Auth redirect | 152-154 | `[user, authLoading]` | Redirige vers `/login` si non auth | Faible | OK, peut rester |
| loadData | 232 | `[user, id]` | Charge tout le roadbook + dépendances | **Élevé** — pas de cleanup si ID change ; race condition sur requêtes asynchrones empilées ; pas d'annulation | Extraire dans hook avec AbortController |
| Restore draft | 234-264 | `[restoredDraft]` | Rétablit 25+ états depuis le brouillon | **Moyen** — cascade de setState ; ordre non garanti si dépendances changent | Déplacer dans le hook useStudioDraft |
| beforeunload | 1220-1229 | `[draftStatus]` | Empêche fermeture si brouillon non sauvé | Faible | OK |

### Problèmes identifiés

1. **Effet `loadData` critique** : aucune annulation si le composant est démonté ou si `id` change rapidement. Pas de cleanup.
2. **Effet `restoredDraft`** : cascade potentielle de 25 `setState` synchrones. Certains pourraient être groupés.
3. **Aucun effet `storage` listener local** : géré par `useStudioDraft`.
4. **Effet de changement d'ID manquant** : `useStudioDraft` en gère un (lines 200-209), mais `page.js` ne nettoie pas si `id` change.

---

## 9. Audit des handlers

### Handlers longs (> 40 lignes)

| Handler | Lignes | Rôle | Appels réseau | Sous-responsabilités |
|---------|--------|------|--------------|---------------------|
| `loadData` | 74 | Chargement initial | 6 | roadbook + couverture + stages + POI + variantes + enrichment |
| `handleSave` | 22 | Sauvegarde infos | 3 | lock + snapshot + conditionalUpdate + verify + revalidate |
| `handleSaveRoute` | 39 | Sauvegarde route | 3 | lock + snapshot + build meta + conditionalUpdate + verify + revalidate |
| `handleStageSubmit` | 37 | Création/modif étape | 2-3 | validation + build record + insert/update + reload |
| `handleDuplicate` | 59 | Duplication complète | n*4 | insert roadbook + boucle stages + boucle POI + boucle variants + navigation |
| `handleComputeFromGpx` | 60 | Analyse GPX d'étape | 3 | signed URL + fetch metrics + confirm + update + reload |
| `handleEnrichPoi` | 47 | Enrichissement POI | 2 | index lookup + confirm + update + reload |
| `handleEnrichAccommodation` | 40 | Enrichissement hébergement | 2 | index lookup + confirm + update + reload |
| `handleRecalculateTotals` | 44 | Recalcul totaux | 1 | somme stages + confirm + conditionalUpdate |
| `handleAnalyzeStageGpx` | 66 | Analyse batch GPX | n*3 | boucle stages + signed URL + fetch metrics + confirm + update |
| `handleAutoEnrich` | 93 | Enrichissement batch | n*2 | boucle POI + boucle stages + index lookup + confirm + update |

### Problèmes

1. `handleAutoEnrich` : 93 lignes ! C'est le handler le plus long. Il mélange UI (confirm), logique métier (indexation), persistance (updates), et notification.
2. `handleDuplicate` : 59 lignes, 4 insertions en boucle, pas de transaction — échec partiel non géré.
3. `handleAnalyzeStageGpx` : 66 lignes, presque un doublon de `handleComputeFromGpx` mais en mode batch.
4. `handleEnrichPoi` et `handleEnrichAccommodation` : très redondants (même pattern confirm-update-reload).

---

## 10. Audit des composants internes

### Extractions JSX possibles

| Composant | Props probables | État local | Logique métier | Risque d'extraction |
|-----------|----------------|------------|----------------|---------------------|
| `GeneralInfoForm` | `title, description, activity, destination, project, saving, onSave` | non | non | Faible — formulaire pur |
| `RouteForm` | `official*, trace*, saving, onSave` | non | non | Faible |
| `MediaSection` | `images, uploading, onUpload, onDelete` | non | non | Moyen — signed URL nécessaire |
| `GpxSection` | `gpxOfficial, gpxCustom, uploadingGpx, onUpload, onReplace, onDelete, onDownload` | non | non | Moyen |
| `AutomationPanel` | `busy, result, onTotals, onGpx, onEnrich` | non | non | Faible |
| `StageForm` | tous les `stage*` states + handlers | non | non | Faible — formulaire |
| `StageListItem` | `stage, pois, variants, gpx, expanded, onEdit, onDelete, onMove` | oui (expanded) | non | Faible |
| `PoiForm` | `poiForm, onSubmit, onCancel` | non | non | Faible |
| `VariantForm` | `variantForm, onSubmit, onCancel` | non | non | Faible |
| `AccommodationSection` | `stage, accommodationForm, onAdd, onEdit, onClear, onEnrich` | non | non | Faible |
| `NotesSection` | `stage, noteForm, onAdd, onEdit, onDelete` | non | non | Faible |
| `CoverSection` | `coverPreview, coverUrl, images, onSetUrl, onSetMedia, onRemove` | non | non | Faible |
| `DuplicateButton` | `onDuplicate, duplicating` | non | non | Trivial — 5 lignes, à garder dans page |
| `StageCard` | toutes les props de rendu d'étape | non | non | Faible |

### Note

Le JSX contient des sections clairement délimitées par des commentaires (`// CARD 1`, `// CARD 2`, etc.) et des classes CSS structurées (`studio-card`, `studio-zone`, etc.), ce qui facilite l'extraction.

---

## 11. Duplications

| Duplication | Occurrences | Force | Extraction |
|-------------|-------------|-------|------------|
| Pattern reload stages/pois/variants `select("*").eq("roadbook_id", id).order("stage_number")` | 10+ | **Forte** | Fonction `reloadStages()` dans une couche data |
| Pattern signed URL `storage.from(bucket).createSignedUrl(path, expires)` | 5+ | **Forte** | Fonction utilitaire `getSignedUrl()` |
| Pattern conditional update + lock + snapshot + verify | 3 (handleSave, handleSaveRoute, handleToggleVisibility) | **Moyenne** | Hook `useSaveWithLock` |
| Enrichissement POI / accommodation (confirm-update-reload) | 2 individuel + 2 batch | **Moyenne** | Fonction générique `applyEnrichment(entity, index, updateFn)` |
| Recalcul distance/D+/D- dans `handleRecalculateTotals` et `handleComputeFromGpx` | 2 | **Moyenne** | Fonction utilitaire |
| `handleStageSubmit` vs `handlePoiSubmit` vs `handleVariantSubmit` | 3 | Faible — pattern commun acceptable | Template générique si pertinent |
| Gestion d'erreur `if (error) { setXxxError(error.message); return; }` | 15+ | **Forte** | Fonction wrapper `handleSupabaseError()` |

---

## 12. Erreurs et notifications

### Problèmes

1. **9 états d'erreur/succès distincts** : `error`, `success`, `stageError`, `stageSuccess`, `uploadError`, `gpxError`, `enrichmentError`, `automationResult`, `fetchError`.
2. **Chaînes de message dispersées** dans le code : messages en dur ("Roadbook mis à jour.", "Conflit de version.", etc.), pas de constantes.
3. **Réinitialisation incohérente** : certains handlers réinitialisent `setError(null)`, d'autres non.
4. **`stageError` vs `error`** : deux canaux d'erreur différents pour des concepts proches.
5. **`automationResult`** : mélange succès et erreur dans un même état.

### Proposition

Un état unique :
```js
const [notification, setNotification] = useState(null);
// { type: "error" | "success" | "info", message: string }
```
Avec réinitialisation automatique après X secondes.

---

## 13. Formulaires

### Inventaire

| Formulaire | Type | Validation | Reset | Conversion nombre |
|-----------|------|-----------|-------|-------------------|
| Infos générales | Contrôlé (6 champs) | `required` HTML5 | Manuel (handleSave) | Non |
| Itinéraire officiel | Contrôlé (5 champs) | Aucune | Manuel (handleSaveRoute) | Oui (5x `Number()`) |
| Tracé actuel | Contrôlé (5 champs) | Aucune | Manuel (handleSaveRoute) | Oui (5x `Number()`) |
| Étape | Contrôlé (16+ champs) | `dayNumber` required | `clearStageForm()` | Oui (4x `Number()`) |
| POI | Contrôlé (6 champs) | `name` required | `clearPoiForm()` | Oui (2x `Number()`) |
| Variante | Contrôlé (9 champs) | `title` required | `clearVariantForm()` | Oui (3x `Number()`) |
| Note | Contrôlé (1 champ) | `text` required | `clearNoteForm()` | Non |
| Hébergement | Contrôlé (3 champs) | `name` required | `clearAccommodationForm()` | Non |

### Analyse

- **React Hook Form** serait bénéfique pour les formulaires d'étape, POI, variante (validation + reset + conversion automatiques).
- **Reducer** suffirait pour les formulaires plus petits (infos générales, route, hébergement, note).
- **Conversions nombre** : `Number()` dispersé partout, aucune gestion de `NaN`. Risque de `Number("") === 0` au lieu de `null`.
- **Validation** : minimale et faite à la main. Un schéma Zod serait utile pour chaque formulaire.

---

## 14. Performances

### Points coûteux identifiés

| Point | Impact | Explication |
|-------|--------|-------------|
| Rerender massif sur chaque `setStageXxx` | **Élevé** | 17 `useState` individuels → 17 rerenders par étape |
| Rechargement complet après chaque mutation | **Élevé** | `handleStageSubmit` → reload stages/pois/variants depuis Supabase |
| Pas de `useMemo`/`useCallback` sur les handlers | **Moyen** | 43 handlers recréés à chaque render |
| Pas de key stable sur la liste d'étapes (`index` comme key) | **Moyen** | Peut causer des rerenders inutiles |
| Objets créés dans le render | **Moyen** | `currentState` dans `useStudioDraft` recréé à chaque render (via ref, OK) |
| 3 requêtes séquentielles pour POI/variants | Faible | Acceptable pour un formulaire d'édition |
| GPX metrics via fetch dans le handler | Faible | Opération unique, pas de cache |

---

## 15. Testabilité

### Fonctions extractibles et testables

| Fonction | Entrées | Sorties | Effets de bord | Testable après extraction |
|----------|---------|---------|----------------|---------------------------|
| `resizeImage(file, maxWidth)` | File, number | Blob metadata | Non (canvas) | Oui (mock canvas) |
| `validateGpx(file)` | File | string|null | Non | **Oui** |
| `buildGpxPath(scope, role, stageId)` | strings | string | Non | **Oui** |
| `clearStageForm` / `fillStageForm` | state | state | Non | **Oui** (après groupement) |
| Construction meta officiel/stagesTotal | objet | objet | Non | **Oui** |
| Calcul totaux `handleRecalculateTotals` | stages[] | metrics | Non | **Oui** |
| `handleSignedUrl` | path | string | Supabase | Après extraction |
| `loadImages` / `loadGpx` | - | void | Supabase | Après extraction |
| Comparaison enrichissement existing/any | entity | boolean[] | Non | **Oui** |

---

## 16. Cartographie des dépendances

```text
                    ┌─────────────────────────────────────┐
                    │          page.js (1783 L)             │
                    │  (orchestrateur monolithique)         │
                    └──────┬──────┬──────┬──────┬──────────┘
                           │      │      │      │
              ┌────────────┘      │      └──────────────┐
              ▼                   ▼                      ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────┐
    │  useStudioDraft  │  │  DraftStatus    │  │  auth-context      │
    │  (306 L, 23props)│  │  (70 L, 6props) │  │  (40 L)            │
    └────────┬─────────┘  └─────────────────┘  └────────────────────┘
             │
             ▼
    ┌─────────────────┐
    │  studio-drafts   │
    │  (310 L)         │
    └─────────────────┘

    ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────┐
    │  sync-helpers    │  │  gpx-metrics    │  │  enrichment         │
    │  (139 L)         │  │  (153 L)        │  │  (117 L)            │
    └─────────────────┘  └─────────────────┘  └────────────────────┘
```

**Problème central** : `page.js` dépend de tout. Toute modification de `studio-drafts`, `sync-helpers`, `gpx-metrics` ou `enrichment` impacte directement `page.js`. Pas de couche d'abstraction entre la page et les helpers.

---

## 17. Architecture cible

```text
src/
  app/dashboard/roadbooks/[id]/
    page.js                           ← orchestration légère (< 400 lignes)

  components/studio/
    StudioShell.js                     ← layout principal (si réutilisable)
    GeneralInfoForm.js                 ← formulaire infos générales
    RouteForm.js                       ← itinéraire officiel + tracé
    MediaSection.js                    ← upload + galerie images
    GpxSection.js                      ← GPX officiel + personnalisé
    AutomationPanel.js                 ← boutons automatisation
    CoverSection.js                    ← image de couverture
    StageList.js                       ← liste des étapes
    StageCard.js                       ← carte étape (expandable)
    StageForm.js                       ← formulaire création/édition étape
    PoiForm.js                         ← formulaire POI
    VariantForm.js                     ← formulaire variante
    AccommSection.js                   ← hébergement principal
    NoteForm.js                        ← formulaire notes
    StageGpxBlock.js                   ← bloc GPX d'étape

  hooks/studio/
    useRoadbookData.js                 ← chargement roadbook + stages + POI + variantes
    useMediaManager.js                 ← chargement + upload + suppression images
    useGpxManager.js                   ← chargement + upload + suppression GPX
    useStageCrud.js                    ← CRUD stages + POI + variantes (dispatch-based)
    useCoverManager.js                 ← cover URL/media
    useEnrichment.js                   ← chargement index + enrichissement
    useNotifications.js                ← notifications error/success
    useSaveWithLock.js                 ← lock + conditionalUpdate + verify
    useRoadbookMutations.js            ← save, visibility, recalculate, duplicate

  lib/roadbooks/
    mutations.js                       ← conditionalUpdate, duplicate (sans état React)
    enrichment.js                      ← (inchangé)
    gpx-metrics.js                     ← (inchangé)

  lib/ (existants)
    studio-drafts.js                   ← (inchangé, bien structuré)
    sync-helpers.js                    ← (inchangé, bien structuré)
```

---

## 18. Risques du refactor

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Perte de brouillon | Critique | Tests dédiés après chaque extraction ; ne pas toucher `useStudioDraft` avant la fin |
| Race condition changement ID | Critique | Toujours utiliser AbortController dans les hooks de données |
| Régression médias | Élevé | Tests manuels upload/download après chaque étape |
| Régression GPX | Élevé | Tests manuels upload/download/compute |
| Props explosion | Moyen | Privilégier le passage d'objets groupés plutôt que 15 props individuelles |
| Hooks trop couplés | Moyen | Chaque hook doit avoir une responsabilité unique ; pas de hook qui gère roadbook ET médias |
| Réécriture impossible à tester | Critique | Extraire une fonction/test à la fois ; jamais de réécriture totale |
| Auth cassée | Critique | Le guard `if (!user) return null` ne doit jamais être modifié |
| Revalidation cassée | Faible | L'appel `/api/revalidate` est un fire-and-forget, peu risqué |

---

## 19. Cibles mesurables

| Cible | Actuel | Objectif | Sprint |
|-------|--------|----------|--------|
| `page.js` | 1783 lignes | < 400 lignes | 20F |
| `useState` dans page.js | 74 | < 10 | 20D |
| Handlers métier dans page.js | 43 | < 5 | 20E |
| Appels Supabase directs dans composants UI | ~70 | 0 | 20C |
| Composants extraits | 0 | ~12-15 | 20E |
| Hooks spécialisés | 2 | ~8-10 | 20D |
| Fonctions pures testables | 3 | ~20 | 20B |
| Fichier métier > 500 lignes (sans justification) | 3 | 0 | 20F |
| `useEffect` dans page.js | 4 | 0-1 | 20F |

---

## 20. Plan de découpage proposé

### Sprint 20B — Fonctions pures et mappers

| Objectif | Extraire les transformations, validations, calculs |
|----------|---------------------------------------------------|
| Fichiers touchés | Nouveaux : `src/lib/roadbooks/mutations.js`, `src/lib/roadbooks/validators.js` |
| Extractions | `validateGpx`, `resizeImage` → validators ; `buildGpxPath` ; calcul totaux ; construction meta officiel/stagesTotal ; normalisation nombre ; `clearStageForm`/`fillStageForm` en fonctions pures |
| Dépendances | Aucune |
| Risque | Faible |
| Tests | Tests unitaires pour chaque fonction extraite |
| Critère | Toutes les fonctions extraites sont testées ; page.js inchangé |

### Sprint 20C — Couche données Supabase

| Objectif | Centraliser tous les appels Supabase dans des fonctions dédiées |
|----------|---------------------------------------------------------------|
| Fichiers touchés | Nouveaux : `src/lib/roadbooks/loaders.js`, `src/lib/roadbooks/writers.js` |
| Extractions | `loadRoadbook(id)`, `loadStages(id)`, `loadPois(stageIds)`, `loadVariants(stageIds)`, `loadMedia(id)`, `loadGpxRows(id)`, `saveStage(record)`, `savePoi(record)`, `saveVariant(record)`, `deleteStage(id)`, `deletePoi(id)`, `deleteVariant(id)`, `getSignedUrl(bucket, path, expires)`, `revalidateRoadbook(id)` |
| Dépendances | Sprint 20B (pour les mappers) |
| Risque | Moyen — beaucoup de changements |
| Tests | Tests d'intégration Supabase ; vérifier que chaque fonction retourne les bonnes données |
| Critère | `page.js` n'appelle plus `supabase.from(...)` directement |

### Sprint 20D — Hooks de domaine

| Objectif | Extraire les hooks par domaine métier |
|----------|--------------------------------------|
| Fichiers touchés | Nouveaux : `hooks/studio/useRoadbookData.js`, `hooks/studio/useStageCrud.js`, `hooks/studio/useMediaManager.js`, `hooks/studio/useGpxManager.js`, `hooks/studio/useCoverManager.js`, `hooks/studio/useEnrichment.js`, `hooks/studio/useNotifications.js` |
| Extractions | Chaque hook encapsule un domaine + ses appels data (Sprint 20C) + son état |
| Dépendances | Sprint 20C |
| Risque | Élevé — il faut éviter les cycles de dépendances entre hooks |
| Tests | Tests unitaires pour chaque hook (mock Supabase) ; tests manuels complets |
| Critère | `page.js` utilise 8-10 hooks au lieu de 74 `useState` + 43 handlers |

### Sprint 20E — Composants UI

| Objectif | Extraire le JSX en composants isolés |
|----------|-------------------------------------|
| Fichiers touchés | 12-15 nouveaux composants dans `components/studio/` |
| Extractions | Chaque `studio-card` / `studio-zone` devient un composant |
| Dépendances | Sprint 20D (les hooks fournissent les données) |
| Risque | Faible à moyen — risque de props explosion si les hooks ne sont pas bien conçus |
| Tests | Tests visuels ; manuels |
| Critère | `page.js` ne contient que des imports de composants, pas de JSX inline |

### Sprint 20F — Réduction de `page.js`

| Objectif | Finaliser l'orchestration |
|----------|--------------------------|
| Fichiers touchés | `page.js` uniquement |
| Actions | Remplacer les 4 `useEffect` par des hooks explicites ; réduire les guards de rendu ; vérifier que page.js < 400 lignes |
| Dépendances | Sprint 20E |
| Risque | Faible — le plus gros du travail est déjà fait |
| Tests | Tests de non-régression complets |
| Critère | `page.js` < 400 lignes, 0 appel Supabase direct, 0 handler métier majeur |

---

## 21. Stratégie de non-régression

### Après chaque extraction, exécuter :

```bash
node scripts/test-sprint-18d.mjs    # 35/35
node scripts/verify-migration-18c.mjs  # 10/10
npm run build                        # 0 erreur
```

### Tests manuels ciblés par sprint :

| Sprint | Tests manuels |
|--------|---------------|
| 20B | Aucun (fonctions pures uniquement) |
| 20C | Chargement Studio, édition, F5 |
| 20D | Chargement, édition, F5, changement roadbook |
| 20E | Chargement, édition, F5, responsive |
| 20F | Session complète : chargement → édition → F5 → synchronisation → conflit → média → GPX → publication |

---

## 22. Conclusion

### Constats principaux

1. **`page.js` (1783 lignes)** est le fichier le plus problématique du codebase. Il dépasse de loin toute limite raisonnable.
2. **74 `useState`** est un anti-patron majeur. La moitié sont des champs de formulaires qui devraient être groupés.
3. **~70 appels Supabase directs** violent la séparation des responsabilités.
4. **43 handlers** dont certains dépassent 90 lignes, mélangeant UI, métier et persistance.
5. **0 composant extrait** du JSX — tout le rendu est inline.
6. **En revanche**, les couches basses sont bien structurées : `studio-drafts.js` (310 lignes, clair), `sync-helpers.js` (139 lignes, bien isolé), `gpx-metrics.js` (153 lignes, fonctions pures), `enrichment.js` (117 lignes, bien conçu).
7. **`useStudioDraft.js`** (306 lignes) est le seul hook métier. Il est bien conçu mais reçoit trop de props (23).

### Le refactor est nécessaire mais progressif

Le plan en 5 sprints (20B→20F) permet d'extraire la complexité sans jamais casser l'application. Chaque étape est testable, réversible, et apporte une amélioration mesurable.

### Décision

```text
GO pour Sprint 20B — extraction des fonctions pures et mappers.
```

### Fichiers les plus critiques

| Fichier | Lignes | Problème principal | Destination proposée |
|---------|-------:|--------------------|----------------------|
| `dashboard/roadbooks/[id]/page.js` | 1783 | Monolithe : état + UI + data + métier | Découpage en composants + hooks |
| `hooks/useStudioDraft.js` | 306 | Trop de props (23) | Réduire l'interface |
| `lib/studio-drafts.js` | 310 | Bien structuré, à conserver | Inchangé |
