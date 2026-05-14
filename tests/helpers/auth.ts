import type { Express } from 'express';
import request from 'supertest';
import { createUser, type Role } from '../factories';

export interface AuthedAgent {
  cookie: string;
  role: Role;
  userId: string;
  username: string;
}

export async function loginAs(
  app: Express,
  role: Role,
  password = 'longenoughpw123',
): Promise<AuthedAgent> {
  const user = await createUser(role, password);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${role}) failed: ${res.status} ${res.text}`);
  }
  const cookieHeader = res.headers['set-cookie'];
  const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
  const tokenCookie = cookies.find((c) => c?.startsWith('roots_token='));
  if (!tokenCookie) throw new Error('roots_token cookie missing');
  return {
    cookie: tokenCookie.split(';')[0]!,
    role,
    userId: user.id,
    username: user.username,
  };
}
