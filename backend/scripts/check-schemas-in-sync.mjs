#!/usr/bin/env node
// Ensures backend/prisma/schema.prisma and backend/prisma/postgres/schema.prisma
// stay byte-for-byte identical except for the `datasource db { ... }` block.
// Runs in test/CI; fails loud if anyone edits one schema and forgets the other.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlite = path.resolve(here, '../prisma/schema.prisma');
const postgres = path.resolve(here, '../prisma/postgres/schema.prisma');

function normalize(src) {
  return src
    // Drop the entire `datasource db { ... }` block (single-level braces, our schema
    // never nests inside it).
    .replace(/datasource\s+\w+\s*\{[^}]*\}\s*/m, '')
    // Strip line comments (everything after `//` on each line).
    .replace(/\/\/[^\n]*/g, '')
    // Collapse all whitespace to make formatting differences irrelevant.
    .replace(/\s+/g, ' ')
    .trim();
}

for (const p of [sqlite, postgres]) {
  if (!fs.existsSync(p)) {
    console.error(`Schema missing: ${p}`);
    process.exit(2);
  }
}

const a = normalize(fs.readFileSync(sqlite, 'utf8'));
const b = normalize(fs.readFileSync(postgres, 'utf8'));

if (a === b) {
  process.exit(0);
}

console.error('❌ Prisma schemas drifted between sqlite and postgres.');
console.error('   sqlite:   backend/prisma/schema.prisma');
console.error('   postgres: backend/prisma/postgres/schema.prisma');
console.error('   Reconcile the model blocks (everything outside `datasource db {}`).');
process.exit(1);
