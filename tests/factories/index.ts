import bcrypt from 'bcryptjs';
import { getPrisma } from '../helpers/app';
import { normalizeName } from '../../backend/src/lib/normalize.js';

let counter = 0;
function uniq(prefix = 'X'): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export interface PersonInput {
  fullName?: string;
  gender?: 'Nam' | 'Nu' | 'Khac';
  generation?: number;
  fatherId?: string | null;
  motherId?: string | null;
  branchId?: string | null;
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
  honorific?: string | null;
  occupation?: string | null;
}

export async function createPerson(input: PersonInput = {}) {
  const prisma = await getPrisma();
  const fullName = input.fullName ?? `Nguyễn Văn ${uniq('P')}`;
  return prisma.person.create({
    data: {
      fullName,
      nameNormalized: normalizeName(fullName),
      gender: input.gender ?? 'Nam',
      generation: input.generation ?? 1,
      fatherId: input.fatherId ?? null,
      motherId: input.motherId ?? null,
      branchId: input.branchId ?? null,
      birthYear: input.birthYear ?? null,
      birthMonth: input.birthMonth ?? null,
      birthDay: input.birthDay ?? null,
      honorific: input.honorific ?? null,
      occupation: input.occupation ?? null,
    },
  });
}

export async function createBranch(name?: string, description?: string) {
  const prisma = await getPrisma();
  return prisma.branch.create({
    data: { name: name ?? uniq('Branch'), description: description ?? null },
  });
}

export type Role = 'admin' | 'editor' | 'viewer';

export async function createUser(
  role: Role,
  password = 'longenoughpw123',
  usernameOverride?: string,
) {
  const prisma = await getPrisma();
  const username = usernameOverride ?? uniq(`u_${role}`);
  return prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 4),
      role,
    },
  });
}

export async function createMarriage(husbandId: string, wifeId: string, dateIso?: string) {
  const prisma = await getPrisma();
  return prisma.marriage.create({
    data: {
      husbandId,
      wifeId,
      marriageDate: dateIso ? new Date(dateIso) : null,
    },
  });
}
