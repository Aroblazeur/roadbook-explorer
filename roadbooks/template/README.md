# Template RoadBook Explorer

Ce dossier documente la convention commune des fichiers propres à un roadbook.

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

Le modèle complet à copier reste disponible dans `roadbooks/_template/`.
