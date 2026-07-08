# Scripts

## Créer un nouveau roadbook

`create-roadbook.js` copie le template canonique `roadbooks/_template/`, puis personnalise automatiquement les placeholders nécessaires pour un nouveau voyage.

`sync-roadbook-json.js` importe les Google Sheets configurés et met à jour les fichiers JSON canoniques `roadbooks/<id>/roadbook.json`.

### Lancer le script

```bash
npm run create-roadbook
```

Le script pose quelques questions interactives (identifiant, titre, description, ID du Google Sheet) et crée les fichiers suivants :

```text
roadbooks/<id>/README.md
roadbooks/<id>/config.js
roadbooks/<id>/roadbook.json
roadbooks/<id>/data/accommodation-enrichment.json
roadbooks/<id>/data/poi-enrichment.json
roadbooks/<id>/gpx/
roadbooks/<id>/photos/
```

Les arguments peuvent également être passés directement en ligne de commande pour éviter les questions interactives :

```bash
npm run create-roadbook -- --id=mon-voyage --title="Mon Voyage" --description="Roadbook d'itinérance." --sheet-id=SHEET_ID
```

| Option | Description |
|--------|-------------|
| `--id` | Identifiant du roadbook (lettres minuscules, chiffres, tirets) — **obligatoire** |
| `--title` | Titre affiché dans l'application |
| `--description` | Description courte |
| `--sheet-id` | ID du Google Sheet associé |

Une fois le roadbook créé, accédez-y via : `index.html?roadbook=<id>`

Si la structure attendue d'un roadbook évolue, mettez d'abord à jour `roadbooks/_template/` ; le script réutilisera automatiquement cette structure.

## Synchroniser les Google Sheets vers les JSON

Pendant la transition vers le mode JSON-first, les Google Sheets existants restent la source de vérité fonctionnelle.

Pour régénérer tous les `roadbook.json` listés dans `roadbooks/catalog.json` :

```bash
npm run sync:roadbooks
```

Pour cibler un seul roadbook :

```bash
node scripts/sync-roadbook-json.js --roadbook=perinexus
```

Le script :

- charge `roadbooks/<id>/config.js` ;
- lit les feuilles Google Sheets configurées ;
- reconstruit le modèle commun étapes / sous-étapes ;
- écrit `roadbooks/<id>/roadbook.json`.

Le mapping complet est décrit dans `docs/JSON_CONTRACT.md`.

---

# Enrichissement des hébergements

`enrich-accommodations.js` est un outil manuel et indépendant du roadbook. Il lit l’onglet publié `etapes principales`, la feuille `ajout hebergement`, puis visite les liens d’hébergement pour récupérer un nom exploitable et une image.

## Lancer le script

Utiliser Node.js 18 ou une version plus récente depuis la racine du dépôt :

```bash
node scripts/enrich-accommodations.js
```

La commande npm équivalente est :

```bash
npm run enrich:accommodations
```

Le délai et le timeout peuvent être ajustés sans modifier le fichier :

```bash
ENRICH_DELAY_MS=750 ENRICH_TIMEOUT_MS=15000 node scripts/enrich-accommodations.js
```

Sous PowerShell :

```powershell
$env:ENRICH_DELAY_MS=750
$env:ENRICH_TIMEOUT_MS=15000
node scripts/enrich-accommodations.js
```

La variable `ROADBOOK_SHEET_URL` permet de tester une autre URL CSV Google Sheets publiée (onglet principal), et `ROADBOOK_ADDED_ACCOMMODATION_SHEET_URL` celle de la feuille d’ajouts.

## Fichier produit

Le script crée si nécessaire le dossier `roadbooks/perinexus/data/`, puis écrit :

```text
roadbooks/perinexus/data/accommodation-enrichment.json
```

Chaque entrée conserve la colonne source, l’étape, l’URL, le nom, la méthode de récupération (`nameMethod`), l’image détectée et un statut. Le Google Sheet n’est jamais modifié.

## Limites

- La récupération du nom suit cet ordre : nom manuel (ajout hébergement), nom manuel (feuille principale), `<title>`, `og:title`, données Schema.org, liens Google Maps, puis Nominatim (OSM) avec adresse/coordonnées.
- Airbnb, Booking et certains sites protégés peuvent répondre `403`, demander des cookies ou bloquer les clients automatisés.
- Le script n’utilise pas de navigateur ni Puppeteer : le contenu généré uniquement en JavaScript n’est pas visible.
- L’absence de métadonnée d’image n’est pas considérée comme une erreur.
- Les erreurs sont enregistrées individuellement et n’interrompent pas l’analyse des autres URL.
- Les requêtes sont séquentielles, espacées et limitées par un timeout afin d’éviter un scraping agressif.
