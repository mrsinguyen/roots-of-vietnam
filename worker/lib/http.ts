import type { Context } from 'hono';

// Parse a JSON body, returning {} when the body is empty or invalid so zod
// validation produces the same 400 the Express backend gave (rather than Hono
// throwing on an empty body).
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}
