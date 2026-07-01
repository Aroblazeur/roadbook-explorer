# RoadBook Explorer — Google Apps Script Contribution API

Ce dossier contient le projet Google Apps Script officiel de RoadBook Explorer.

Il est indépendant de Pirenexus et peut être utilisé par n’importe quel roadbook à condition que la requête fournisse :

- `roadbookId`
- `googleSheetId`
- `contributionType`
- `stage`
- `payload`

Le moteur web RoadBook Explorer ne doit pas connaître les détails internes du script. Il appelle uniquement l’URL `/exec` du déploiement Apps Script.

## Fichiers

```text
apps-script/
├── Code.gs
├── appsscript.json
└── README.md
```

## Créer le projet Google Apps Script

1. Aller sur [script.google.com](https://script.google.com/).
2. Créer un nouveau projet.
3. Renommer le projet, par exemple :

   ```text
   RoadBook Explorer Contribution API
   ```

4. Copier le contenu de `Code.gs` dans le fichier `Code.gs` du projet Apps Script.
5. Ouvrir les paramètres du projet Apps Script.
6. Activer l’option :

   ```text
   Afficher le fichier manifeste "appsscript.json" dans l’éditeur
   ```

7. Ouvrir `appsscript.json` dans Apps Script.
8. Remplacer son contenu par celui du fichier `apps-script/appsscript.json` du dépôt.

## Publier comme Application Web

1. Dans Apps Script, cliquer sur `Déployer`.
2. Choisir `Nouveau déploiement`.
3. Sélectionner le type :

   ```text
   Application Web
   ```

4. Configurer :

   ```text
   Exécuter en tant que : Moi
   Accès : Tout le monde
   ```

5. Cliquer sur `Déployer`.
6. Autoriser les permissions demandées.
7. Copier l’URL se terminant par `/exec`.

Cette URL `/exec` est l’URL à utiliser côté RoadBook Explorer.

## Tester le service

Ouvrir l’URL `/exec` dans un navigateur.

Réponse attendue :

```json
{
  "status": 200,
  "timestamp": "2026-01-01T00:00:00.000Z",
  "data": {
    "ok": true,
    "service": "RoadBook Explorer Contribution API",
    "version": "1.0.0"
  }
}
```

## Requête POST

Le corps de la requête doit être un JSON.

Structure commune :

```json
{
  "roadbookId": "perinexus",
  "googleSheetId": "ID_DU_GOOGLE_SHEET",
  "contributionType": "travelerNote",
  "stage": "3",
  "payload": {}
}
```

## Type `travelerNote`

Feuille cible :

```text
Notes voyageurs
```

Payload :

```json
{
  "note": "Très belle étape.",
  "photo": "https://example.com/photo.jpg"
}
```

Champs obligatoires :

- `stage`
- `payload.note`

En-têtes reconnus dans la feuille :

- `Étape`
- `Note`
- `Photo`
- optionnels : `Roadbook ID`, `Horodatage`, `Type`

## Type `addedAccommodation`

Feuille cible :

```text
ajout hebergement
```

Payload :

```json
{
  "url": "https://example.com/hebergement",
  "name": "Camping exemple",
  "photo": "https://example.com/photo.jpg"
}
```

Champs obligatoires :

- `stage`
- `payload.url`

En-têtes reconnus dans la feuille :

- `Étape`
- `URL hébergement`
- `Nom`
- `Photo`
- optionnels : `Roadbook ID`, `Horodatage`, `Type`

## Exemple JavaScript

```js
await fetch("https://script.google.com/macros/s/DEPLOYMENT_ID/exec", {
  method: "POST",
  headers: {
    "Content-Type": "text/plain;charset=utf-8"
  },
  body: JSON.stringify({
    roadbookId: "perinexus",
    googleSheetId: "ID_DU_GOOGLE_SHEET",
    contributionType: "travelerNote",
    stage: "3",
    payload: {
      note: "Point d’eau utile à la sortie du village.",
      photo: ""
    }
  })
});
```

Remarque : avec Apps Script Web App, `Content-Type: text/plain` évite souvent les préflights CORS inutiles depuis une application statique.

## Réponses d’erreur

Le script retourne toujours du JSON.

Exemple :

```json
{
  "status": 400,
  "timestamp": "2026-01-01T00:00:00.000Z",
  "data": {
    "ok": false,
    "error": {
      "code": "MISSING_FIELD",
      "message": "Champ obligatoire manquant.",
      "details": {
        "field": "googleSheetId"
      }
    }
  }
}
```

Erreurs prévues :

- `EMPTY_BODY`
- `INVALID_JSON`
- `MISSING_FIELD`
- `MISSING_STAGE`
- `INVALID_PAYLOAD`
- `UNSUPPORTED_CONTRIBUTION_TYPE`
- `MISSING_PAYLOAD_FIELDS`
- `SHEET_NOT_FOUND`
- `EMPTY_HEADER_ROW`
- `MISSING_REQUIRED_HEADERS`
- `INVALID_API_KEY`
- `ROADBOOK_NOT_ALLOWED`

## Extension future

L’architecture est prévue pour ajouter facilement :

- `addedPhoto`
- `correction`
- `poiSuggestion`
- `restaurantSuggestion`
- `shopSuggestion`
- `waterSuggestion`

Pour ajouter un type :

1. Ajouter une entrée dans `CONTRIBUTION_TYPES`.
2. Définir :
   - `sheetName`
   - `requiredPayloadFields`
   - `fieldAliases`
   - `buildValues(request)`
3. Ajouter la feuille et ses en-têtes dans chaque Google Sheet de roadbook.

À chaque nouveau type de contribution ou nouvelle feuille associée, mettre aussi à jour :

- `roadbooks/_template/config.js` si la configuration des feuilles change ;
- `scripts/create-roadbook.js` si de nouveaux placeholders ou fichiers deviennent nécessaires ;
- la documentation du template (`roadbooks/_template/README.md` et `roadbooks/template/README.md`) si une nouvelle règle est introduite.

## Sécurité future

Le fichier `Code.gs` contient déjà un bloc `SECURITY` prévu pour activer plus tard :

- clé API simple ;
- liste blanche des `roadbookId` ;
- limitation anti-spam.

Par défaut, ces protections sont désactivées pour faciliter le premier déploiement.

## Important

Ce composant est générique.

Il ne contient aucune configuration spécifique à un roadbook particulier. Le choix du Google Sheet se fait uniquement via `googleSheetId`.
