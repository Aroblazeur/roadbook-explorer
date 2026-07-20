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
GOOGLE_MAPS_API_KEY=AIza...
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=AIza...
```

`GOOGLE_MAPS_API_KEY` reste côté serveur et sert aux calculs d’itinéraire. Activez l’API Routes pour cette clé. `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` est une clé publique dédiée aux aperçus intégrés : limitez-la à l’API Maps Embed et aux domaines autorisés. Sans cette seconde clé, le rendu utilise l’ancien format d’intégration comme solution de secours.

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

Deux scripts permettent de migrer les roadbooks et médias V1 vers Supabase.

### import-v1-roadbook.js

Importe la structure (roadbook, étapes, POIs, variantes) depuis `roadbooks/<slug>/roadbook.json`.

```bash
cd v2
# Dry-run
node scripts/import-v1-roadbook.js --slug perinexus --dry-run
node scripts/import-v1-roadbook.js --all --dry-run

# Import réel
node scripts/import-v1-roadbook.js --slug perinexus --owner-email user@example.com
node scripts/import-v1-roadbook.js --all --owner-email user@example.com --upsert
```

### import-v1-media.js

Importe les fichiers locaux (images, GPX) vers Supabase Storage + table `media`.

```bash
cd v2
# Dry-run
node scripts/import-v1-media.js --slug perinexus --dry-run
node scripts/import-v1-media.js --all --dry-run

# Import réel
node scripts/import-v1-media.js --slug perinexus
node scripts/import-v1-media.js --all --upsert
```

### Options communes

| Option | Description |
|--------|-------------|
| `--slug <id>` | Slug du roadbook V1 (dossier dans `roadbooks/`) |
| `--all` | Parcourt automatiquement tous les roadbooks détectés |
| `--dry-run` | Mode lecture seule : affiche les compteurs et fichiers trouvés |
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
| `stages[].substeps[]` | `stage_variants` | Champs spécifiques stockés dans `metadata` JSONB |
| `stages[].pois[]` / `pointsOfInterest[]` / `interest[]` | `stage_pois` | Dédupliqués par nom + enrichis via `poi-enrichment.json` |
| `stages[].accommodation.*` | `stages.accommodation_*` | Nom, URL, photo, type |
| `stages[].accommodation.alternatives[]` | `stages.alternatives` JSONB | |
| Fichiers locaux (GPX, images) | `media` + Supabase Storage | Buckets : `roadbook-images` (privé), `roadbook-gpx` (privé) |
| `metadata.coverImage` | `roadbooks.cover_media_id` + `cover_image_url` | Lien vers le record `media` |

### Arborescence Storage

```
roadbook-images/roadbooks/<slug>/
    cover/
    stages/
    poi/
    accommodation/
    gallery/
roadbook-gpx/roadbooks/<slug>/
    gpx/
```

## Sprint 15F — Migration complète (terminée)

- [x] 3 roadbooks V1 détectés : `perinexus`, `voie-bleue`, `alsace-canal-marne-rhin`
- [x] 3 roadbooks importés dans Supabase (stages, POIs, variantes)
- [x] 25 médias migrés vers Supabase Storage (11 GPX + 14 images)
- [x] Scripts génériques avec `--slug` / `--all` / `--dry-run` / `--upsert`
- [x] Création automatique des buckets Storage
- [x] Relançable sans doublons
- [x] Build OK (npm run build)

## Déploiements Vercel

| Commit | Sprint | Description | Déploiement |
|--------|--------|-------------|-------------|
| `3c8892d` | Sprint 15F | Migration complète médias V1→V2 + scripts --all | (ce commit) |
| `607d893` | Sprint 15D | Import contrôle V1 vers V2 (perinexus) + documentation | (à confirmer) |
| `d63a6df` | Sprint 15C | Dashboard Studio : refonte UI + JSX + build fix | (à confirmer) |
| `f6b6c90` | — | trigger Sprint 15B | (à confirmer) |
| `d130077` | Sprint 15B | UI Studio/Explorer complète | (à confirmer) |
| `517ee84` | Sprint 15A | Reprise champs variantes + présentation publique | (à confirmer) |
| `b6576ca` | Sprint 14C | Section automatisations | en ligne |
