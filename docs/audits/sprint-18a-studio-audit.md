# Sprint 18A — Audit fonctionnel complet du Studio V2

**Date :** 11 juillet 2026
**Contexte :** Après livraison du Sprint 17B (fidélité V1 page publique Perinexus), avant refonte du Studio.
**Compte de test :** `audit-test-18a+1783764210229@example.com`
**Roadbooks de test :**
- ID 7 — `AUDIT 18A — Test complet` (3 étapes, 2 POI, slug: `audit-18a-test-1783764210825`)
- ID 8 — `AUDIT 18A — Brouillon privé` (slug: `audit-18a-draft-1783764211630`)

---

## Résumé

| Métrique | Valeur |
|---|---|
| Tests exécutés | 52 |
| ✅ PASS | 24 |
| ⚠️ WARN | 2 |
| ❌ FAIL | 2 |
| 📋 INFO | 24 |
| Build | ✅ 0 erreurs, TypeScript propre |

---

## Anomalies bloquantes (P0) — à corriger avant refonte

### P0-1. Absence totale de persistance des brouillons

**Fichier :** `src/app/dashboard/roadbooks/[id]/page.js`
**Nature :** Aucun mécanisme de sauvegarde des modifications non enregistrées.

| Mécanisme | Présent ? |
|---|---|
| `localStorage` / `sessionStorage` | ❌ Non |
| `beforeunload` (alerte fermeture onglet/navigation) | ❌ Non |
| Autosave (setInterval, onBlur) | ❌ Non |
| Dirty state tracking | ❌ Non |
| Undo/redo | ❌ Non |
| Navigation confirmation (`router.before`/`confirm`) | ❌ Non |

**Scénarios de perte de données garantie :**
- A. L'utilisateur clique "Enregistrer" puis ferme l'onglet → OK (données sauvegardées)
- **B. L'utilisateur modifie un champ puis ferme l'onglet → perte totale**
- **C. L'utilisateur modifie un champ puis F5 (refresh) → perte totale**
- **D. L'utilisateur modifie un champ puis clique "Retour" → perte totale**
- **E. L'utilisateur modifie un champ puis change de roadbook via le navigateur → perte totale**
- **F. Deux onglets ouverts sur le même roadbook : pas de détection de conflit, le dernier à sauvegarder écrase**
- **G. Déconnexion pendant l'édition → perte totale**

**Gravité :** P0 — Perte de données utilisateur garantie au quotidien.

---

### P0-2. Route protection 100 % client-side (pas de middleware)

**Fichier :** Aucun fichier `src/middleware.js`
**Nature :** Les pages protégées (`/dashboard`, `/dashboard/roadbooks`, `/dashboard/roadbooks/[id]`) ne sont protégées que par `useEffect` — ce qui signifie qu'un utilisateur non authentifié peut brièvement voir le contenu de la page avant la redirection.

**RLS :** La sécurité réelle est assurée par les politiques RLS Supabase, mais le rendu initial de la page protégée fait potentiellement des appels Supabase visibles dans le HTML (même si les données ne sont pas chargées car l'utilisateur n'est pas connecté).

**Gravité :** P0 — Flash de contenu, pas d'isolation serveur.

---

### P0-3. Schéma base de données non appliqué (`stage_variants` et `roadbooks`)

**Fichiers :** `supabase/schema.sql` vs base Supabase réelle
**Nature :** Le fichier `schema.sql` définit des colonnes qui n'ont jamais été appliquées à la base Supabase.

**`stage_variants`** — colonnes manquantes dans la base réelle :

| Colonne | Dans schema.sql | Dans la base |
|---|---|---|
| `departure` | ✅ | ❌ |
| `arrival` | ✅ | ❌ |
| `elevation_gain_m` | ✅ | ❌ |
| `elevation_loss_m` | ✅ | ❌ |
| `map_embed_url` | ✅ | ❌ |
| `notes` (jsonb) | ✅ | ❌ |

