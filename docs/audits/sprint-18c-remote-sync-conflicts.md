# Sprint 18C — Remote Sync & Conflict Hardening

## Objective
Prevent partial writes, silent data loss, and stale-overwrite during remote saves in the Studio dashboard by introducing optimistic concurrency control based on `roadbooks.updated_at` cascading triggers.

## Architecture Decision

**Option A (chosen)**: `roadbooks.updated_at` is the global version. Cascade triggers on child tables (`stages`, `stage_pois`, `stage_variants`, `media`) bump the parent via AFTER INSERT/UPDATE/DELETE. The client uses `.eq("updated_at", expected)` for conditional updates.

**Rejected options**:
- Option B (`content_version` column): redundant with `updated_at`
- Option C (Supabase RLS + `x-version` header): not supported by supabase-js

## Key Changes

### Database (migration `20260711-003`)
- `set_updated_at()` changed from `now()` to `clock_timestamp()` for sub-transaction precision
- New `touch_roadbook(roadbook_id)` function: updates a no-op column to trigger the existing BEFORE UPDATE trigger
- Four cascade triggers: `trg_stages_touch_roadbook`, `trg_pois_touch_roadbook`, `trg_variants_touch_roadbook`, `trg_media_touch_roadbook`
- POI/variant functions silently return when the parent stage is gone (cascade-safe via `coalesce`)
- Backfill: `roadbooks.updated_at = GREATEST(children.updated_at)` for all existing rows

### Optimistic Concurrency (`src/lib/sync-helpers.js`)
- `conditionalUpdateRoadbook(supabase, id, updates, expectedUpdatedAt)` — update with `.eq("updated_at", expected)`; returns `{ ok: false, error: "conflict", remoteUpdatedAt }` when mismatch
- `takeSnapshot(state)` — deep-clone of current UI state before sync
- `hasStateChangedSinceSnapshot(snapshot, current)` — deep compare using `updated_at`, length, and JSON equality
- `verifyAfterSync(supabase, id, snapshot)` — fetch parent + child stage count post-sync

### Sync Lock (`sync-helpers.js`)
- `acquireSyncLockWithTabId(roadbookId, tabId)` — localStorage-based lock with 15s TTL; prevents concurrent syncs
- `releaseSyncLock(roadbookId, tabId)` — only the lock holder can release
- `cleanupStaleLocks(roadbookId)` — removes expired locks

### Authenticated Revalidation (`/api/revalidate`)
- POST-only; validates `auth.getUser()`, verifies `owner_id`, calls `revalidatePath` for the public route, `/explore`, and dashboard list
- Rejects unauthenticated/unowned requests with 401/403

### Draft Enhancements (`src/lib/studio-drafts.js`)
- `saveNewDraft()` / `loadNewDraft()` / `removeNewDraft()` — key format `roadbook-explorer:draft:v1:{userId}:new:{localDraftId}`
- `migrateNewDraftKey(userId, localDraftId, newRoadbookId)` — re-keys the draft to the real ID after creation
- `exportDraftToJSON(userId, roadbookId)` / `downloadDraftExport(...)` — Blob download
- `buildNewDraftPayload(formState)` — builds a valid draft payload for new roadbooks
- `cleanupOrphanDrafts(supabase, userId)` — async removal of drafts whose roadbook is no longer accessible

### Studio Page (`page.js`)
- All `supabase.from("roadbooks").update()` calls replaced with `conditionalUpdateRoadbook()`:
  - `handleSave` — general info
  - `handleSaveRoute` — official route + current trace
  - `handleToggleVisibility` — public/private toggle
  - `handleSetCoverFromMedia/Url` — cover image
  - `handleRemoveCover` — cover removal
  - `handleRecalculateTotals` — automation totals
- Each save: acquire lock → take snapshot → conditional update → verify after sync → release lock
- Conflict flows: save local draft (via `saveImmediate()` + `markRemoteConflict()`), show error in DraftStatus
- Revalidation call after each successful write (fire-and-forget `fetch("/api/revalidate")`)

### New Roadbook Drafts (`roadbooks/page.js`)
- `localDraftIdRef` persists across navigation (one per page session)
- Form changes auto-save via `saveNewFormDraft()` (called in onChange handlers)
- `pagehide` handler saves pending drafts
- On successful creation: `migrateNewDraftKey()` re-keys to real ID, redirects to studio
- Restore banner when a pending new-roadbook draft is found on mount

## Files Changed
| File | Change |
|---|---|
| `v2/supabase/migrations/20260711-003-roadbook-updated-at-cascade.sql` | New migration |
| `v2/scripts/verify-migration-18c.mjs` | New verification script |
| `v2/src/lib/sync-helpers.js` | Rewritten with `updated_at`-based versioning |
| `v2/src/app/api/revalidate/route.js` | New authenticated revalidation endpoint |
| `v2/src/lib/studio-drafts.js` | Added new-roadbook, export, orphan cleanup |
| `v2/src/app/dashboard/roadbooks/[id]/page.js` | Conditional update, lock, snapshot, revalidation |
| `v2/src/app/dashboard/roadbooks/page.js` | New-roadbook draft persistence |

## Verification
1. Run migration in Supabase SQL Editor
2. Run `node scripts/verify-migration-18c.mjs` (requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
3. Open two tabs for the same roadbook; edit both; save — second tab should see "Conflit de version"
4. Open a studio page, modify, refresh (without saving) — draft banner should appear
5. Create a new roadbook, fill form, navigate away — come back, draft should be restored
6. Create a new roadbook, submit — should redirect to the studio for that new roadbook
