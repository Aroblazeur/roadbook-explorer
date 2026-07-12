# Checklist de lancement public — Roadbook Explorer V2

## Déploiement

- [ ] Commit `6d46305` (Sprint 18D) ou ultérieur déployé en Production
- [ ] SHA déployé Vercel correspond au commit attendu
- [ ] Build Vercel réussi (0 erreur)
- [ ] Variables d'environnement Vercel configurées (Production)
  - `NEXT_PUBLIC_SUPABASE_URL` — présent
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — présent
  - Aucune clé `service_role` exposée
  - Aucune chaîne PostgreSQL dans le bundle

## Authentification Supabase

- [ ] Site URL = URL Vercel de production
- [ ] Redirect URLs incluent URL Vercel
- [ ] Redirect URLs incluent `http://localhost:3000` (dev local)
- [ ] Anciennes URLs GitHub Pages supprimées si non utilisées
- [ ] Callback `/auth/callback` fonctionnel
- [ ] `next` paramètre correctement assaini

## Migration

- [ ] Migration 18C appliquée (`20260711-003-roadbook-updated-at-cascade.sql`)
- [ ] Vérification 10/10 OK (`scripts/verify-migration-18c.mjs`)

## Build & tests

- [ ] `npm run build` réussi (0 erreur, 0 avertissement TS)
- [ ] `scripts/test-sprint-18d.mjs` : 35/35 OK
- [ ] Lint OK (si configuré)

## Comptes réels

- [ ] Utilisateur A et B créés
- [ ] A possède un roadbook privé — B ne peut pas le voir ni l'éditer
- [ ] Brouillons isolés entre A et B
- [ ] Roadbook public de A visible par B en lecture seule
- [ ] Aucune fuite de données entre comptes

## Catalogue et public/privé

- [ ] Roadbook privé absent du catalogue public
- [ ] Passage en public : visible en navigation privée
- [ ] Retour en privé : disparition du catalogue
- [ ] Ancienne URL publique ne révèle aucun contenu sans connexion
- [ ] Cycle testé sur Vercel (pas seulement en local)

## Conflits et synchronisation

- [ ] Conflit distant détecté (deux onglets)
- [ ] Verrou de synchronisation fonctionnel
- [ ] Modification pendant sync : donnée locale conservée
- [ ] Brouillon non supprimé après conflit

## Nouveau roadbook

- [ ] Création avec restauration après F5
- [ ] Double clic évité (une seule ligne créée)
- [ ] Migration clé `new:` après création
- [ ] Redirection correcte vers le Studio
- [ ] Slug unique généré

## Médias

- [ ] Upload image fonctionnel
- [ ] Affichage immédiat et après rechargement
- [ ] Remplacement et suppression
- [ ] Erreur réseau gérée
- [ ] Fichier volumineux limité
- [ ] Objets Storage isolés par utilisateur

## GPX

- [ ] Upload GPX valide
- [ ] Tracé sur carte avec `fitBounds`
- [ ] Rechargement et téléchargement
- [ ] Remplacement et suppression
- [ ] Fallback si erreur

## Responsive

- [ ] 1440 px : mise en page complète
- [ ] 960 px : pas de débordement
- [ ] 720 px : navigation adaptable
- [ ] 390 px : mobile fonctionnel
- [ ] Mode sombre (si implémenté)

## Accessibilité

- [ ] Navigation clavier (Tab, Shift+Tab, Entrée, Échap)
- [ ] Focus visible
- [ ] Titres H1/H2 présents
- [ ] Labels sur tous les champs
- [ ] Messages d'erreur lisibles
- [ ] Contraste suffisant
- [ ] Images avec `alt`
- [ ] Liens explicites

## Observabilité

- [ ] Endpoint `/api/health` accessible
- [ ] Logs Vercel consultables
- [ ] Erreurs JavaScript et API visibles dans les logs
- [ ] Aucun secret dans les logs

## Sauvegarde

- [ ] Procédure d'export Supabase documentée
- [ ] Backup Storage documenté
- [ ] Restauration table/roadbook documentée
- [ ] Récupération brouillon exporté documentée

## Rollback

- [ ] Procédure rollback Vercel documentée
- [ ] Procédure rollback Git documentée
- [ ] SQL inverse pour rollback migration documenté
- [ ] Commit stable de référence : `6d46305`

## Nettoyage

- [ ] Roadbooks AUDIT de test identifiés
- [ ] Comptes de test identifiés
- [ ] Médias/GPX de test identifiés
- [ ] Fichiers locaux (logs, captures) ignorés par Git

## Décision

- [ ] Aucun P0
- [ ] Aucun P1 bloquant
- [ ] Aucun secret exposé
- [ ] Checklist complète
- [ ] Rapport final `docs/audits/sprint-19-public-launch-readiness.md` rédigé
