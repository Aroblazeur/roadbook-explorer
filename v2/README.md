# Roadbook Explorer V2

Nouvelle version de Roadbook Explorer basée sur **Next.js** (App Router) + **Supabase**.

Indépendante de la version GitHub Pages actuelle (dossier racine).

## Prérequis

- Node.js 24+
- npm 11+

## Lancer en local

```bash
cd v2
cp .env.example .env.local   # puis remplir les clés Supabase
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Pages disponibles

| Route         | Description                          |
|---------------|--------------------------------------|
| `/`           | Page d'accueil                       |
| `/login`      | Connexion (Supabase Auth à brancher) |
| `/dashboard`  | Tableau de bord (protégé)            |

## Structure du projet

```
v2/
├── .env.example          # Variables d'environnement attendues
├── next.config.mjs       # Configuration Next.js
├── package.json          # Dépendances
├── public/               # Fichiers statiques
├── src/
│   ├── app/
│   │   ├── layout.js     # Layout racine
│   │   ├── page.js       # Page d'accueil
│   │   ├── login/page.js
│   │   ├── dashboard/page.js
│   │   └── globals.css
│   └── lib/              # Helpers (à venir)
└── README.md
```
