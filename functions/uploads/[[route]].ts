// Cloudflare Pages Functions entry for uploaded media (served from R2 by the
// shared Hono app). Kept separate from /api/* so _routes.json can include both
// while leaving SPA routes to the static asset server.
import { handle } from 'hono/cloudflare-pages';
import app from '../../worker/app';

export const onRequest = handle(app);
