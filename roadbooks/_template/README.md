# Nouveau Roadbook — Guide de démarrage

Ce dossier est le modèle à copier pour créer un nouveau roadbook.

## Structure

```
roadbooks/<id>/
├── config.js          # Configuration du roadbook (identifiant, titre, Google Sheet, etc.)
├── roadbook.json      # Source JSON canonique du roadbook
├── data/              # Fichiers d'enrichissement et photos d'étapes du roadbook
│   ├── accommodation-enrichment.json
│   ├── poi-enrichment.json
│   └── etape01.jpg
├── gpx/               # Fichiers GPX des étapes (ex : etape01.gpx)
├── photos/            # Photos propres au roadbook
└── README.md          # Ce fichier
```

## Créer un nouveau roadbook

1. **Créer le roadbook à partir du template canonique** :
   ```bash
   npm run create-roadbook -- --id=<id> --title="Mon voyage" --description="Roadbook d'itinérance." --sheet-id=SHEET_ID
   ```

   Le script copie ce dossier `roadbooks/_template/` puis remplace les placeholders.

   Vous pouvez aussi le copier manuellement :
   ```
   cp -r roadbooks/_template roadbooks/<id>
   ```

2. **Modifier `config.js`** si nécessaire :
   - Remplacer toutes les occurrences de `my-roadbook` par votre `<id>`.
   - Renseigner `title`, `description`, `googleSheetId`.
   - Les contributions utilisent l’endpoint global Apps Script du moteur ; aucun Google Form n’est à configurer par roadbook.

3. **Synchroniser depuis Google Sheets pendant la transition** :
   ```bash
   node scripts/sync-roadbook-json.js --roadbook=<id>
   ```

   Cette commande importe les feuilles configurées et écrit `roadbooks/<id>/roadbook.json`.

4. **Ajouter les fichiers GPX** dans `gpx/` (un fichier par étape).

   Les colonnes `distance (km)`, `d+ (m)` et `d− (m)` du Google Sheet **peuvent rester vides** :
   RoadBook Explorer calcule automatiquement ces valeurs depuis le fichier GPX de chaque étape.

   **Règle de priorité :**
   1. Si le Google Sheet contient une valeur explicite, elle est conservée.
   2. Si la valeur est vide ou absente, la valeur calculée depuis le GPX est utilisée.
   3. Une valeur saisie manuellement dans le Google Sheet n'est jamais écrasée.

5. **Ajouter les photos d'étapes** dans `data/` si le Google Sheet les référence.

   Dans la colonne `photo de l'étape`, vous pouvez utiliser :
   - une URL complète : `https://example.com/photo.jpg`
   - un nom de fichier local : `etape01.jpg`

   Un nom de fichier local est automatiquement résolu vers :
   ```
   roadbooks/<id>/data/etape01.jpg
   ```

   N'utilisez pas de chemin absolu ni de chemin contenant `../`.

6. **Générer les enrichissements** (optionnel) :
   ```bash
   npm run enrich:accommodations -- --roadbook <id>
   npm run enrich:pois -- --roadbook <id>
   ```

   Les fichiers `data/accommodation-enrichment.json` et `data/poi-enrichment.json` du template démarrent avec `generatedAt: null`. Cette valeur est renseignée lors d'une vraie génération d'enrichissement.

7. **Accéder au roadbook** via `?roadbook=<id>` dans l'URL.

## Contrat JSON

`roadbook.json` n'est pas une simple démo. C'est le contrat officiel utilisé par le Studio et, à terme, par le site public.

Il doit contenir au minimum :

- `id`
- `title`
- `description`
- `metadata`
- `summary`
- `stages`
- `variants`
- `accommodation`
- `pois`
- `notes`

Le mapping complet Google Sheet → JSON est documenté dans `docs/JSON_CONTRACT.md`.

## Synchronisation obligatoire

`roadbooks/_template/` est la source canonique pour la structure d'un roadbook.

À chaque évolution du modèle Google Sheet ou de l'architecture attendue :

- mettre à jour le moteur (`data-loader.js`) ;
- mettre à jour ce template ;
- vérifier que `scripts/create-roadbook.js` copie toujours ce template sans divergence ;
- mettre à jour `roadbooks/template/README.md` et le `README.md` racine si une règle change.
