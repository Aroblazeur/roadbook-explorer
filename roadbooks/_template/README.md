# Nouveau Roadbook — Guide de démarrage

Ce dossier est le modèle à copier pour créer un nouveau roadbook.

## Structure

```
roadbooks/<id>/
├── config.js          # Configuration du roadbook (identifiant, titre, Google Sheet, etc.)
├── roadbook.json      # Données de secours (fallback si le Google Sheet est indisponible)
├── data/              # Fichiers d'enrichissement générés par les scripts
│   ├── accommodation-enrichment.json
│   └── poi-enrichment.json
├── gpx/               # Fichiers GPX des étapes (ex : etape01.gpx)
├── assets/            # Images et ressources spécifiques au roadbook
└── README.md          # Ce fichier
```

## Créer un nouveau roadbook

1. **Copier ce dossier** en le renommant avec l'identifiant de votre roadbook :
   ```
   cp -r roadbooks/_template roadbooks/<id>
   ```

2. **Modifier `config.js`** :
   - Remplacer toutes les occurrences de `my-roadbook` par votre `<id>`.
   - Renseigner `title`, `description`, `googleSheetId`.
   - Compléter les URLs de formulaires (`forms`) si nécessaire.

3. **Ajouter le script** dans `index.html` (avant `app.js`) :
   ```html
   <script src="roadbooks/<id>/config.js"></script>
   ```

4. **Ajouter les fichiers GPX** dans `gpx/` (un fichier par étape).

5. **Générer les enrichissements** (optionnel) :
   ```bash
   npm run enrich:accommodations -- --roadbook <id>
   npm run enrich:pois -- --roadbook <id>
   ```

6. **Accéder au roadbook** via `?roadbook=<id>` dans l'URL.
