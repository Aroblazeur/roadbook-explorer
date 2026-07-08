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
- [ ] POI et variantes d'étape
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
