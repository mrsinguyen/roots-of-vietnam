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
- Anything that requires physical access to the host or its `database/`
  directory.

## Known limitations of the single-process model

The current implementation is a single-process Node server. Two security
mechanisms are stored in process memory and therefore reset on every restart
(deploy, crash, OOM kill):

- **JWT revocation list** (`backend/src/lib/auth.ts`). Logging out adds the
  token's `jti` to an in-memory `Set`. A restart clears the set, which means
  a token that was explicitly logged out *before* the restart becomes valid
  again until its natural `JWT_EXPIRES_IN` expiry. Mitigation today: keep
  `JWT_EXPIRES_IN` reasonably short (default `7d`). Operators running a
  multi-instance deployment must move this state to a shared store (Redis or
  a `RevokedToken` table) before relying on logout for incident response.
- **Login rate-limit counters** (`backend/src/lib/rateLimit.ts`). Same shape:
  per-process `Map`. A restart wipes attempt counts; an ongoing brute-force
  resumes from zero. The 5-per-15-min limit is still effective against a
  steady attacker, but a determined one can amplify by triggering restarts.

Operators who need stronger guarantees should run the project behind a real
auth gateway (oauth2-proxy / Cloudflare Access / etc.) until these gaps are
closed.

## Deployment-time security checklist

- Rotate `JWT_SECRET` to a fresh 32+ char random string before exposing the service.
- Replace the seed `admin / changeme` password.
- Set `NODE_ENV=production` so the auth cookie is marked `Secure`.
- Set `TRUST_PROXY` to the number of trusted reverse-proxy hops in front of
  the process (default `0` = direct internet exposure, ignore X-Forwarded-For).
  An incorrect value here defeats the login rate-limit by letting clients
  spoof their source IP.
- If frontend and API run on different subdomains, set `COOKIE_DOMAIN` to the
  shared parent so the auth cookie is sent on cross-subdomain requests.
- Serve over HTTPS only. The Strict-Transport-Security header is set by
  helmet but obviously requires TLS in front to be useful.

## Coordinated disclosure

We'll credit you in the [CHANGELOG](CHANGELOG.md) and the release notes unless
you ask to stay anonymous.
