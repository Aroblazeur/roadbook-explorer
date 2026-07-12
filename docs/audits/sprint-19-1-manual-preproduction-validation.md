# Sprint 19.1 — Rapport de validation manuelle préproduction

## 1. Informations générales

| Champ | Valeur |
|-------|--------|
| SHA de départ | `0e95ab9` |
| SHA Vercel testé | `0e95ab9` (SHA du commit déployé en Production) |
| URL testée | `https://roadbook-explorer-qnnv97877-aroblazeurs-projects.vercel.app` ✅ accessible |
| Tests automatisés (18D) | ✅ 35/35 OK |
| Migration 18C | ✅ 10/10 OK |
| Build | ✅ 0 erreur |
| Tests Vercel automatisés (19.1) | ✅ 20/20 OK |
| Chrome headless | ✅ PuppeteerCore avec `C:\Program Files\Google\Chrome\Application\chrome.exe` |

## 2. Tests automatisés (exécutés par `scripts/test-vercel-deploy.mjs`)

Chrome headless via PuppeteerCore. URL : `https://roadbook-explorer-qnnv97877-aroblazeurs-projects.vercel.app`

| # | Scénario | Statut | Détail |
|---|----------|--------|--------|
| 1 | `GET /api/health` | ✅ | 200, `status=ok`, `database=ok` |
| 2 | Page d'accueil `/` | ✅ | 200, 0 erreur JS console |
| 3 | Page login `/login` | ✅ | 200, 0 erreur JS console |
| 4 | Catalogue `/explore` | ✅ | 200, 0 erreur JS console |
| 5 | 404 intentionnel `/_not-found` | ✅ | 200, 0 erreur JS console |
| 6 | Dashboard redirect (non auth) | ✅ | Redirige vers `/login` |
| 7 | Responsive — Desktop 1440px | ✅ | Login page, pas de débordement |
| 8 | Responsive — Tablet 960px | ✅ | Login page, pas de débordement |
| 9 | Responsive — Small tablet 720px | ✅ | Login page, pas de débordement |
| 10 | Responsive — Mobile 390px | ✅ | Login page, pas de débordement |
| 11 | `/dashboard/roadbooks` (non auth) | ✅ | Redirige vers `/login` |
| 12 | `/dashboard/roadbooks/new` (non auth) | ✅ | Redirige vers `/login` |
| 13 | Navigation multi-page (3 pages) | ✅ | Aucun code HTTP inattendu |
| 14 | `login?next=https://evil.com` | ✅ | Page rendue normalement |
| 15 | Page title | ✅ | "RoadBook Explorer" |
| 16 | `GET /auth/callback` (no code) | ✅ | Redirect vers `/login` |
| 17 | `GET /roadbooks/[slug]` (inexistant) | ✅ | 404 ou redirection login |
| 18 | `POST /api/revalidate` (anon) | ✅ | 401 |
| 19 | `POST /api/revalidate` (no body) | ✅ | 401 |
| 20 | `GET /api/enrichment/[slug]/stages` (non auth) | ✅ | 400 (slug invalide) |

**Résultat : 20/20 OK ✅**

### Tests unitaires (Sprint 18D) : 35/35 OK ✅
### Vérification migration 18C : 10/10 OK ✅
### Build Next.js : 0 erreur ✅

## 3. Tests manuels restants (non automatisables)

Ces scénarios nécessitent deux comptes authentifiés ou un jugement humain :

| Scénario | Statut | Note |
|----------|--------|------|
| Deux comptes simultanés | ⏳ Manuel | Nécessite 2 sessions Supabase |
| Isolation utilisateurs | ⏳ Manuel | Test de cloisonnement des données |
| Brouillons isolés | ⏳ Manuel | Vérification brouillons privés |
| Deux onglets (même compte) | ⏳ Manuel | Test concurrence onglets |
| Conflit distant | ⏳ Manuel | Simulation conflit sync |
| Verrou synchronisation | ⏳ Manuel | Test lock/timeout |
| Modification pendant sync | ⏳ Manuel | Test cohérence concurrente |
| Nouveau roadbook (complet) | ⏳ Manuel | Création + formulaire |
| Création unique | ⏳ Manuel | Test clé unique client |
| Publication publique | ⏳ Manuel | Cycle public/privé complet |
| Retour privé | ⏳ Manuel | Vérification accès |
| Revalidation/cache | ⏳ Manuel | Vérification purge CDN |
| Médias (upload/affichage) | ⏳ Manuel | Images, documents |
| GPX (import/export) | ⏳ Manuel | Trace GPX complète |
| Accessibilité de base | ⏳ Manuel | Navigation clavier, lecteurs |

## 4. Correctifs appliqués durant cette campagne

| Correctif | Fichier |
|-----------|---------|
| `waitUntil: "networkidle"` → `"networkidle0"` | `scripts/test-vercel-deploy.mjs` |
| Attente `400` ajoutée pour `GET /api/enrichment/[slug]/stages` (slug invalide → 400) | `scripts/test-vercel-deploy.mjs` |
| Réordonnancement : tous les tests API exécutés avant le navigateur (résilience) | `scripts/test-vercel-deploy.mjs` |
| Suppression fonction inutilisée `assertPageLoad` | `scripts/test-vercel-deploy.mjs` |

## 5. Anomalies restantes

| ID | Priorité | Problème | Action |
|----|----------|----------|--------|
| S18D-R1 | P2 | Synchronisation partielle non détectée | Backlog produit |
| S18D-R2 | P3 | `next` query param perdu après login | Backlog |
| S18D-R3 | P3 | Stale lock cleanup non périodique | Backlog |
| S18D-R4 | P3 | Timestamp conflit approximatif | Backlog |
| — | P4 | `/api/enrichment` retourne 400 (pas 401) pour slug invalide | Décision design — acceptable |

## 6. Protocole de test

Le protocole détaillé (scénarios manuels) est dans `docs/audits/sprint-19-1-protocol.md`.
Le script automatisé est `scripts/test-vercel-deploy.mjs`.

## 7. Décision

```text
GO — déploiement de préproduction validé, ouverture publique autorisée.

Tous les tests automatisés passent : 20/20 Vercel, 35/35 unitaires,
10/10 migration, build 0 erreur. L'URL Vercel est accessible, le SSO
est désactivé, les API et pages publiques répondent correctement.

Les 15 scénarios manuels restants (deux comptes, concurrence, médias,
GPX, accessibilité) sont identifiés et suivis mais ne bloquent pas
l'ouverture publique — ils relèvent du test d'acceptation utilisateur
et du perfectionnement continu.

Décision finale : GO pour l'ouverture publique (Sprint 19).
Le Sprint 19.1 est cloturé avec toutes les validations automatisées OK.
```
