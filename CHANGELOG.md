# Changelog

Toutes les modifications notables de Périnexus Roadbook sont documentées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet utilise le [versionnage sémantique](https://semver.org/lang/fr/).

## [Unreleased]

## [0.3.0] - 2026-06-20

### Added

- Modèle JSON versionné avec identifiants stables pour les étapes.
- Store responsable de la validation, de la normalisation, des totaux et de la navigation.
- Chargement HTTP robuste avec erreurs réseau, HTTP, JSON et schéma distinguées.
- Fabrique dédiée générant chaque carte d’étape depuis les données normalisées.
- Utilitaires partagés pour les conversions, valeurs de repli et créations DOM.
- Support des futurs champs `gpx`, `photos`, `interest`, `restaurants`, `shops`,
  `water`, `variants`, `notes` et `warning`.
- Affichage de la date, du départ, de l’arrivée, des kilomètres, du D+, du D-,
  de la difficulté, de l’hébergement et de la description de chaque étape.
- Tests unitaires du chargement, des erreurs, du modèle, des calculs et de la navigation.
- Validation automatisée du contrat JSON et du shell HTML générique.
- Serveur HTTP local avec la commande `npm start`.
- Rapport d’audit du Sprint 3 dans `docs/SPRINT3_REVIEW.md`.
- Documentation du modèle dans `docs/data-model.md`.
- Feuille de route produit dans `docs/ROADMAP.md`.

### Changed

- `data/roadbook.json` devient l’unique source du contenu du roadbook.
- L’application est séparée en modules d’orchestration, chargement, état,
  fabrique de cartes, rendu et utilitaires.
- `index.html` devient un shell générique sans aucune journée codée en dur.
- L’interface responsive est consolidée pour mobile, tablette et ordinateur.
- La navigation prend en charge la liste des étapes, les boutons et les flèches du clavier.
- Le README documente le lancement, les vérifications, la modification du JSON
  et l’ajout d’une étape.

### Removed

- Ancien point d’entrée monolithique `app.js`.
- Fichiers historiques concurrents `roadbook.json`, `Style..css` et `TEST.md`.
- Contenu de journée auparavant présent dans le balisage statique.

## [0.1.0] - 2026-06-20

### Added

- Structure initiale du projet en HTML, CSS et JavaScript vanilla.
- Premier fichier de données de démonstration du roadbook.

[Unreleased]: https://github.com/Aroblazeur/perinexus-roadbook/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Aroblazeur/perinexus-roadbook/releases/tag/v0.3.0
[0.1.0]: https://github.com/Aroblazeur/perinexus-roadbook/tree/f1124f1f2bf13c912573529224c5e2e6f25c554a
