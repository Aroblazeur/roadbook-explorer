# Note technique — Données traitées

Cette note décrit les données collectées, stockées et traitées par Roadbook Explorer V2.
Elle n'a pas valeur de politique juridique. Une validation légale est requise avant ouverture publique large.

## Données collectées

| Type | Emplacement | Durée de conservation |
|------|-------------|----------------------|
| Adresse email | Supabase Auth (table `auth.users`) | Jusqu'à suppression du compte |
| Roadbooks (contenu) | Supabase PostgreSQL (table `roadbooks`, `stages`, `media`) | Jusqu'à suppression par l'utilisateur |
| Photos / images | Supabase Storage | Jusqu'à suppression par l'utilisateur |
| Fichiers GPX | Supabase Storage | Jusqu'à suppression par l'utilisateur |
| Brouillons | LocalStorage du navigateur | Jusqu'à synchronisation ou effacement manuel |
| Logs d'application | Vercel Runtime Logs | 7 jours (rétention Vercel) |
| Logs d'authentification | Supabase Auth Logs | Dépend du plan Supabase |

## Données NON collectées

- Aucune donnée de localisation (hors GPX uploadé volontairement par l'utilisateur)
- Aucun cookie tiers
- Aucun tracker analytique
- Aucune donnée de navigation en dehors de l'application

## Accès aux données

- Les roadbooks privés ne sont accessibles qu'à leur propriétaire (RLS Supabase)
- Les roadbooks publics sont accessibles en lecture à tous
- L'administrateur technique n'a pas accès aux contenus privés sauf via la base de données (accès direct possible avec la clé `service_role`)

## Actions recommandées avant ouverture publique

- [ ] Rédiger une politique de confidentialité conforme au RGPD
- [ ] Rédiger des conditions d'utilisation
- [ ] Ajouter une page `/privacy` accessible depuis le pied de page
- [ ] Ajouter un lien vers les CGU
- [ ] Permettre l'export des données utilisateur
- [ ] Permettre la suppression complète du compte et des données associées
