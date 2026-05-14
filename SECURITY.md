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

## Coordinated disclosure

We'll credit you in the [CHANGELOG](CHANGELOG.md) and the release notes unless
you ask to stay anonymous.
