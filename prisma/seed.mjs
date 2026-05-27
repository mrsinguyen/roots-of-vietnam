#!/usr/bin/env node
// Emits idempotent SQL (INSERT OR IGNORE + UPDATE) to seed a D1 database with an
// admin user + a 22-person, 4-generation demo family ("Họ Nguyễn") including a
// multi-spouse case. Write it to a file, then apply with wrangler:
//
//   node prisma/seed.mjs > prisma/seed.sql
//   wrangler d1 execute roots-of-vietnam --local --file=prisma/seed.sql   # or --remote
//
// or just: `pnpm seed:local` / `pnpm seed:remote`.
// Override the admin login with ADMIN_USER / ADMIN_PASS env vars.
// Deterministic ids + INSERT OR IGNORE make re-running safe (no duplicates).
import bcrypt from 'bcryptjs';

// Inline copy of normalizeName (pure; mirrors worker/lib/normalize.ts).
const VN = { đ: 'd', Đ: 'D' };
function normalizeName(input) {
  if (!input) return '';
  return input
    .replace(/[đĐ]/g, (c) => VN[c] ?? c)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const NOW = new Date().toISOString();
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const n = (v) => (v === null || v === undefined ? 'NULL' : String(v));
function ymd(s) {
  if (!s) return { y: null, m: null, d: null };
  const [y, m, d] = s.split('-').map(Number);
  return { y: y ?? null, m: m ?? null, d: d ?? null };
}

const PEOPLE = [
  { key: 'g1.cu_to', fullName: 'Nguyễn Văn Thái', gender: 'Nam', birthDate: '1900-03-12', deathDate: '1972-08-04', generation: 1, branch: 'Trưởng tộc', occupation: 'Nông gia', burialPlace: 'Quê nhà', biography: 'Thủy tổ của dòng họ demo, lập nghiệp tại quê nhà.' },
  { key: 'g1.cu_ba', fullName: 'Trần Thị Mây', gender: 'Nu', birthDate: '1903-06-18', deathDate: '1980-11-22', generation: 1, burialPlace: 'Quê nhà', biography: 'Vợ thủy tổ.' },
  { key: 'g2.con_truong', fullName: 'Nguyễn Văn An', gender: 'Nam', birthDate: '1925-01-05', deathDate: '1998-09-30', generation: 2, branch: 'Trưởng tộc', fatherKey: 'g1.cu_to', motherKey: 'g1.cu_ba', occupation: 'Thầy giáo' },
  { key: 'g2.con_truong_vo', fullName: 'Lê Thị Hồng', gender: 'Nu', birthDate: '1928-07-22', generation: 2, occupation: 'Nội trợ' },
  { key: 'g2.con_thu', fullName: 'Nguyễn Văn Bình', gender: 'Nam', birthDate: '1930-11-15', deathDate: '2010-02-01', generation: 2, branch: 'Chi thứ', fatherKey: 'g1.cu_to', motherKey: 'g1.cu_ba', occupation: 'Công chức' },
  { key: 'g2.con_gai', fullName: 'Nguyễn Thị Lan', gender: 'Nu', birthDate: '1933-04-09', generation: 2, fatherKey: 'g1.cu_to', motherKey: 'g1.cu_ba', occupation: 'Buôn bán' },
  { key: 'g3.chau_dich_ton', fullName: 'Nguyễn Văn Cường', gender: 'Nam', birthDate: '1955-05-21', generation: 3, branch: 'Trưởng tộc', fatherKey: 'g2.con_truong', motherKey: 'g2.con_truong_vo', occupation: 'Kỹ sư' },
  { key: 'g3.chau_dich_ton_vo', fullName: 'Phạm Thị Hoa', gender: 'Nu', birthDate: '1958-09-12', generation: 3, occupation: 'Giáo viên' },
  { key: 'g3.chau_dich_thu', fullName: 'Nguyễn Văn Dũng', gender: 'Nam', birthDate: '1958-12-03', generation: 3, fatherKey: 'g2.con_truong', motherKey: 'g2.con_truong_vo', occupation: 'Bác sĩ' },
  { key: 'g3.chau_chi_thu', fullName: 'Nguyễn Văn Em', gender: 'Nam', birthDate: '1960-08-17', generation: 3, branch: 'Chi thứ', fatherKey: 'g2.con_thu', occupation: 'Thợ rèn' },
  { key: 'g4.chat_truong', fullName: 'Nguyễn Văn Phong', gender: 'Nam', birthDate: '1985-02-14', generation: 4, branch: 'Trưởng tộc', fatherKey: 'g3.chau_dich_ton', motherKey: 'g3.chau_dich_ton_vo', occupation: 'Lập trình viên' },
  { key: 'g4.chat_truong_em', fullName: 'Nguyễn Thị Quỳnh', gender: 'Nu', birthDate: '1988-10-30', generation: 4, fatherKey: 'g3.chau_dich_ton', motherKey: 'g3.chau_dich_ton_vo', occupation: 'Kiến trúc sư' },
  { key: 'g4.chat_thu', fullName: 'Nguyễn Văn Sơn', gender: 'Nam', birthDate: '1990-03-08', generation: 4, fatherKey: 'g3.chau_dich_thu', occupation: 'Luật sư' },
  { key: 'g4.chat_chi_thu', fullName: 'Nguyễn Thị Trang', gender: 'Nu', birthDate: '1992-07-19', generation: 4, branch: 'Chi thứ', fatherKey: 'g3.chau_chi_thu', occupation: 'Nhà báo' },
  { key: 'g4.chat_chi_thu_em', fullName: 'Nguyễn Văn Vinh', gender: 'Nam', birthDate: '1995-12-01', generation: 4, fatherKey: 'g3.chau_chi_thu', occupation: 'Sinh viên' },
  { key: 'g3.dich_thu_vo1', fullName: 'Vũ Thị Lan', gender: 'Nu', birthDate: '1960-04-12', generation: 3 },
  { key: 'g3.dich_thu_vo2', fullName: 'Đỗ Thị Bích', gender: 'Nu', birthDate: '1965-08-08', generation: 3 },
  { key: 'g4.dich_thu_con1', fullName: 'Nguyễn Thị Mai', gender: 'Nu', birthDate: '1986-02-20', generation: 4, fatherKey: 'g3.chau_dich_thu', motherKey: 'g3.dich_thu_vo1' },
  { key: 'g4.dich_thu_con2', fullName: 'Nguyễn Văn Nam', gender: 'Nam', birthDate: '1988-09-05', generation: 4, fatherKey: 'g3.chau_dich_thu', motherKey: 'g3.dich_thu_vo1' },
  { key: 'g4.dich_thu_con3', fullName: 'Nguyễn Văn Lộc', gender: 'Nam', birthDate: '1990-12-30', generation: 4, fatherKey: 'g3.chau_dich_thu', motherKey: 'g3.dich_thu_vo1' },
  { key: 'g4.dich_thu_con4', fullName: 'Nguyễn Thị Hằng', gender: 'Nu', birthDate: '1995-06-14', generation: 4, fatherKey: 'g3.chau_dich_thu', motherKey: 'g3.dich_thu_vo2' },
  { key: 'g4.dich_thu_con5', fullName: 'Nguyễn Văn Tâm', gender: 'Nam', birthDate: '1998-01-22', generation: 4, fatherKey: 'g3.chau_dich_thu', motherKey: 'g3.dich_thu_vo2' },
];

const MARRIAGES = [
  { husband: 'g1.cu_to', wife: 'g1.cu_ba', date: '1922-05-10' },
  { husband: 'g2.con_truong', wife: 'g2.con_truong_vo', date: '1950-03-15' },
  { husband: 'g3.chau_dich_ton', wife: 'g3.chau_dich_ton_vo', date: '1980-11-20' },
  { husband: 'g3.chau_dich_thu', wife: 'g3.dich_thu_vo1', date: '1985-04-10' },
  { husband: 'g3.chau_dich_thu', wife: 'g3.dich_thu_vo2', date: '1994-09-22' },
];

const pid = (key) => `seed_p_${key.replaceAll('.', '_')}`;
const bid = (name) => `seed_b_${normalizeName(name).replaceAll(' ', '_')}`;

const out = [];

// Admin user
const adminUser = process.env.ADMIN_USER ?? 'admin';
const adminPass = process.env.ADMIN_PASS ?? 'changeme';
const adminHash = bcrypt.hashSync(adminPass, 12);
out.push(
  `INSERT OR IGNORE INTO "User" ("id","username","passwordHash","role","createdAt","updatedAt") ` +
    `VALUES ('seed_admin',${q(adminUser)},${q(adminHash)},'admin',${q(NOW)},${q(NOW)});`,
);

// Branches
const branchNames = [...new Set(PEOPLE.map((p) => p.branch).filter(Boolean))];
for (const name of branchNames) {
  out.push(
    `INSERT OR IGNORE INTO "Branch" ("id","name","description","createdAt") ` +
      `VALUES (${q(bid(name))},${q(name)},NULL,${q(NOW)});`,
  );
}

// Persons (parents NULL first — FK-safe), then wire parents.
for (const p of PEOPLE) {
  const b = ymd(p.birthDate);
  const d = ymd(p.deathDate);
  out.push(
    `INSERT OR IGNORE INTO "Person" ` +
      `("id","fullName","nameNormalized","honorific","gender","birthYear","birthMonth","birthDay",` +
      `"deathYear","deathMonth","deathDay","birthDateLunar","deathDateLunar","biography","occupation",` +
      `"burialPlace","notes","generation","branchId","fatherId","motherId","createdAt","updatedAt") VALUES (` +
      [
        q(pid(p.key)), q(p.fullName), q(normalizeName(p.fullName)), 'NULL', q(p.gender),
        n(b.y), n(b.m), n(b.d), n(d.y), n(d.m), n(d.d), 'NULL', 'NULL',
        q(p.biography ?? null), q(p.occupation ?? null), q(p.burialPlace ?? null), 'NULL',
        n(p.generation), p.branch ? q(bid(p.branch)) : 'NULL', 'NULL', 'NULL', q(NOW), q(NOW),
      ].join(',') +
      `);`,
  );
}
for (const p of PEOPLE) {
  if (!p.fatherKey && !p.motherKey) continue;
  out.push(
    `UPDATE "Person" SET "fatherId"=${p.fatherKey ? q(pid(p.fatherKey)) : 'NULL'},` +
      `"motherId"=${p.motherKey ? q(pid(p.motherKey)) : 'NULL'} WHERE "id"=${q(pid(p.key))};`,
  );
}

// Marriages
MARRIAGES.forEach((m, i) => {
  out.push(
    `INSERT OR IGNORE INTO "Marriage" ("id","husbandId","wifeId","marriageDate","createdAt") ` +
      `VALUES (${q(`seed_m_${i}`)},${q(pid(m.husband))},${q(pid(m.wife))},${m.date ? q(new Date(m.date).toISOString()) : 'NULL'},${q(NOW)});`,
  );
});

process.stdout.write(out.join('\n') + '\n');
