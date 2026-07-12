# Sprint 18D — Rapport d'audit final du parcours utilisateur

## Périmètre validé

### Code et configuration

- **Sprint 18C** appliqué au commit `e2a9507` sur `v2-next-supabase`
- **Migration 18C distante** (`20260711-003-roadbook-updated-at-cascade.sql`) exécutée dans Supabase SQL Editor et vérifiée par `scripts/verify-migration-18c.mjs` : **10/10 OK**
- **Build Next.js** : 0 erreur, 0 avertissement TypeScript
- **Script de test déterministe** `scripts/test-sprint-18d.mjs` : **35/35 tests réussis** (snapshots, conditional update, verrous de synchronisation, clés de brouillon et isolation utilisateur, new/existing drafts, verifyAfterSync, export, sanitizeNextPath)

### Correctifs appliqués

| Priorité | Problème | Correctif |
|----------|----------|-----------|
| P1 | Open redirect via paramètre `next` non assaini dans `auth/callback/route.js` | Ajout de `sanitizeNextPath()` — seul un chemin relatif interne est accepté |
| P1 | Clé `sb_secret_*` hardcodée dans `scripts/audit-18a.mjs` (fichier non tracké) | `.gitignore` étendu — blocage de `scripts/audit-*`, `scripts/test-pup*`, `dev-server.log`, `validation/` |
| P2 | Détection de synchronisation partielle | Documenté — pas de correctif immédiat (nécessite une décision produit) |

### Infrastructure de vérification

- `scripts/verify-migration-18c.mjs` réécrit pour utiliser `pg` + `dotenv` + `SUPABASE_DB_URL` au lieu de l'API REST Supabase
- `v2/package.json` : ajout des devDependencies `pg` et `dotenv`

## Décision : GO CONDITIONNEL

Tous les tests automatisés et statiques passent. Aucun blocage P0. Les deux issues P1 sont corrigées.

La mise en production est autorisée **sous réserve** de la validation manuelle des scénarios suivants, qui n'ont pas été automatisés et n'ont pas été exécutés dans le cadre de ce sprint :

### Scénarios à valider manuellement

1. **Isolation avec deux comptes réels** — vérifier que les données d'un utilisateur ne sont jamais visibles par un autre (inscription + navigation croisée)
2. **Conflit distant dans deux onglets ou sessions** — ouvrir le même roadbook dans deux onglets, modifier simultanément, vérifier le comportement de détection de conflit
3. **Modification pendant une synchronisation avec latence réelle** — ralentir la connexion (DevTools) et modifier un roadbook pendant que la synchronisation est en cours
4. **Cycle public → privé sur Vercel** — basculer un roadbook de public à privé et inversement, vérifier les accès après déploiement
5. **Médias et GPX en conditions réelles** — uploader des images, fichiers GPX, et pièces jointes volumineuses ; vérifier le comportement en limite de taille
6. **Responsive et accessibilité manuels** — tester la navigation au clavier, lecteur d'écran, et les breakpoints mobile/tablette/desktop

## Résumé des artefacts

| Artefact | Emplacement |
|----------|-------------|
| Rapport d'audit | `docs/audits/sprint-18d-final-user-journey.md` |
| Tests déterministes | `v2/scripts/test-sprint-18d.mjs` |
| Vérificateur de migration | `v2/scripts/verify-migration-18c.mjs` |
| Correctif open redirect | `v2/src/app/auth/callback/route.js` |
| Configuration .gitignore | `v2/.gitignore` |
| Commit Sprint 18D | `53d9789` sur `v2-next-supabase` |
