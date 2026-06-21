# Enrichissement des hébergements

`enrich-accommodations.js` est un outil manuel et indépendant du roadbook. Il lit l’onglet publié `etapes principales`, visite les liens d’hébergement un par un et recherche les métadonnées de titre et d’image disponibles.

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

La variable `ROADBOOK_SHEET_URL` permet également de tester une autre URL CSV Google Sheets publiée.

## Fichier produit

Le script crée si nécessaire le dossier `data/`, puis écrit :

```text
data/accommodation-enrichment.json
```

Chaque entrée conserve la colonne source, l’étape, l’URL, le nom et l’image détectés, ainsi qu’un statut. Le Google Sheet n’est jamais modifié.

## Limites

- Airbnb, Booking et certains sites protégés peuvent répondre `403`, demander des cookies ou bloquer les clients automatisés.
- Le script n’utilise pas de navigateur ni Puppeteer : le contenu généré uniquement en JavaScript n’est pas visible.
- L’absence de métadonnée d’image n’est pas considérée comme une erreur.
- Les erreurs sont enregistrées individuellement et n’interrompent pas l’analyse des autres URL.
- Les requêtes sont séquentielles, espacées et limitées par un timeout afin d’éviter un scraping agressif.
