# Changelog

Toutes les modifications notables de Perinexus Roadbook sont documentees ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet adopte le [versionnage semantique](https://semver.org/lang/fr/) a partir
de sa premiere version publiee.

## [Unreleased]

### Added

- Feuille de route produit dans `docs/ROADMAP.md`.
- Modele JSON versionne avec identifiants stables pour les etapes.
- Store de donnees responsable de la validation, des totaux et de la navigation.
- Vue modulaire generant la liste des etapes, les fiches et les statistiques.
- Champs d'extension pour les traces GPX, les coordonnees et les photos.
- Tests unitaires du parsing, des calculs et de la selection des etapes.
- Documentation du modele dans `docs/data-model.md`.
- Interface responsive avec resume du voyage et progression entre les etapes.
- Informations de ravitaillement, d'hebergement et de points d'interet.

### Changed

- Le fichier `data/roadbook.json` est desormais la source unique du contenu.
- L'application est separee en modules de chargement, d'etat et de rendu.
- Le HTML est devenu un shell generique sans journee codee en dur.
- La navigation prend en charge la liste des etapes et les fleches du clavier.

### Removed

- L'ancien point d'entree monolithique `app.js`.
- Le contenu de journee auparavant present dans le balisage statique.

## [0.1.0] - 2026-06-20

### Added

- Structure initiale du projet en HTML, CSS et JavaScript vanilla.
- Premier fichier de donnees de demonstration du roadbook.

[Unreleased]: https://github.com/Aroblazeur/perinexus-roadbook/compare/main...HEAD
[0.1.0]: https://github.com/Aroblazeur/perinexus-roadbook/tree/f1124f1f2bf13c912573529224c5e2e6f25c554a

