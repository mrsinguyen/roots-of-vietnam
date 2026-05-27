# Security Policy

## Supported versions

The project follows a rolling-`main` release model. Only the latest commit on
`main` is supported with security fixes.

## Reporting a vulnerability

**Do not** open a public GitHub issue for security problems. Instead:

1. Email the maintainers (see project metadata) or use GitHub's private
   "Report a vulnerability" workflow on the repository.
2. Include a description of the impact, reproduction steps, and any affected
   commit hashes.
3. Allow up to 14 days for an initial response. We aim to have a fix or a
   workaround within 30 days for high-severity issues.

## What we treat as in scope

- Authentication bypass on `/api/*`.
- Privilege escalation between `viewer` / `editor` / `admin`.
- Stored XSS via user-supplied fields (`fullName`, `biography`, `notes`, caption).
- Path traversal in upload or backup endpoints.
- Information disclosure through error messages or audit log content.
- SQL or Prisma injection.
- CSRF on cookie-authenticated mutations (the cookie is SameSite=lax + httpOnly,
  but anything that bypasses that is in scope).

## Out of scope

- Issues that require already being signed in as an `admin` to exploit (admins
  intentionally have wide reach — backup / restore / user-management).
- Denial-of-service from a single authenticated user (rate limits are only on
  login; other endpoints rely on operator-level protection).
- Brute-force of weak admin passwords. Operators are responsible for rotating
  the seed `changeme` password before exposing the service.
- Anything that requires access to your Cloudflare account / dashboard (D1, R2,
  KV, secrets) — that is the operator's trust boundary.

## Known limitations of the KV-backed state

Login rate-limit counters (`ratelimit:*`) and the JWT revocation denylist
(`denylist:*`) live in Cloudflare **KV**, which is shared across edge locations
but **eventually consistent** (~60s):

- **Logout revocation** may take up to ~60s to propagate to every PoP, so a
  stolen token could survive that window. Each denylist entry's TTL is the
  token's own expiry, so entries self-clean. Keep `JWT_EXPIRES_IN` reasonably
  short (default `7d`).
- **Login rate-limit** counts are approximate: a client spreading attempts
  across multiple PoPs could briefly exceed the 5-per-15-min limit. The limit is
  still effective against a steady attacker. Use Durable Objects if you need
  strict global counting.
- **Sliding refresh** (`/api/auth/me`) re-issues the cookie but does **not**
  revoke the previous `jti` — a single page load can legitimately fire `/me` more
  than once (React StrictMode, a service-worker reclaim reload, two tabs), and
  revoking the just-rotated token would 401 the racing call and log the user out.
  Revocation is therefore logout-only.

Operators who need stronger guarantees should put Cloudflare Access in front of
the deployment.

## Deployment-time security checklist

- Set `JWT_SECRET` to a fresh 32+ char random string via
  `wrangler pages secret put JWT_SECRET` — never commit it (not in `wrangler.toml`,
  not in `.dev.vars` for production).
- Replace the seed `admin / changeme` password (re-seed with `ADMIN_PASS`, or
  change it via `POST /api/users`).
- Keep `NODE_ENV=production` in `wrangler.toml [vars]` so the auth cookie is
  marked `Secure` (Cloudflare Pages serves HTTPS by default).
- Review the CSP in `frontend/public/_headers`. If you split the frontend and API
  across origins, add the API origin to `connect-src` and set `CORS_ORIGIN`.
- For a cross-subdomain frontend/API, set `COOKIE_DOMAIN` to the shared parent.

## Coordinated disclosure

We'll credit you in the [CHANGELOG](CHANGELOG.md) and the release notes unless
you ask to stay anonymous.
