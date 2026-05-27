# Data model

Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma) — Cloudflare
**D1** (SQLite) via Prisma 6 + `@prisma/adapter-d1`. Enum-style fields are stored
as `TEXT`; the typed values live in [`shared/src/types.ts`](../shared/src/types.ts).

## Person

| Field            | Type        | Notes                                                                    |
| ---------------- | ----------- | ------------------------------------------------------------------------ |
| `id`             | cuid PK     |                                                                          |
| `fullName`       | string      | Indexed                                                                  |
| `nameNormalized` | string      | Indexed. Lowercased, diacritic-stripped `fullName`. Maintained on every write. |
| `honorific`      | string?     | Cụ · Ông · Bà · Cố — shown before the name on the profile header        |
| `gender`         | text        | `Nam` / `Nu` / `Khac`                                                    |
| `birthYear`      | int?        | Indexed                                                                  |
| `birthMonth`     | int?        |                                                                          |
| `birthDay`       | int?        |                                                                          |
| `deathYear`      | int?        |                                                                          |
| `deathMonth`     | int?        |                                                                          |
| `deathDay`       | int?        |                                                                          |
| `birthDateLunar` | string?     | Free text âm lịch, shown alongside the solar values                      |
| `deathDateLunar` | string?     |                                                                          |
| `biography`      | string?     |                                                                          |
| `occupation`     | string?     |                                                                          |
| `burialPlace`    | string?     |                                                                          |
| `notes`          | string?     |                                                                          |
| `generation`     | int         | Indexed. `max(parent.generation) + 1`, defaults to 1                     |
| `branchId`       | FK Branch?  | Indexed                                                                  |
| `fatherId`       | FK Person?  | Indexed. Self-relation `Father`                                          |
| `motherId`       | FK Person?  | Indexed. Self-relation `Mother`                                          |
| `createdAt`      | DateTime    |                                                                          |
| `updatedAt`      | DateTime    |                                                                          |

## Marriage

| Field          | Type      | Notes   |
| -------------- | --------- | ------- |
| `id`           | cuid PK   |         |
| `husbandId`    | FK Person | Indexed |
| `wifeId`       | FK Person | Indexed |
| `marriageDate` | DateTime? |         |

Unique constraint on `(husbandId, wifeId)`. Polygamy is modeled by inserting
multiple rows that share the same `husbandId`.

## Branch

| Field         | Type      |
| ------------- | --------- |
| `id`          | cuid PK   |
| `name`        | string UQ |
| `description` | string?   |

## Media

| Field      | Type      | Notes                                                       |
| ---------- | --------- | ----------------------------------------------------------- |
| `id`       | cuid PK   |                                                             |
| `personId` | FK Person | Indexed. `onDelete: Cascade`                                |
| `filePath` | string    | Server-relative, e.g. `/uploads/1234-abcd.jpg`              |
| `type`     | text      | `image` / `pdf` / `audio` / `doc`                           |
| `caption`  | string?   |                                                             |

## User

| Field          | Type      | Notes                                |
| -------------- | --------- | ------------------------------------ |
| `id`           | cuid PK   |                                      |
| `username`     | string UQ |                                      |
| `passwordHash` | string    | bcrypt cost 12                        |
| `role`         | text      | `admin` / `editor` / `viewer`        |

## AuditLog

| Field        | Type     | Notes                                                                 |
| ------------ | -------- | --------------------------------------------------------------------- |
| `id`         | cuid PK  |                                                                       |
| `userId`     | FK User? | Indexed. `onDelete: SetNull` so deleting a user keeps their history.  |
| `action`     | text     | Indexed. Free-form, e.g. `person.update`, `auth.login.success`.       |
| `targetType` | text?    | e.g. `Person`, `User`                                                 |
| `targetId`   | text?    | The row id of the affected entity                                     |
| `diff`       | text?    | JSON blob: `{ before?, after? }` for mutations, `{ meta }` otherwise. |
| `createdAt`  | DateTime | Indexed                                                               |

Action keys currently emitted:

| Action                  | Source                                  |
| ----------------------- | --------------------------------------- |
| `auth.login.success`    | `POST /api/auth/login`                  |
| `auth.login.failure`    | wrong username/password                 |
| `auth.logout`           | `POST /api/auth/logout`                 |
| `person.create`         | `POST /api/persons`                     |
| `person.update`         | `PATCH /api/persons/:id`                |
| `person.delete`         | `DELETE /api/persons/:id`               |
| `user.create`           | `POST /api/users`                       |
| `user.update`           | `PATCH /api/users/:id`                  |
| `backup.create`         | `POST /api/backup`                      |
| `backup.media-zip`      | `POST /api/backup/media-zip`            |
| `backup.restore`        | `POST /api/backup/restore`              |

## Generation rule

`generation` is recalculated server-side whenever `fatherId` or `motherId` changes:

```ts
generation = max(father.generation ?? 0, mother.generation ?? 0) + 1
```

Both parents unknown ⇒ defaults to `1` (thủy tổ).

The editor surfaces a soft warning if the saved generation doesn't match the
parent-derived value — it does not block saving (a known historical break is a
legitimate reason to override).

## Cycle guard

`PATCH /api/persons/:id` walks up the proposed parent's ancestry (BFS, bounded
at 200 ancestors). If the target id is reachable, the update returns `422` with
a Vietnamese error — preventing a person from becoming their own ancestor.

## Deletes & cascades

- Deleting a `Person` is rejected if anyone references them as `fatherId` /
  `motherId`. Marriages where they appear are cleared first.
- Deleting `Media` removes the row and the file on disk.
- Deleting a `User` sets `AuditLog.userId` to NULL — history is preserved.
- Marriages cascade neither on person delete nor branch delete — they're
  cleared explicitly when a person is removed.

## Migrations

D1 is migrated by wrangler, not `prisma migrate`. Edit
[`prisma/schema.prisma`](../prisma/schema.prisma), regenerate the SQL with
`pnpm prisma:migrate:diff` (it runs `prisma migrate diff --from-empty
--to-schema-datamodel … --script` into `prisma/migrations/0001_init.sql`), then
apply it:

```bash
pnpm migrate:local    # wrangler d1 migrations apply roots-of-vietnam --local
pnpm migrate:remote   # … --remote
```

For an additive change you can append a new numbered migration file
(`0002_*.sql`) instead of regenerating the baseline; wrangler tracks applied
migrations in a `d1_migrations` table. Note D1 (SQLite) `ALTER TABLE` is limited —
column drops/renames need the table-rebuild dance.
