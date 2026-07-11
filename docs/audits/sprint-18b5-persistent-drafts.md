# Sprint 18B.5 — Brouillons persistants par utilisateur et par roadbook

**SHA de départ :** `cfe1cd3`  
**SHA final :** `4ecc319`

## Architecture avant/après

### Avant
```
Supabase ─→ loadData() ─→ 75 useState ─→ UI
   ↑              (aucune persistance entre les sessions)
   └──── handleSave*() ←── utilisateur modifie
```

- Tout l'état React est perdu au F5, à la fermeture, au changement de roadbook
- Pas d'autosauvegarde, pas de brouillon local
- Données chargées une fois et jamais restaurées

### Après
```
Supabase ─→ loadData() ─→ useState ─→ UI ←── utilisateur modifie
                ↓              ↑             ↓
          useStudioDraft ──────┘   autosave (debounce 1000ms)
                ↓                          ↓
          localStorage ──────────→ studio-drafts.js ─→ DraftStatus
                ↓
          restoration au chargement
```

## Choix du stockage : `localStorage`

### Justification
- Taille estimée par roadbook : < 100 KB (roadbook + 20 étapes + 50 POI + 10 variantes)
- Limite navigateur : 5–10 Mo par origine
- Fréquence d'écriture : après chaque modification (debounce 1 s)
- Coût de sérialisation négligeable pour cette taille
- IndexedDB serait surdimensionné et complexifierait inutilement

### Limites documentées
- Les objets `File` (fichiers non téléversés) ne sont pas persistés
- Les URL signées temporaires expirent (restaurées au chargement depuis `media` table)
- `localStorage` n'est pas chiffré — accessible à tout code JS sur le même domaine

## Format du brouillon (version 1)

```js
{
  version: 1,
  userId: "uuid",
  roadbookId: 123,
  baseRemoteUpdatedAt: "2024-01-01T00:00:00Z",
  savedAt: "2024-01-01T01:00:00Z",
  tabId: "unique-tab-id",
  payload: {
    roadbook: { ... },            // ligne Supabase complète
    title, description, isPublic, // champs modifiables
    activity, destination, project,
    officialDist, officialGain, ..., traceMap,
    stages: [...],
    poisByStage: { ... },
    variantsByStage: { ... },
    images: [...],                // médias (IDs + signed URLs)
    gpxOfficial, gpxCustom, gpxByStage,
    coverMode, coverUrl, coverMediaId,
  }
}
```

## Clés de stockage

| Type | Format |
|------|--------|
| Existant | `roadbook-explorer:draft:v1:{userId}:{roadbookId}` |
| Nouveau | `roadbook-explorer:draft:v1:{userId}:new:{localDraftId}` |

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `v2/src/lib/studio-drafts.js` | Helper central : CRUD localStorage, validation, migration, taille, nettoyage |
| `v2/src/hooks/useStudioDraft.js` | Hook React : cycle de vie complet du brouillon |
| `v2/src/components/DraftStatus.js` | Indicateur d'état visible |

## Fichiers modifiés

| Fichier | Changements |
|---------|-------------|
| `v2/src/app/dashboard/roadbooks/[id]/page.js` | Import + appel hook + restoration + `markSynced()` + `DraftStatus` + `beforeunload` |

## Stratégies

### Autosauvegarde
- Déclenchée par les changements de toutes les données modifiables (titre, description, stages, POI, etc.)
- Debounce : 1000 ms
- Sauvegarde immédiate sur `pagehide` (fermeture onglet/navigateur)
- Ne sauvegarde pas pendant la restauration
- Ne sauvegarde pas avant le chargement initial

### Restauration
1. `loadData()` charge la version Supabase
2. `useStudioDraft` détecte `loaded=true`
3. Recherche un brouillon local
4. Validation : version, structure, utilisateur
5. Comparaison `savedAt` vs `baseRemoteUpdatedAt` (issu du `updated_at` Supabase)
6. Si brouillon plus récent → restaure les `useState` avec les données du brouillon
7. Affiche un message : "Des modifications locales non synchronisées ont été restaurées."

### Synchronisation réussie
- `handleSave()` et `handleSaveRoute()` appellent `markSynced()`
- `markSynced()` supprime le brouillon local
- La prochaine autosauvegarde recrée un brouillon si l'utilisateur modifie à nouveau

### Conflit multi-onglets
- Écoute l'événement `storage` du navigateur
- Détecte une écriture par un autre onglet sur la même clé
- Compare les `tabId` pour s'ignorer soi-même
- Affiche : "Conflit détecté" avec options "Conserver ma version" ou "Recharger"

### Conflit distant
- `baseRemoteUpdatedAt` stocke le `updated_at` du roadbook au chargement
- Réservé pour une vérification avant synchronisation future

### Changement de roadbook
- `useEffect` sur `roadbookId` : sauvegarde immédiate du brouillon courant → réinitialise les flags → charge le nouveau
- Indépendance totale des brouillons entre roadbooks

### Déconnexion
- Les brouillons sont isolés par `userId` dans la clé
- Pas de suppression automatique au logout
- Un utilisateur B ne voit jamais les brouillons de A

## Scénarios réellement implémentés

| Scénario | Statut | Mécanisme |
|----------|--------|-----------|
| Édition → autosauvegarde | ✅ | Debounce 1 s |
| F5 → restauration | ✅ | `loadDraft()` au chargement |
| Fermeture → réouverture | ✅ | `pagehide` + `loadDraft()` |
| Changement de roadbook | ✅ | Sauvegarde immédiate + restoration |
| Deux roadbooks indépendants | ✅ | Clés distinctes par `roadbookId` |
| Synchronisation → nettoyage | ✅ | `markSynced()` |
| Erreur de synchronisation | ✅ | Brouillon conservé |
| Conflit multi-onglets | ✅ | `storage` event listener |
| Deux utilisateurs isolés | ✅ | Clé inclut `userId` |
| `beforeunload` avertit | ✅ | Uniquement si `status === "unsaved"` |
| Brouillon corrompu | ✅ | `validateDraft()` rejette et supprime |
| Quota dépassé | ✅ | `QuotaExceededError` capturé, message affiché |

## Limites acceptées
- Pas de gestion de conflit distant avant synchronisation (vérification `baseRemoteUpdatedAt` non implémentée dans `handleSave`)
- Pas de fusion automatique en conflit multi-onglets (choix : conserver ou recharger)
- Pas de support pour les nouveaux roadbooks sans ID (pas de formulaire de création dans le périmètre)
- Pas de nettoyage automatique des brouillons obsolètes (sauf après synchronisation)

## Anomalies à traiter en 18C
- Intégrer la vérification `baseRemoteUpdatedAt` dans `handleSave()` et `handleSaveRoute()`
- Ajouter la persistance des brouillons pour les nouveaux roadbooks (création)
- Nettoyage périodique des brouillons orphelins (anciens, roadbooks supprimés)

## Améliorations UX futures
- Synchronisation visible dans le badge (au lieu de seulement après sauvegarde explicite)
- Message de restauration plus détaillé (champs modifiés)
- Possibilité de comparer brouillon vs version distante

## Commandes
```bash
cd v2 && npm run build
```
