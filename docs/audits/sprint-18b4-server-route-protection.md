# Sprint 18B.4 — Server-Side Route Protection

## Objective
Replace client-only auth checks with server-side protection for private routes (dashboard, API) using Supabase SSR.

## Changes

### New files
| File | Purpose |
|------|---------|
| `v2/src/proxy.js` | Supabase SSR middleware — cookie refresh, `/dashboard/*` redirect to `/login?next=...` |
| `v2/src/lib/sanitize-next.js` | Sanitize `?next=` to prevent open redirect |
| `v2/src/lib/require-user.js` | Reusable `requireUser()` for server components |
| `v2/src/app/dashboard/layout.js` | Server-side auth guard on all dashboard sub-routes |
| `v2/src/app/auth/callback/route.js` | PKCE/OAuth session exchange handler |

### Modified files
| File | Changes |
|------|---------|
| `v2/src/lib/auth-context.js` | Replace `getSession()` with `getUser()` for server-validated session |
| `v2/src/app/roadbooks/[slug]/page.js` | Use shared `createServerSupabase()` instead of inline `createServerClient()` |
| `v2/src/app/login/page.js` | Accept `?next=` redirect parameter with sanitization, use `useSearchParams()` |
| `v2/src/app/dashboard/page.js` | Remove redundant client-side redirect (layout handles it), clean up |
| `v2/src/app/api/enrichment/[slug]/[type]/route.js` | Add auth check, slug validation via regex, `fs.existsSync` guard |

## Auth flow
1. Visitor hits `/dashboard/*` → `proxy.js` checks cookie → redirects to `/login?next=/dashboard/...`
2. Visitor logs in → success handler calls `router.push(next)` → lands on intended page
3. OAuth flow → Supabase redirects to `/auth/callback?code=...` → `exchangeCodeForSession` → redirects to `?next=` or `/dashboard`

## Security
- Path traversal blocked: slug validated to `^[a-z0-9-]+$` before `path.join`
- Open redirect blocked: `sanitizeNextPath()` rejects absolute URLs, non-localhost hosts, `//` prefixed paths
- Unauthenticated users receive public-only enrichment data (filtered items)

## Commands
```bash
# dev
cd v2 && npm run dev

# build
cd v2 && npm run build
```
