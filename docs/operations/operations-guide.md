# Guide d'exploitation — Roadbook Explorer V2

## Architecture

```
Navigateur → Vercel (Edge + Serverless) → Supabase (PostgreSQL + Auth + Storage)
```

- **Frontend/Backend** : Next.js 16.2.10 (App Router) déployé sur Vercel
- **Base de données** : Supabase PostgreSQL (projet `wuberwxheznzntdyqwyj`)
- **Authentification** : Supabase Auth (email uniquement)
- **Storage** : Supabase Storage (médias, GPX)
- **Déploiement** : Vercel (GitHub integration, branche `v2-next-supabase`)

## Services utilisés

| Service | Usage | URL |
|---------|-------|-----|
| Vercel | Hébergement Next.js | Production : `https://roadbook-explorer-aptzsg8hj-aroblazeurs-projects.vercel.app` |
| Supabase | Base de données, Auth, Storage | `https://wuberwxheznzntdyqwyj.supabase.co` |
| GitHub | Code source, déploiements | `https://github.com/Aroblazeur/roadbook-explorer` |

## Déploiement

Le déploiement est automatique sur Vercel via l'intégration GitHub :
- **Branche** : `v2-next-supabase`
- **Déclencheur** : push sur `v2-next-supabase`
- **Environnement** : Production

### Déploiement manuel

```bash
git push origin v2-next-supabase
```

Vérifier le statut sur le tableau de bord Vercel ou via les GitHub Deployments.

## Variables d'environnement attendues

> Les valeurs réelles sont configurées dans le projet Vercel (Production) et dans `.env.local` en local.

| Variable | Usage | Côté client ? |
|----------|-------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Oui (publique) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase | Oui (publique) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (scripts uniquement) | Non |
| `SUPABASE_DB_URL` | Connexion PostgreSQL directe (scripts uniquement) | Non |

## Vérification de santé

Endpoint : `GET /api/health`

Réponse attendue :
```json
{ "status": "ok", "app": "roadbook-explorer", "database": "ok" }
```

Vérifier avec :
```bash
curl https://roadbook-explorer-aptzsg8hj-aroblazeurs-projects.vercel.app/api/health
```

## Tests disponibles

```bash
# Tests déterministes (35 tests)
node v2/scripts/test-sprint-18d.mjs

# Vérification migration
node v2/scripts/verify-migration-18c.mjs

# Build
cd v2 && npm run build
```

## Logs

- **Vercel** : Tableau de bord Vercel → Deployments → Production → Logs
  - Runtime logs, Function logs, Edge logs
- **Supabase** : Dashboard Supabase → Logs
  - Auth logs, API logs, Database logs
- **GitHub** : Actions / Deployments

## Incidents courants

### Expiration de session

**Symptôme** : L'utilisateur est redirigé vers `/login` sans raison apparente.

**Cause** : Le cookie de session Supabase a expiré (durée par défaut : 3600s).

**Solution** : Re-connexion via le formulaire de login.

### Erreur Supabase (4xx/5xx)

**Symptôme** : Les données ne chargent pas, message d'erreur en console.

**Vérification** :
1. Statut de Supabase : https://status.supabase.com
2. Logs d'API dans le dashboard Supabase
3. Vérifier les RLS policies si erreur 401/403

**Solution** : Selon l'erreur — attendre le rétablissement, corriger la RLS, ou contacter le support.

### Erreur Storage (upload échoué)

**Symptôme** : Impossible d'uploader une image ou un GPX.

**Vérification** :
1. Taille du fichier (max 10 Mo pour les images)
2. Type MIME autorisé (image/png, image/jpeg, image/webp, application/gpx+xml)
3. Permissions Storage (RLS)
4. Espace de stockage disponible

**Solution** : Réduire le fichier, vérifier les policies Storage.

### Conflit de synchronisation

**Symptôme** : L'utilisateur reçoit un message "conflit" après synchronisation.

**Explication** : Un autre onglet ou session a modifié le roadbook entre-temps.

**Solution** : Recharger la version distante (le brouillon local est conservé).

## Procédures de sauvegarde

### Exporter les données Supabase

Utiliser `pg_dump` :
```bash
pg_dump "postgresql://postgres.wuberwxheznzntdyqwyj:...@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  --data-only --table=roadbooks --table=stages --table=media > backup-$(date +%F).sql
```

### Sauvegarder Storage

Télécharger les fichiers depuis le dashboard Supabase → Storage, ou utiliser l'API.

**Note** : Le plan Supabase utilisé peut ne pas inclure de backup automatique. Vérifier les options de backup disponibles dans le dashboard Supabase (Project Settings → Database → Backups).

### Restaurer une table

```bash
psql "postgresql://postgres.wuberwxheznzntdyqwyj:...@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" < backup.sql
```

### Restaurer un roadbook supprimé

Un roadbook supprimé peut être récupéré depuis :
1. Une sauvegarde de base de données (ci-dessus)
2. Un brouillon exporté par l'utilisateur (fichier JSON sauvegardé localement)

**Limitation** : Sans backup préalable, la récupération est impossible.

## Rollback

### Rollback Vercel

1. Dashboard Vercel → Deployments
2. Identifier un déploiement stable antérieur
3. Cliquer sur "..." → "Promote to Production"
4. Vérifier que les variables d'environnement sont toujours configurées
5. Vérifier que le callback Auth Supabase correspond toujours à l'URL

### Rollback Git

```bash
# Identifier le commit stable
git log --oneline -5 origin/v2-next-supabase

# Créer un revert (pas un reset destructif sur branche partagée)
git revert HEAD --no-edit
git push origin v2-next-supabase
```

### Rollback base de données

Pour la migration 18C (`20260711-003-roadbook-updated-at-cascade.sql`) :

```sql
-- Supprimer le trigger
DROP TRIGGER IF EXISTS set_updated_at_on_stages ON public.stages;
DROP TRIGGER IF EXISTS set_updated_at_on_media ON public.media;

-- Supprimer la fonction
DROP FUNCTION IF EXISTS public.set_updated_at();

-- Revenir aux valeurs précédentes si nécessaire
```

**Attention** : Ne pas exécuter automatiquement un rollback destructif sans vérification préalable.

## Contact technique

Propriétaire du dépôt : `Aroblazeur`
