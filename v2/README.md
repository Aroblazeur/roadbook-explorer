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

| Route         | Description                                    |
|---------------|------------------------------------------------|
| `/`           | Page d'accueil                                 |
| `/login`      | Connexion / inscription (email + mot de passe) |
| `/dashboard`  | Tableau de bord (réservé aux utilisateurs connectés) |

## Tester login / logout

1. Lancer l'app : `npm run dev`
2. Aller sur `/login`
3. Saisir un email et mot de passe, cliquer **Créer un compte**
4. Vérifier l'email de confirmation si la confirmation est activée dans Supabase
5. Revenir sur `/login`, se connecter avec l'email et mot de passe
6. Le dashboard affiche l'email et l'ID utilisateur
7. Cliquer **Se déconnecter** → retour à la page login

## Structure du projet

```
v2/
├── .env.example              # Variables d'environnement attendues
├── next.config.mjs
├── package.json
├── public/
├── supabase/
│   └── schema.sql            # Schéma SQL (tables + RLS)
├── src/
│   ├── app/
│   │   ├── layout.js         # Layout racine + AuthProvider
│   │   ├── page.js           # Accueil
│   │   ├── login/page.js     # Login / inscription
│   │   ├── dashboard/page.js # Dashboard protégé
│   │   └── globals.css
│   └── lib/
│       ├── supabase.js              # Client navigateur
│       ├── supabase-server.js        # Client serveur
│       └── auth-context.js           # Contexte React d'authentification
└── README.md
```