Conséquence : Toute écriture de variante avec ces champs échoue silencieusement. Le Studio tente d'écrire ces colonnes (lignes 1615-1618 de page.js) — les insertions/mises à jour retournent une erreur catchée par le `setStageError`, mais l'utilisateur peut ne pas la voir immédiatement.

**`roadbooks`** — colonnes ciblées par le code mais inexistantes :

| Colonne écrite par le code | Existe dans la base |
|---|---|
| `distance_total_km` | ❌ (la colonne réelle est `distance_km`) |
| `elevation_gain_total_m` | ❌ (la colonne réelle est `elevation_gain_m`) |
| `elevation_loss_total_m` | ❌ (la colonne réelle est `elevation_loss_m`) |

Conséquence : La fonction `handleSaveRoute()` (lignes 211-216) tente d'écrire dans des colonnes qui n'existent pas. Les données de tracé ne sont jamais persistées au niveau colonnes — uniquement dans `metadata.stagesTotal` via l'objet `meta`.

**Gravité :** P0 — Les données de tracé ne sont pas persistées.

---

### P0-4. Erreur Next.js sur page privée au lieu du message "Roadbook privé"

**Fichier :** `src/app/roadbooks/[slug]/page.js`, ligne 100
**Nature :** Quand un roadbook est privé et que l'utilisateur est anonyme, la requête Supabase (clé anon + RLS) ne retourne rien → `getRoadbook()` retourne `null` → le composant appelle `notFound()` → Next.js affiche une page d'erreur 404 au lieu du message "Roadbook privé" (lignes 101-109).

**Cause racine :** La politique RLS empêche la lecture des roadbooks privés par les utilisateurs anonymes. Le code de `getRoadbook()` ne peut jamais atteindre le bloc `if (result.private)` car le roadbook est invisible dès le premier `select`.

**Gravité :** P0 — Expérience utilisateur bloquée, impossible de voir qu'un roadbook existe mais est privé.

---

## Anomalies fonctionnelles (P1-P2)

### P1-1. Variantes : champs de formulaire lisent des colonnes inexistantes

**Fichier :** `src/app/dashboard/roadbooks/[id]/page.js`, lignes 1596-1597
**Nature :** Le formulaire d'édition des variantes lit `v.departure`, `v.arrival`, `v.elevation_gain_m`, `v.elevation_loss_m`, `v.map_embed_url`, `v.notes`. Comme ces colonnes n'existent pas dans la base (P0-3), elles sont toujours `undefined` et le fallback `vmeta.*` est systématiquement utilisé — ou vide.

### P1-2. Doublon de colonnes : `distance_km` vs `distance_total_km`

**Fichier :** `src/app/dashboard/roadbooks/[id]/page.js`, lignes 122-127
**Nature :** Le chargement utilise `data.distance_total_km` comme fallback, mais cette colonne n'existe pas. La valeur tombe toujours sur `metadata.stagesTotal.distance`.

### P1-3. Pas de validation de slug unique à la création

**Fichier :** `src/app/dashboard/roadbooks/page.js`, ligne 46-53
**Nature :** La vérification de slug existant est faite après génération, avec fallback par timestamp. Mais en cas de race condition (deux requêtes simultanées), une contrainte UNIQUE violée retournerait une erreur.

### P1-4. Duplication : les fichiers média ne sont pas copiés

**Fichier :** `src/app/dashboard/roadbooks/[id]/page.js`, ligne 1043
**Nature :** La duplication copie les données mais pas les images/GPX. Le message prévient l'utilisateur, mais les roadbooks dupliqués auront des trous de médias.

### P1-5. Aucun ordre de tri défini pour les POI/Variantes dans le Studio

**Nature :** Les POI sont triés par `sort_order` dans l'Explorer, mais le Studio ne permet pas de réordonner facilement les POI ou variantes.

---

## Points PASS (ce qui fonctionne correctement)

