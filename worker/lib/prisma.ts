import { PrismaClient } from '../../prisma/generated';
import { PrismaD1 } from '@prisma/adapter-d1';
import type { Env } from '../types';

// One PrismaClient per request, bound to the request's D1 instance. The D1
// binding is only reachable inside a Worker invocation, so unlike the Express
// backend there is no module-level singleton.
export function getPrisma(env: Env): PrismaClient {
  const adapter = new PrismaD1(env.DB);
  return new PrismaClient({ adapter });
}
