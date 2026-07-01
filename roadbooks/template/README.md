# Template RoadBook Explorer

Ce dossier documente la convention commune des fichiers propres à un roadbook.

Le modèle canonique à copier reste disponible dans `roadbooks/_template/`.
Le dossier `roadbooks/template/` documente les règles métier associées à ce modèle.

Les photos d'étapes référencées par la colonne Google Sheet `photo de l'étape`
doivent être stockées dans :

```text
roadbooks/<id-roadbook>/data/
```

Exemples :

- `etape1.jpg` pour le roadbook `alsace` devient `roadbooks/alsace/data/etape1.jpg`
- `jour3.jpg` pour le roadbook `perinexus` devient `roadbooks/perinexus/data/jour3.jpg`
- `https://example.com/photo.jpg` reste une URL externe inchangée

Les chemins absolus et les chemins contenant `../` sont refusés par le moteur.

À chaque évolution du modèle Google Sheet ou de l'architecture d'un roadbook, mettre à jour ensemble :

- le moteur (`data-loader.js`) ;
- le template Google Sheet ;
- `roadbooks/_template/` ;
- ce README si une nouvelle règle est introduite.

Le template doit toujours refléter exactement la structure attendue par la dernière version de RoadBook Explorer.