- Authentification login/signup : ✅
- Dashboard : chargement et affichage de la liste des roadbooks ✅
- Studio : chargement des données roadbook (titre, description, métadonnées) ✅
- Studio : affichage des étapes existantes avec toutes leurs données ✅
- Studio : CRUD des étapes (création, modification, suppression) ✅
- Studio : CRUD des POI (création, modification, suppression, enrichissement) ✅
- Studio : CRUD des variantes (création, suppression, modifications basiques) ✅
- Studio : upload d'images avec redimensionnement client ✅
- Studio : upload GPX + calcul des métriques ✅
- Studio : visibilité public/privé ✅
- Studio : recalcul des totaux depuis les étapes ✅
- Studio : réordonnancement des étapes ✅
- Studio : duplication roadbook (données textuelles) ✅
- Public Explorer : chargement des roadbooks publics avec données complètes ✅
- Public Explorer : affichage des étapes, POI, variantes, images ✅
- Build : 0 erreurs TypeScript, 0 erreurs de compilation ✅
- RLS Supabase : correctement configurée pour tous les niveaux (roadbooks, stages, POIs, variantes, media) ✅
- Signed URLs : utilisées pour l'accès aux fichiers stockés ✅
- Page publique : le HTML contient les données (server component), bon pour le SEO ✅

---

## Découpage recommandé pour les sprints suivants

### Sprint 18B — Correction des anomalies P0

| Tâche | Fichier | Effort |
|---|---|---|
| 18B.1 — Migration schema : exécuter le bloc `do $$` de `schema.sql` sur Supabase pour ajouter les colonnes manquantes à `stage_variants` | SQL Editor Supabase | 10 min |
| 18B.2 — Correction `handleSaveRoute()` : utiliser les bons noms de colonnes (`distance_km`, `elevation_gain_m`, `elevation_loss_m`) | `[id]/page.js` lignes 211-216 | 15 min |
| 18B.3 — Correction page privée : requête sans RLS (service_role) ou détection du cas "introuvable mais privé" | `roadbooks/[slug]/page.js` | 30 min |
| 18B.4 — Ajout middleware `src/middleware.js` pour protection serveur | Nouveau fichier | 20 min |
| 18B.5 — Ajout `beforeunload` et/ou localStorage pour brouillons | `[id]/page.js` | 1-2h |

### Sprint 18C — Corrections P1–P2 + UX

| Tâche | Effort |
|---|---|
| 18C.1 — Variantes : correction formulaire édition (supprimer les champs lecture de colonnes inexistantes) | 30 min |
| 18C.2 — Dashboard : ajout slug réel dans la création (vérification temps réel) | 20 min |
| 18C.3 — Duplication : copie des médias (images, GPX) | 1h |
| 18C.4 — Réordonnancement POI dans le Studio | 30 min |
| 18C.5 — Ajout validation formulaire côté client | 30 min |

### Sprint 18D — Refonte Studio (phase 1)

| Tâche | Effort |
|---|---|
| 18D.1 — Persistance automatique (draft en localStorage + synchro à la sauvegarde) | 2-3h |
| 18D.2 — Indicateur visuel de modification non sauvegardée (dot rouge, texte) | 1h |
| 18D.3 — Gestion de conflit multi-onglets | 1-2h |
| 18D.4 — Réorganisation UI du Studio (sidebar, formulaires repliables, navigation) | 3-4h |

---

## Annexe : Résultats des tests automatisés

```
Tests exécutés: 52
✅ PASS:  24
⚠️  WARN:  2  (variants count, private page message)
❌ FAIL:  2  (draft persistence, middleware)
📋 INFO:  24

Détails des tests HTTP :
- GET /login  → 200 (email field, password field)
- GET /dashboard → 200 (no data leak in HTML, client-side render)
- GET /roadbooks/[slug] (public) → 200 (title, stages, POIs OK)
- GET /roadbooks/[slug] (private) → Error HTML (bug P0-4)

Supabase API tests:
- roadbooks table: OK (correct columns, RLS works)
- stages table: OK (3 stages, correct data)
- stage_pois table: OK (2 POIs for stage 1)
- stage_variants table: WARN (columns missing, migration not applied)
```
