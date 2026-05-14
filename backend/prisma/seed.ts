// Sample seed data for Roots of Vietnam.
// The fixture demonstrates 4 generations + a multi-spouse case using a generic
// Vietnamese demo family ("Họ Nguyễn" — the most common surname). Replace these
// rows with your own family's data via the UI or by editing this file.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { normalizeName } from '../src/lib/normalize.js';

const prisma = new PrismaClient();

function parseYmd(s: string | undefined): { y: number | null; m: number | null; d: number | null } {
  if (!s) return { y: null, m: null, d: null };
  const parts = s.split('-').map((p) => Number(p));
  return { y: parts[0] ?? null, m: parts[1] ?? null, d: parts[2] ?? null };
}

interface SeedPerson {
  key: string;
  fullName: string;
  gender: 'Nam' | 'Nu' | 'Khac';
  birthDate?: string;
  deathDate?: string;
  occupation?: string;
  burialPlace?: string;
  biography?: string;
  fatherKey?: string;
  motherKey?: string;
  generation: number;
  branch?: string;
}

// Demo family across 4 generations + a multi-spouse case in generation 3.
const PEOPLE: SeedPerson[] = [
  // G1 — Thủy tổ
  {
    key: 'g1.cu_to',
    fullName: 'Nguyễn Văn Thái',
    gender: 'Nam',
    birthDate: '1900-03-12',
    deathDate: '1972-08-04',
    generation: 1,
    branch: 'Trưởng tộc',
    occupation: 'Nông gia',
    burialPlace: 'Quê nhà',
    biography: 'Thủy tổ của dòng họ demo, lập nghiệp tại quê nhà.',
  },
  {
    key: 'g1.cu_ba',
    fullName: 'Trần Thị Mây',
    gender: 'Nu',
    birthDate: '1903-06-18',
    deathDate: '1980-11-22',
    generation: 1,
    burialPlace: 'Quê nhà',
    biography: 'Vợ thủy tổ.',
  },

  // G2
  {
    key: 'g2.con_truong',
    fullName: 'Nguyễn Văn An',
    gender: 'Nam',
    birthDate: '1925-01-05',
    deathDate: '1998-09-30',
    generation: 2,
    branch: 'Trưởng tộc',
    fatherKey: 'g1.cu_to',
    motherKey: 'g1.cu_ba',
    occupation: 'Thầy giáo',
  },
  {
    key: 'g2.con_truong_vo',
    fullName: 'Lê Thị Hồng',
    gender: 'Nu',
    birthDate: '1928-07-22',
    generation: 2,
    occupation: 'Nội trợ',
  },
  {
    key: 'g2.con_thu',
    fullName: 'Nguyễn Văn Bình',
    gender: 'Nam',
    birthDate: '1930-11-15',
    deathDate: '2010-02-01',
    generation: 2,
    branch: 'Chi thứ',
    fatherKey: 'g1.cu_to',
    motherKey: 'g1.cu_ba',
    occupation: 'Công chức',
  },
  {
    key: 'g2.con_gai',
    fullName: 'Nguyễn Thị Lan',
    gender: 'Nu',
    birthDate: '1933-04-09',
    generation: 2,
    fatherKey: 'g1.cu_to',
    motherKey: 'g1.cu_ba',
    occupation: 'Buôn bán',
  },

  // G3
  {
    key: 'g3.chau_dich_ton',
    fullName: 'Nguyễn Văn Cường',
    gender: 'Nam',
    birthDate: '1955-05-21',
    generation: 3,
    branch: 'Trưởng tộc',
    fatherKey: 'g2.con_truong',
    motherKey: 'g2.con_truong_vo',
    occupation: 'Kỹ sư',
  },
  {
    key: 'g3.chau_dich_ton_vo',
    fullName: 'Phạm Thị Hoa',
    gender: 'Nu',
    birthDate: '1958-09-12',
    generation: 3,
    occupation: 'Giáo viên',
  },
  {
    key: 'g3.chau_dich_thu',
    fullName: 'Nguyễn Văn Dũng',
    gender: 'Nam',
    birthDate: '1958-12-03',
    generation: 3,
    fatherKey: 'g2.con_truong',
    motherKey: 'g2.con_truong_vo',
    occupation: 'Bác sĩ',
  },
  {
    key: 'g3.chau_chi_thu',
    fullName: 'Nguyễn Văn Em',
    gender: 'Nam',
    birthDate: '1960-08-17',
    generation: 3,
    branch: 'Chi thứ',
    fatherKey: 'g2.con_thu',
    occupation: 'Thợ rèn',
  },

  // G4
  {
    key: 'g4.chat_truong',
    fullName: 'Nguyễn Văn Phong',
    gender: 'Nam',
    birthDate: '1985-02-14',
    generation: 4,
    branch: 'Trưởng tộc',
    fatherKey: 'g3.chau_dich_ton',
    motherKey: 'g3.chau_dich_ton_vo',
    occupation: 'Lập trình viên',
  },
  {
    key: 'g4.chat_truong_em',
    fullName: 'Nguyễn Thị Quỳnh',
    gender: 'Nu',
    birthDate: '1988-10-30',
    generation: 4,
    fatherKey: 'g3.chau_dich_ton',
    motherKey: 'g3.chau_dich_ton_vo',
    occupation: 'Kiến trúc sư',
  },
  {
    key: 'g4.chat_thu',
    fullName: 'Nguyễn Văn Sơn',
    gender: 'Nam',
    birthDate: '1990-03-08',
    generation: 4,
    fatherKey: 'g3.chau_dich_thu',
    occupation: 'Luật sư',
  },
  {
    key: 'g4.chat_chi_thu',
    fullName: 'Nguyễn Thị Trang',
    gender: 'Nu',
    birthDate: '1992-07-19',
    generation: 4,
    branch: 'Chi thứ',
    fatherKey: 'g3.chau_chi_thu',
    occupation: 'Nhà báo',
  },
  {
    key: 'g4.chat_chi_thu_em',
    fullName: 'Nguyễn Văn Vinh',
    gender: 'Nam',
    birthDate: '1995-12-01',
    generation: 4,
    fatherKey: 'g3.chau_chi_thu',
    occupation: 'Sinh viên',
  },

  // Multi-spouse fixture: Nguyễn Văn Dũng (g3.chau_dich_thu) marries twice;
  // 3 children with the first wife, 2 children with the second.
  {
    key: 'g3.dich_thu_vo1',
    fullName: 'Vũ Thị Lan',
    gender: 'Nu',
    birthDate: '1960-04-12',
    generation: 3,
  },
  {
    key: 'g3.dich_thu_vo2',
    fullName: 'Đỗ Thị Bích',
    gender: 'Nu',
    birthDate: '1965-08-08',
    generation: 3,
  },
  {
    key: 'g4.dich_thu_con1',
    fullName: 'Nguyễn Thị Mai',
    gender: 'Nu',
    birthDate: '1986-02-20',
    generation: 4,
    fatherKey: 'g3.chau_dich_thu',
    motherKey: 'g3.dich_thu_vo1',
  },
  {
    key: 'g4.dich_thu_con2',
    fullName: 'Nguyễn Văn Nam',
    gender: 'Nam',
    birthDate: '1988-09-05',
    generation: 4,
    fatherKey: 'g3.chau_dich_thu',
    motherKey: 'g3.dich_thu_vo1',
  },
  {
    key: 'g4.dich_thu_con3',
    fullName: 'Nguyễn Văn Lộc',
    gender: 'Nam',
    birthDate: '1990-12-30',
    generation: 4,
    fatherKey: 'g3.chau_dich_thu',
    motherKey: 'g3.dich_thu_vo1',
  },
  {
    key: 'g4.dich_thu_con4',
    fullName: 'Nguyễn Thị Hằng',
    gender: 'Nu',
    birthDate: '1995-06-14',
    generation: 4,
    fatherKey: 'g3.chau_dich_thu',
    motherKey: 'g3.dich_thu_vo2',
  },
  {
    key: 'g4.dich_thu_con5',
    fullName: 'Nguyễn Văn Tâm',
    gender: 'Nam',
    birthDate: '1998-01-22',
    generation: 4,
    fatherKey: 'g3.chau_dich_thu',
    motherKey: 'g3.dich_thu_vo2',
  },
];

