# Template RoadBook Explorer

Ce dossier documente la convention commune des fichiers propres à un roadbook.

Le modèle canonique à copier reste disponible dans `roadbooks/_template/`.
Le dossier `roadbooks/template/` documente les règles métier associées à ce modèle.

Le contrat JSON complet est documenté dans `docs/JSON_CONTRACT.md`.

## Source JSON canonique

Chaque roadbook doit posséder :

```text
roadbooks/<id-roadbook>/roadbook.json
```

Pendant la transition, les Google Sheets existants restent la source de vérité fonctionnelle.
Le script `npm run sync:roadbooks` importe ces Sheets et met à jour les fichiers JSON.

À terme, le Studio et le site public liront et modifieront ce JSON directement.

Les photos d'étapes référencées par la colonne Google Sheet `photo de l'étape`
doivent être stockées dans :

```text
roadbooks/<id-roadbook>/data/
```

Les photos ajoutées directement via le Studio ou dans un JSON natif peuvent être stockées dans :

```text
roadbooks/<id-roadbook>/photos/
```

Exemples :

- `etape1.jpg` pour le roadbook `alsace` devient `roadbooks/alsace/data/etape1.jpg`
- `jour3.jpg` pour le roadbook `perinexus` devient `roadbooks/perinexus/data/jour3.jpg`
- `https://example.com/photo.jpg` reste une URL externe inchangée

Les chemins absolus et les chemins contenant `../` sont refusés par le moteur.

## Métriques GPX automatiques (distance, D+, D−)

Les colonnes `distance (km)`, `d+ (m)` et `d− (m)` du Google Sheet **peuvent rester vides**.

Lorsque ces champs sont vides, nuls ou non renseignés, RoadBook Explorer les calcule
automatiquement en analysant le fichier GPX de l'étape (colonne `gpx`).

**Règle de priorité :**

1. Si le Google Sheet contient une valeur explicite, elle est conservée telle quelle.
2. Si la valeur est vide ou absente, la valeur calculée depuis le GPX est utilisée.
3. Une valeur saisie manuellement dans le Google Sheet n'est jamais écrasée.

Cette règle s'applique à toutes les étapes principales, aux sous-étapes, à la page de
détail et à la liste des étapes de la page d'accueil, ainsi qu'au résumé total du parcours.

À chaque évolution du modèle Google Sheet ou de l'architecture d'un roadbook, mettre à jour ensemble :

- le moteur (`data-loader.js`) ;
- le template Google Sheet ;
- `roadbooks/_template/` ;
- ce README si une nouvelle règle est introduite.

Le template doit toujours refléter exactement la structure attendue par la dernière version de RoadBook Explorer.
