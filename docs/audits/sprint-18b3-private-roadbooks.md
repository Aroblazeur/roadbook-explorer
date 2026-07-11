# Sprint 18B.3 — Gestion propre des roadbooks privés

**Date :** 2026-07-11  
**Branche :** `v2-next-supabase`  
**SHA de base :** `a1671df` (18B.2.1)

---

## Comportement avant

| Cas | Résultat |
|---|---|
| Roadbook public | ✅ Affichage normal |
| Roadbook privé, propriétaire | ✅ Affichage normal |
| Roadbook privé, non-propriétaire | ❌ Page 404 technique (Next.js) |
| Roadbook inexistant | ✅ Page 404 technique |
| Erreur technique (réseau, Supabase) | ❌ Exception non gérée |

## Comportement après

| Cas | Résultat |
|---|---|
| Roadbook public, tout utilisateur | ✅ Affichage normal |
| Roadbook privé, propriétaire | ✅ Affichage normal |
| Roadbook privé, non-propriétaire connecté | ✅ Écran "Roadbook privé" (boutons Explorer + Connexion) |
| Roadbook privé, anonyme | ✅ Page "Roadbook introuvable" (ne révèle pas l'existence) |
| Roadbook inexistant | ✅ Page "Roadbook introuvable" (not-found.js) |
| Erreur technique | ✅ Écran "Erreur technique" (error.js) |

## Logique de distinction

```javascript
// getRoadbook() — nouvelle logique
if (error)       → { error: message }  → TechnicalError
if (!data, user) → { private: true }   → PrivateRoadbook (connecté)
if (!data, !user) → null                → notFound() (anonyme)
if (data)        → { roadbook, ... }   → Affichage normal
```

La RLS reste la seule source de vérité — aucune colonne n'a été contournée. La distinction privé/inexistant pour les utilisateurs connectés repose sur le fait que si la RLS retourne `null` pour un utilisateur authentifié, le roadbook est très probablement privé (plutôt qu'inexistant). Les utilisateurs anonymes reçoivent toujours une page 404 générique pour ne pas révéler l'existence de roadbooks privés.

## Fichiers modifiés

| Fichier | Nature |
|---|---|
| `v2/src/app/roadbooks/[slug]/page.js` | Modifié : nouvelle logique getRoadbook + composants PrivateRoadbook, TechnicalError |
| `v2/src/app/roadbooks/[slug]/not-found.js` | Nouveau : page 404 personnalisée |
| `v2/src/app/roadbooks/[slug]/error.js` | Nouveau : boundary d'erreur technique |

## Build

```bash
npm run build  # ✅ 0 erreur, 0 warning TS
```

## Tests manuels (5 scénarios)

1. **Roadbook public** → page normale avec étapes
2. **Roadbook privé, propriétaire** → page normale
3. **Roadbook privé, non-propriétaire connecté** → "Ce roadbook n'est pas accessible avec votre compte"
4. **Roadbook inexistant** → "Roadbook introuvable"
5. **Erreur technique** → "Impossible de charger ce roadbook pour le moment"
