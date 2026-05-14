// Shared types between backend and frontend.
// Keep in sync with Prisma schema. Prisma client itself is not exported here
// to avoid pulling backend deps into the frontend bundle.

export type Gender = 'Nam' | 'Nu' | 'Khac';
export type Role = 'admin' | 'editor' | 'viewer';
export type MediaType = 'image' | 'pdf' | 'audio' | 'doc';

export interface Person {
  id: string;
  fullName: string;
  nameNormalized: string;
  honorific: string | null;
  gender: Gender;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  deathYear: number | null;
  deathMonth: number | null;
  deathDay: number | null;
  birthDateLunar: string | null;
  deathDateLunar: string | null;
  biography: string | null;
  occupation: string | null;
  burialPlace: string | null;
  notes: string | null;
  generation: number;
  branchId: string | null;
  fatherId: string | null;
  motherId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonWithRelations extends Person {
  father?: Person | null;
  mother?: Person | null;
  childrenAsFather?: Person[];
  childrenAsMother?: Person[];
  marriagesAsHusband?: Marriage[];
  marriagesAsWife?: Marriage[];
  media?: Media[];
  branch?: Branch | null;
}

export interface Marriage {
  id: string;
  husbandId: string;
  wifeId: string;
  marriageDate: string | null;
  husband?: Person;
  wife?: Person;
}

export interface Branch {
  id: string;
  name: string;
  description: string | null;
}

export interface Media {
  id: string;
  personId: string;
  filePath: string;
  type: MediaType;
  caption: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  role: Role;
}

export interface AuthMeResponse {
  user: User;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface SearchQuery {
  q?: string;
  generation?: number;
  branchId?: string;
  birthYear?: number;
  location?: string;
  limit?: number;
  offset?: number;
}

export interface PersonListResponse {
  items: Person[];
  total: number;
}

// Genders / display labels in Vietnamese
export const GENDER_LABEL: Record<Gender, string> = {
  Nam: 'Nam',
  Nu: 'Nữ',
  Khac: 'Khác',
};
