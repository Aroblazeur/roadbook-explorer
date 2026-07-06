# RoadBook Explorer — Apps Script contributions centrales

Ce dossier contient le projet Google Apps Script officiel de RoadBook Explorer.

Il sert de point d’entrée unique pour les contributions publiques de tous les roadbooks :

- notes voyageurs ;
- hébergements ajoutés.

Le site public reste JSON-first. Les contributions rapides sont stockées dans un Google Sheet central, puis relues en live et filtrées par `roadbookId`.

## Fichiers

```text
apps-script/
├── Code.gs
├── appsscript.json
└── README.md
```

## Structure du Google Sheet central

Créer un Google Sheet central avec un onglet :

```text
Contributions
```

La première ligne doit contenir ces colonnes :

```text
roadbookId | stage | type | text | name | url | website | photo | createdAt | source
```

Rôle des colonnes :

- `roadbookId` : identifiant du roadbook, par exemple `alsace-canal-marne-rhin`.
- `stage` : numéro d’étape.
- `type` : `note` ou `accommodation`.
- `text` : contenu d’une note.
- `name` : nom d’un hébergement.
- `url` / `website` : lien d’hébergement.
- `photo` : URL photo optionnelle.
- `createdAt` : date ISO ou date Apps Script.
- `source` : origine, par exemple `public-roadbook`.

Si l’onglet est vide, le script crée automatiquement les en-têtes.

## Configuration du projet Apps Script

1. Aller sur [script.google.com](https://script.google.com/).
2. Créer un nouveau projet.
3. Copier le contenu de `Code.gs` dans le fichier `Code.gs`.
4. Copier le contenu de `appsscript.json` dans le manifeste Apps Script.
5. Dans les propriétés du script, créer :

```text
ROADBOOK_CONTRIBUTIONS_SHEET_ID = 1TA3NCbR6EMI__-dyF3x5Ir4JXDfN78qQ2448hrNrxnc
```

Alternative moins recommandée : renseigner directement `CENTRAL_SPREADSHEET_ID` dans `Code.gs`.

## Déploiement

Déployer comme Application Web :

```text
Exécuter en tant que : Moi
Accès : Tout le monde
```

L’URL `/exec` actuellement utilisée globalement par RoadBook Explorer est :

```text
https://script.google.com/macros/s/AKfycbx2DJNd3bNNbF5usb9WBbwxMbg8cAzvCVTpP_jPLRRWRKZJDUN2-yeVzBZYutweiahBjg/exec
```

## Test GET

Ouvrir :

```text
https://script.google.com/macros/s/AKfycbx2DJNd3bNNbF5usb9WBbwxMbg8cAzvCVTpP_jPLRRWRKZJDUN2-yeVzBZYutweiahBjg/exec
```

Réponse attendue :

```json
{
  "status": 200,
  "data": {
    "ok": true,
    "service": "RoadBook Explorer Central Contribution API",
    "version": "2.0.0"
  }
}
```

## Lecture live des contributions

Le site public appelle :

```text
/exec?action=list&roadbookId=alsace-canal-marne-rhin
```

Le script retourne les lignes de l’onglet `Contributions`, filtrées par `roadbookId`.

## POST note voyageur

```json
{
  "roadbookId": "alsace-canal-marne-rhin",
  "contributionType": "travelerNote",
  "type": "note",
  "stage": "2",
  "payload": {
    "note": "Très belle étape.",
    "photo": "",
    "createdAt": "2026-07-06T12:00:00.000Z",
    "source": "public-roadbook"
  }
}
```

## POST hébergement

```json
{
  "roadbookId": "alsace-canal-marne-rhin",
  "contributionType": "addedAccommodation",
  "type": "accommodation",
  "stage": "2",
  "payload": {
    "name": "Camping exemple",
    "url": "https://example.com",
    "photo": "",
    "createdAt": "2026-07-06T12:00:00.000Z",
    "source": "public-roadbook"
  }
}
```

Pour un hébergement, `name` ou `url` suffit. Il n’est plus nécessaire de fournir un Google Sheet dédié au roadbook.

## CORS / requête simple

Depuis RoadBook Explorer, le POST est envoyé en :

```http
Content-Type: text/plain;charset=utf-8
```

Cela évite les préflights CORS inutiles avec Apps Script.

## Sécurité future

`Code.gs` contient déjà des points d’extension pour :

- clé API simple ;
- liste blanche de roadbooks ;
- anti-spam.

Ces protections sont désactivées par défaut pour permettre les contributions publiques rapides.
