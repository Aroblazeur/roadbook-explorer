# Roadbook Explorer V2

Nouvelle version de Roadbook Explorer basée sur **Next.js** (App Router) + **Supabase**.

Indépendante de la version GitHub Pages actuelle (dossier racine).

## Prérequis

- Node.js 24+
- npm 11+

## Configuration Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Aller dans **Project Settings → API**
3. Copier l'URL du projet et la clé `anon` publique
4. Aller dans **SQL Editor** et exécuter `supabase/schema.sql`

```bash
cd v2
cp .env.example .env.local
```

Éditer `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

## Lancer en local

```bash
cd v2
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Pages disponibles

| Route                               | Description                                          |
|-------------------------------------|------------------------------------------------------|
| `/`                                 | Page d'accueil                                       |
| `/explore`                          | Galerie publique des roadbooks                       |
| `/login`                            | Connexion / inscription (email + mot de passe)       |
| `/dashboard`                        | Tableau de bord (réservé aux utilisateurs connectés) |
| `/dashboard/roadbooks`              | Liste des roadbooks de l'utilisateur                 |
| `/dashboard/roadbooks/[id]`         | Détail / édition d'un roadbook + étapes              |
| `/roadbooks/[slug]`                 | Page publique/privée de consultation roadbook        |

## Fonctionnalités MVP

- [x] Authentification email + mot de passe (Supabase Auth)
- [x] Création, édition, suppression de roadbooks
- [x] Création, édition, suppression d'étapes
- [x] Visibilité public / privé par roadbook
- [x] Galerie publique `/explore`
- [x] Page de consultation `/roadbooks/[slug]`
- [x] Row Level Security (public / owner)
- [x] Détection et contournement des slugs en double
- [ ] Médias / photos (GPX, upload)
- [x] POI et variantes d'étape
- [ ] Upload GPX vers Storage
- [ ] Recherche avancée

## Structure du projet

```
v2/
├── .env.example                 # Variables d'environnement attendues
├── next.config.mjs
├── package.json
├── supabase/
│   ├── schema.sql               # Schéma SQL (tables + RLS)
│   └── README.md                # Instructions SQL
├── src/
│   ├── app/
│   │   ├── layout.js            # Layout racine + AuthProvider
│   │   ├── page.js              # Accueil
│   │   ├── explore/page.js      # Galerie publique
│   │   ├── login/page.js        # Login / inscription
│   │   ├── dashboard/
│   │   │   ├── page.js          # Dashboard protégé
│   │   │   └── roadbooks/
│   │   │       ├── page.js      # Liste + création roadbook
│   │   │       └── [id]/page.js # Détail + étapes roadbook
│   │   └── roadbooks/
│   │       └── [slug]/page.js   # Consultation publique/privée
│   └── lib/
│       ├── supabase.js          # Client navigateur
│       ├── supabase-server.js   # Client serveur
│       └── auth-context.js      # Contexte authentification
└── README.md
```

## Tester login / logout

1. Lancer l'app : `npm run dev`
2. Aller sur `/login`
3. Saisir un email et mot de passe, cliquer **Créer un compte**
4. Vérifier l'email de confirmation si nécessaire
5. Se connecter
6. Naviguer dans le dashboard, créer un roadbook, ajouter des étapes
7. Basculer en public si souhaité
8. Voir le roadbook sur `/roadbooks/[slug]`
9. Cliquer **Se déconnecter** dans le dashboard

## Import V1 → V2

Un script d'import permet de migrer un roadbook V1 (format `roadbooks/<slug>/roadbook.json`) vers Supabase.

### Utilisation

```bash
cd v2
node scripts/import-v1-roadbook.js --slug perinexus --dry-run
node scripts/import-v1-roadbook.js --slug perinexus --owner-email user@example.com
```

### Options

| Option | Description |
|--------|-------------|
| `--slug <id>` | Slug du roadbook V1 (dossier dans `roadbooks/`) |
| `--dry-run` | Mode lecture seule : affiche les compteurs et champs non mappés |
| `--owner-email <email>` | Email du propriétaire Supabase (obligatoire pour l'import réel) |
| `--upsert` | Met à jour les enregistrements existants au lieu de les ignorer |

### Prérequis

- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` (clé service_role depuis Supabase → Settings → API)
- La clé service_role ne doit **jamais** être committée

### Mapping V1 → V2

| Entité V1 | Table V2 | Notes |
|-----------|----------|-------|
| `roadbook.json` racine | `roadbooks` | `id` → `slug`, `metadata.*` → `metadata` JSONB |
| `stages[]` | `stages` | `stage` → `stage_number`, `noteItems`/`notes`/`warning` → `notes` JSONB |
| `stages[].substeps[]` | `stage_variants` | Champs spécifiques stockés dans `metadata` JSONB si colonnes absentes |
| `stages[].pois[]` / `pointsOfInterest[]` / `interest[]` | `stage_pois` | Dédupliqués par nom + enrichis via `poi-enrichment.json` |
| `stages[].accommodation.*` | `stages.accommodation_*` | Nom, URL, photo, type |
| `stages[].accommodation.alternatives[]` | `stages.alternatives` JSONB | |

## État actuel

- [x] POI et variantes d'étape (import et dashboard)
- [ ] Médias / photos (GPX upload, Supabase Storage)

### Non migré (pour une future itération)

- Upload des fichiers GPX vers Supabase Storage (chemins conservés dans `gpx_url`)
- Upload des images vers Supabase Storage (URLs existantes conservées)
- Création d'enregistrements dans la table `media`
- Top-level `variants[]` (données redondantes avec `stages[].substeps[]`)
- Top-level `accommodation[]` (données redondantes avec les étapes individuelles)

## Déploiements Vercel

| Commit | Sprint | Description | Déploiement |
|--------|--------|-------------|-------------|
| `d63a6df` | Sprint 15C | Dashboard Studio : refonte UI + JSX + build fix | (à confirmer) |
| `f6b6c90` | — | trigger Sprint 15B | (à confirmer) |
| `d130077` | Sprint 15B | UI Studio/Explorer complète | (à confirmer) |
| `517ee84` | Sprint 15A | Reprise champs variantes + présentation publique | (à confirmer) |
| `b6576ca` | Sprint 14C | Section automatisations | en ligne |