const MARRIAGES: Array<{ husband: string; wife: string; date?: string }> = [
  { husband: 'g1.cu_to', wife: 'g1.cu_ba', date: '1922-05-10' },
  { husband: 'g2.con_truong', wife: 'g2.con_truong_vo', date: '1950-03-15' },
  { husband: 'g3.chau_dich_ton', wife: 'g3.chau_dich_ton_vo', date: '1980-11-20' },
  // Multi-spouse fixture
  { husband: 'g3.chau_dich_thu', wife: 'g3.dich_thu_vo1', date: '1985-04-10' },
  { husband: 'g3.chau_dich_thu', wife: 'g3.dich_thu_vo2', date: '1994-09-22' },
];

async function main(): Promise<void> {
  // Admin user
  const adminUsername = 'admin';
  const adminPassword = 'changeme';
  // Seed admin keeps a documented default password ("changeme") so the quick-start
  // works. The 10-char policy is enforced on the user-management API path only.
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { username: adminUsername },
    update: { passwordHash, role: 'admin' },
    create: { username: adminUsername, passwordHash, role: 'admin' },
  });
  console.log(`[seed] admin user ready (username: ${adminUsername}, password: ${adminPassword})`);

  // Branches
  const branchNames = Array.from(
    new Set(PEOPLE.map((p) => p.branch).filter((b): b is string => Boolean(b))),
  );
  const branchByName = new Map<string, string>();
  for (const name of branchNames) {
    const branch = await prisma.branch.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    branchByName.set(name, branch.id);
  }

  // Persons: insert without parents first, then patch parents (resolves chicken-and-egg).
  const idByKey = new Map<string, string>();
  for (const p of PEOPLE) {
    const existing = await prisma.person.findFirst({ where: { fullName: p.fullName } });
    const branchId = p.branch ? branchByName.get(p.branch) ?? null : null;
    if (existing) {
      idByKey.set(p.key, existing.id);
      continue;
    }
    const b = parseYmd(p.birthDate);
    const d = parseYmd(p.deathDate);
    const created = await prisma.person.create({
      data: {
        fullName: p.fullName,
        nameNormalized: normalizeName(p.fullName),
        gender: p.gender,
        birthYear: b.y,
        birthMonth: b.m,
        birthDay: b.d,
        deathYear: d.y,
        deathMonth: d.m,
        deathDay: d.d,
        occupation: p.occupation ?? null,
        burialPlace: p.burialPlace ?? null,
        biography: p.biography ?? null,
        generation: p.generation,
        branchId,
      },
    });
    idByKey.set(p.key, created.id);
  }

  // Wire parents
  for (const p of PEOPLE) {
    const id = idByKey.get(p.key);
    if (!id) continue;
    const fatherId = p.fatherKey ? idByKey.get(p.fatherKey) ?? null : null;
    const motherId = p.motherKey ? idByKey.get(p.motherKey) ?? null : null;
    if (fatherId || motherId) {
      await prisma.person.update({
        where: { id },
        data: { fatherId, motherId },
      });
    }
  }

  // Marriages
  for (const m of MARRIAGES) {
    const husbandId = idByKey.get(m.husband);
    const wifeId = idByKey.get(m.wife);
    if (!husbandId || !wifeId) continue;
    await prisma.marriage.upsert({
      where: { husbandId_wifeId: { husbandId, wifeId } },
      update: { marriageDate: m.date ? new Date(m.date) : null },
      create: { husbandId, wifeId, marriageDate: m.date ? new Date(m.date) : null },
    });
  }

  console.log(`[seed] ${PEOPLE.length} persons, ${MARRIAGES.length} marriages seeded`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
