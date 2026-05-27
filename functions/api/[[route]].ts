// Cloudflare Pages Functions entry for the API. Every /api/* request is
// delegated to the shared Hono app. Helper modules live under worker/ (outside
// functions/) so Pages does not treat them as routes.
import { handle } from 'hono/cloudflare-pages';
import app from '../../worker/app';

export const onRequest = handle(app);
