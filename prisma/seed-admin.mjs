#!/usr/bin/env node
// Prints a single SQL statement that inserts one admin User into D1, with a
// bcrypt-hashed password. There is no interactive way to bootstrap the first
// login on a fresh D1, so run this once after the initial migrate:
//
//   SQL=$(ADMIN_USER=admin ADMIN_PASS='choose-a-strong-pass' \
//     node prisma/seed-admin.mjs)
//   wrangler d1 execute roots-of-vietnam --remote --command "$SQL"
//
// Use --local instead of --remote to seed the local dev D1. Rotate the
// password after first login (or via POST /api/users as that admin).
import bcrypt from 'bcryptjs';

const username = process.env.ADMIN_USER ?? 'admin';
const password = process.env.ADMIN_PASS ?? 'changeme';
const id = crypto.randomUUID();
const hash = bcrypt.hashSync(password, 12);
const esc = (s) => s.replaceAll("'", "''");

process.stdout.write(
  `INSERT INTO "User" ("id","username","passwordHash","role","createdAt","updatedAt") ` +
    `VALUES ('${id}','${esc(username)}','${esc(hash)}','admin',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`,
);
