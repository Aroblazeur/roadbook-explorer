# Limites produit — Roadbook Explorer V2

## Fonctionnalités non terminées

- **Suppression de compte** : Pas d'interface utilisateur pour supprimer son compte et ses données associées
- **Export utilisateur** : Pas d'export complet des données utilisateur (brouillons exportables individuellement uniquement)
- **Modération** : Pas de système de signalement de contenu pour les roadbooks publics
- **Mode hors ligne** : Non supporté (Nécessite une connexion Internet)
- **Recherche plein texte** : Non implémentée dans le catalogue public

## Limites techniques

- **Taille maximale des fichiers** : ~10 Mo pour les images (limite Vercel + temps d'upload)
- **Formats de médias supportés** : PNG, JPEG, WebP (images) ; GPX (traces)
- **Nombre de comptes** : Pas de limite explicite (dépend du plan Supabase)
- **Nombre de roadbooks** : Pas de limite explicite
- **Connexion** : Requise en permanence (pas de mode hors ligne)
- **Stockage** : Dépend du plan Supabase (vérifier le quota actuel)

## Compatibilité navigateur

- Non testé officiellement sur :
  - Safari (versions antérieures à la dernière)
  - Firefox ESR
  - Navigateurs mobiles non-Chromium
  - Lecteurs d'écran (accessibilité partielle)

## Conformité

- **RGPD** : Pas encore implémenté (suppression de compte, export, politique de confidentialité)
- **Signalement** : Pas de mécanisme de signalement pour les contenus publics inappropriés

## Recommandations avant lancement public

| Obligatoire | Recommandé | Futur |
|-------------|------------|-------|
| Suppression de compte | Export utilisateur | Mode hors ligne |
| Politique de confidentialité | Modération des contenus | Recherche |
| Conditions d'utilisation | Accessibilité complète | API publique |
| Page `/privacy` | Tests Safari/Firefox | |
