# Roots of Vietnam — REST API

Base URL (dev): `http://localhost:8788` (`wrangler pages dev`). Same-origin in production.

Everything is JSON. Every write endpoint requires the `roots_token` httpOnly cookie set
by `POST /api/auth/login`. Errors are `{ error: string }` with Vietnamese copy.

## Roles

| Role     | Read | Create / update | Delete person | Backup · restore · users · audit |
| -------- | :--: | :-------------: | :-----------: | :------------------------------: |
| viewer   |  ✓   |                 |               |                                  |
| editor   |  ✓   |        ✓        |               |                                  |
| admin    |  ✓   |        ✓        |       ✓       |                ✓                 |

## HTTP status codes

| Code | Meaning                                          |
| ---- | ------------------------------------------------ |
| 400  | Validation (zod) or shape mismatch               |
| 401  | Missing / invalid / revoked auth cookie          |
| 403  | Authenticated but role doesn't allow             |
| 404  | Target not found                                 |
| 409  | Conflict (e.g. duplicate username, restore guard)|
| 422  | Domain conflict (e.g. parent cycle)              |
| 429  | Login rate limit (5 / 15 min / IP)               |

## Auth

### `POST /api/auth/login`

```json
{ "username": "admin", "password": "changeme" }
```

Sets `roots_token` cookie. Returns `{ user: { id, username, role } }`.
6th wrong attempt within 15 minutes from the same IP returns `429` with
`Retry-After`.

### `POST /api/auth/logout`

Revokes the JWT `jti` server-side (in-memory denylist) and clears the cookie.

### `GET /api/auth/me`

Returns `{ user }`. Also re-issues a fresh cookie — sliding 7-day refresh.

## Persons

### `GET /api/persons`

Query parameters:

| Name         | Type | Notes                                                 |
| ------------ | ---- | ----------------------------------------------------- |
| `q`          | str  | Diacritic-insensitive match against `nameNormalized`  |
| `generation` | int  |                                                       |
| `branchId`   | str  |                                                       |
| `birthYear`  | int  |                                                       |
| `location`   | str  | Matches `burialPlace` or `notes`                      |
| `limit`      | int  | Default 50, max 200                                   |
| `offset`     | int  | Default 0                                             |

Returns `{ items: Person[], total: number }`. Items sort by `generation ASC`,
then `birthYear ASC` (nulls last), then `fullName ASC`.

### `GET /api/persons/tree`

Returns every person plus both marriage edges, for client-side tree assembly.

### `GET /api/persons/:id`

Includes `father`, `mother`, `branch`, `media`, `childrenAsFather`, `childrenAsMother`,
`marriagesAsHusband.wife`, `marriagesAsWife.husband`.

### `POST /api/persons` (editor+)

```json
{
  "fullName": "Nguyễn Văn A",
  "honorific": "Ông",
  "gender": "Nam",
  "birthYear": 1990,
  "birthMonth": 1,
  "birthDay": 1,
  "deathYear": null,
  "birthDateLunar": "Canh Ngọ",
  "fatherId": "...",
  "motherId": "..."
}
```

`generation` is auto-computed as `max(parent.generation) + 1`, defaulting to 1.
`nameNormalized` is recomputed from `fullName` on every write.

### `PATCH /api/persons/:id` (editor+)

Same shape, all fields optional. Updating a parent re-computes generation.
Returns `422` if the new parent would close an ancestry cycle.

### `DELETE /api/persons/:id` (admin)

Rejects if children exist (`400`). Cleans up marriages first.

## Marriages

### `POST /api/marriages` (editor+)

```json
{ "husbandId": "...", "wifeId": "...", "marriageDate": "1980-01-01" }
```

`(husbandId, wifeId)` is unique. Polygamy is supported by inserting multiple
rows that share the same `husbandId`.

### `DELETE /api/marriages/:id` (editor+)

## Branches

### `GET /api/branches`

### `POST /api/branches` (editor+)

```json
{ "name": "Trưởng tộc", "description": "..." }
```

## Media

### `POST /api/media/:personId` (editor+)

`multipart/form-data`:

| Field     | Type   | Notes                                                |
| --------- | ------ | ---------------------------------------------------- |
| `file`    | binary | ≤ 20 MB                                              |
| `caption` | text   | optional                                             |

Accepted MIME types: `image/*`, `application/pdf`, `audio/*`, `application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`text/plain`. Returns the `Media` row. Files are served at `/uploads/<filename>`.

### `DELETE /api/media/:id` (editor+)

Removes the row and the object from R2.

## Backup

### `POST /api/backup` (admin)

Writes `backups/backup-<ISO>.json` (schema v2) to R2 with every `Person`,
`Marriage`, `Branch`, and `Media` row; each `Media` entry carries the `sha256` of
its R2 object. Prunes to the 10 most-recent backups. Returns
`{ filename, counts, schemaVersion }`.

### `GET /api/backup` (admin)

Lists the `.json` and `.zip` backups in R2 (`backups/` prefix).

### `POST /api/backup/media-zip` (admin)

Zips every uploaded media object (R2 `media/*`) into `backups/media-<ISO>.zip` via
`jszip`. Returns `{ filename, sizeBytes }`.

### `POST /api/backup/restore` (admin)

Body: a previously-exported backup. Validates `schemaVersion`. Refuses with `409`
if the database is non-empty unless `?force=true`. On success returns:

```json
{
  "inserted": { "persons": 15, "marriages": 3, "branches": 2, "media": 1 },
  "missingMedia": [
    { "id": "...", "filePath": "/uploads/...", "reason": "missing" | "hash-mismatch" }
  ]
}
```

## Users (admin)

### `GET /api/users`

### `POST /api/users`

```json
{ "username": "...", "password": "...", "role": "viewer" }
```

Password ≥ 10 characters, bcrypt cost 12.

### `PATCH /api/users/:id`

Updates password and/or role. Admin cannot change their own role through this API.

## Audit

### `GET /api/audit` (admin)

Query: `limit`, `offset`, `action`, `userId`.

Returns rolling rows from the `AuditLog` table — auth events, person CRUD, user CRUD,
backup operations — with the JSON `diff` parsed back into an object.

## Health

### `GET /api/health` (public)

Returns `{ ok: true, ts }`.
