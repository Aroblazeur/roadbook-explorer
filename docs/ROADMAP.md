# Feuille de route Périnexus Roadbook

Cette feuille de route decrit la direction du produit. Elle reste volontairement
orientee resultats : le contenu exact d'un sprint peut evoluer, mais ses criteres
de sortie doivent etre satisfaits avant de passer au suivant.

## Principes directeurs

- Le fichier JSON reste la source unique du contenu du roadbook.
- Chaque fonctionnalite est utilisable sur mobile et au clavier.
- L'application reste rapide, progressive et exploitable sans framework.
- Les donnees, l'etat et le rendu restent separes.
- Chaque sprint ajoute ou adapte ses tests et met a jour `CHANGELOG.md`.

## Vue d'ensemble

| Sprint | Theme | Etat | Resultat attendu |
| --- | --- | --- | --- |
| 1 | Socle du projet | Termine | Structure HTML, JavaScript et donnees initiales |
| 2 | Roadbook utilisable | En revue | Interface responsive et navigation entre les etapes |
| 3 | Data-driven Roadbook | Validé techniquement | Contenu entièrement généré depuis un JSON versionné |
| 4 | Carte interactive | Planifie | Visualisation Leaflet des etapes et points utiles |
| 5 | Traces GPX | Planifie | Chargement, affichage et analyse des traces |
| 6 | PWA et mode hors ligne | Planifie | Installation et consultation fiable sans reseau |
| 7 | Galerie photo | A explorer | Medias rattaches aux etapes et points d'interet |
| 8 | Statistiques et export | A explorer | Synthese du voyage et partage du roadbook |

## Sprint 4 - Carte interactive

Objectif : donner une lecture geographique immediate du voyage sans coupler le
coeur de l'application a Leaflet.

- Ajouter un module cartographique consommant l'etat du roadbook.
- Afficher le depart, l'arrivee et les points d'interet de l'etape active.
- Synchroniser la selection d'une etape entre la liste et la carte.
- Prevoir un rendu de repli lorsque la carte ne peut pas etre chargee.
- Conserver les coordonnees dans le JSON, jamais dans le HTML.

Critere de sortie : toute etape correctement geolocalisee apparait sur la carte,
la navigation reste fonctionnelle sans carte et aucun contenu metier n'est code
en dur dans le module Leaflet.

## Sprint 5 - Traces GPX et profil

Objectif : exploiter les traces reelles pour guider la preparation du parcours.

- Charger un fichier GPX référencé par `day.gpx`.
- Dessiner la trace et ajuster automatiquement l'emprise de la carte.
- Calculer ou afficher distance, denivele et profil altimetrique.
- Signaler clairement un GPX absent ou invalide.
- Mettre en cache les traces deja chargees pendant la session.

Critere de sortie : une etape peut declarer une trace sans modification du code,
et une erreur GPX n'empeche jamais la consultation du roadbook.

## Sprint 6 - PWA et mode hors ligne

Objectif : rendre le roadbook fiable sur le terrain, y compris avec un reseau
degrade ou absent.

- Ajouter le manifeste d'installation et les icones.
- Mettre en cache l'interface, le JSON et les ressources indispensables.
- Definir une strategie de mise a jour explicite des donnees.
- Fournir un ecran hors ligne utile et un indicateur de connectivite discret.
- Tester installation, premiere visite et revisite hors ligne.

Critere de sortie : apres une premiere visite, le roadbook principal reste
consultable en mode avion et une nouvelle version peut etre recuperee proprement.

## Sprint 7 - Galerie photo

Objectif : enrichir le recit sans alourdir la consultation terrain.

- Alimenter la galerie depuis `day.photos`.
- Generer miniatures, textes alternatifs et visionneuse accessible.
- Charger les images a la demande et definir des formats responsives.
- Associer facultativement une photo a un point d'interet.

Critere de sortie : une etape sans photo ne presente aucun espace vide et une
etape riche en medias reste rapide sur mobile.

## Sprint 8 - Statistiques et export

Objectif : fournir une synthese utile avant, pendant et apres le voyage.

- Consolider distance, denivele, duree et repartition par etape.
- Ajouter des graphiques accessibles avec equivalent textuel.
- Permettre l'impression et un export partageable du roadbook.
- Preparer l'import de plusieurs jeux de donnees.

Critere de sortie : les statistiques sont derivees uniquement du modele de
donnees et restent coherentes avec les valeurs affichees dans chaque etape.

## Qualite continue

Ces travaux ne constituent pas un sprint isole : ils accompagnent chaque lot.

- Tests unitaires du modele et tests d'integration du rendu.
- Controle automatique du format JSON et des liens vers les ressources.
- Audit accessibilite, responsive et performances.
- Documentation des migrations de schema.
- Versionnement semantique et mise a jour du changelog a chaque PR.


