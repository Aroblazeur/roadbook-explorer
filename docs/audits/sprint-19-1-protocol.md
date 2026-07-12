# Protocole de test manuel — Sprint 19.1

> À exécuter dans un navigateur sur l'URL Vercel de production.
> Durée estimée : 45–60 min.

## Prérequis

- URL Vercel : à définir (SSO protégé)
- Navigateur Chrome/Firefox/Safari
- Fenêtre normale + fenêtre privée
- Outils développeur (Console, Réseau)
- 2 comptes email distincts (A et B)

---

## 1. Vérification déploiement

- [ ] Ouvrir l'URL Vercel
- [ ] `GET /api/health` → `{ "status": "ok", "app": "roadbook-explorer", "database": "ok" }`
- [ ] Console : aucune erreur JS au chargement

## 2. Deux comptes — isolation

### Compte A
- [ ] Aller sur `/login`
- [ ] S'inscrire avec email A
- [ ] Vérifier l'email de confirmation (si `mailer_autoconfirm: false`)
- [ ] Se connecter
- [ ] Créer un nouveau roadbook
- [ ] Ajouter un titre, une journée, une note
- [ ] **Ne pas synchroniser** → un brouillon est créé
- [ ] Se déconnecter

### Compte B (même navigateur)
- [ ] Aller sur `/login`
- [ ] S'inscrire avec email B
- [ ] Vérifier l'email
- [ ] Se connecter
- [ ] **Vérifier** : aucun brouillon de A n'est listé
- [ ] **Vérifier** : `/dashboard` ne montre aucun roadbook de A
- [ ] **Tester** : URL directe `/dashboard/roadbooks/<id-de-A>` → accès refusé
- [ ] Si le roadbook de A n'est pas public, vérifier que l'édition est impossible
- [ ] Se déconnecter

### Retour compte A
- [ ] Se connecter avec A
- [ ] **Vérifier** : le brouillon est restaurable
- [ ] **Vérifier** : aucun brouillon de B n'apparaît
- [ ] **Vérifier** : le roadbook est intact

**Toute fuite croisée = P0**

## 3. Deux onglets — conflit

- [ ] Connecté avec A, ouvrir le même roadbook dans 2 onglets
- [ ] Onglet 1 : modifier le titre → Synchroniser → ✅ succès
- [ ] Onglet 2 : modifier la description → Synchroniser → ⚠️ **conflit attendu**
- [ ] Vérifier le message de conflit : compréhensible
- [ ] Vérifier que le brouillon de l'onglet 2 est conservé
- [ ] Recharger la version distante (onglet 2)
- [ ] Modifier à nouveau → Synchroniser → ✅ succès

## 4. Verrou de synchronisation

- [ ] Double-clic rapide sur Synchroniser → un seul envoi
- [ ] Bouton désactivé pendant la sync
- [ ] Fermer l'onglet pendant la sync → verrou libéré après timeout (15s)
- [ ] Erreur réseau simulée (offline) → verrou libéré

## 5. Modification pendant synchronisation

- [ ] Activer latence lente (DevTools → Réseau → throttling)
- [ ] Modifier le titre → Synchroniser
- [ ] Pendant l'envoi, modifier la description
- [ ] Attendre la fin
- [ ] **Vérifier** : titre synchronisé
- [ ] **Vérifier** : description conservée dans le brouillon (état "non synchronisé")
- [ ] **Vérifier** : aucune donnée perdue

**Ce test est obligatoire pour le GO.**

## 6. Nouveau roadbook

- [ ] Ouvrir `/dashboard/roadbooks/new`
- [ ] Saisir titre + description → **F5** → restauration ✓
- [ ] Créer le roadbook → redirection vers le Studio ✓
- [ ] Vérifier qu'un seul roadbook a été créé (pas de doublon)
- [ ] Vérifier la présence dans Supabase (via dashboard si accessible)
- [ ] Tester : titre vide, caractères accentués, titre > 100 caractères

## 7. Cycle privé → public → privé

### Publication
- [ ] Roadbook privé → absent du catalogue (`/explore`)
- [ ] Passer en public
- [ ] Fenêtre privée : présent dans le catalogue
- [ ] URL directe : contenu complet visible
- [ ] Forcer l'actualisation (F5) : cache correct

### Retour privé
- [ ] Repasser en privé
- [ ] Catalogue actualisé : disparu
- [ ] Fenêtre privée : ancienne URL → login ou 403
- [ ] Propriétaire connecté : toujours accessible

**Toute exposition après retour privé = P0.**

## 8. Médias

- [ ] Upload image (PNG, < 2 Mo)
- [ ] Affichage immédiat
- [ ] F5 → toujours visible
- [ ] Utiliser comme couverture
- [ ] Remplacer l'image
- [ ] Supprimer
- [ ] Upload fichier invalide (ex: .txt) → erreur propre
- [ ] Upload fichier volumineux (> 10 Mo) → erreur propre

## 9. GPX

- [ ] Upload GPX valide
- [ ] Tracé visible sur la carte (Leaflet)
- [ ] `fitBounds` fonctionnel
- [ ] Téléchargement du fichier original
- [ ] Remplacer le GPX
- [ ] Supprimer
- [ ] Fichier invalide → erreur propre
- [ ] Aucune erreur console

## 10. Responsive (DevTools)

| Page | 1440px | 960px | 720px | 390px |
|------|--------|-------|-------|-------|
| Accueil | | | | |
| Catalogue | | | | |
| Login | | | | |
| Dashboard | | | | |
| Studio | | | | |
| Carte GPX | | | | |
| Roadbook public | | | | |
| 404 | | | | |

Vérifier : pas de débordement horizontal, boutons accessibles, formulaires utilisables.

## 11. Accessibilité clavier

- [ ] Tab navigation sur chaque page
- [ ] Shift+Tab retour arrière
- [ ] Entrée sur les boutons
- [ ] Échap ferme les modales
- [ ] Focus visible partout
- [ ] Labels sur tous les champs
- [ ] Images avec `alt`
- [ ] Messages d'erreur lisibles

**Un blocage clavier = P1.**

## 12. Console & Réseau

Pendant tous les tests, relever les erreurs :

| Scénario | Route/action | Statut HTTP | Erreur console | Repro | Gravité |
|----------|-------------|-------------|----------------|-------|---------|
| Login | /auth/callback | | | | |
| Création roadbook | /api/... | | | | |
| Sync | /api/... | | | | |
| Média upload | Storage | | | | |
| GPX upload | Storage | | | | |
| Public/privé | /api/... | | | | |

Signaler : 401/403 inattendus, 404, 409, 500, RLS errors, doublons, latences > 2s.

---

## Résultat

Une fois tous les tests exécutés, reporter les résultats dans `docs/audits/sprint-19-1-manual-preproduction-validation.md`.
