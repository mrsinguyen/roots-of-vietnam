// Standalone Cron Worker that replaces the Express `autoBackupIfStale()` boot
// hook. Cloudflare Pages Functions do NOT support cron triggers, so this is
// deployed as its own Worker (wrangler.cron.toml) bound to the same D1 + R2.
// Deploy: wrangler deploy -c wrangler.cron.toml
import { getPrisma } from './lib/prisma';
import { autoBackupIfStale } from './lib/backup';
import type { Env } from './types';

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      autoBackupIfStale(getPrisma(env), env)
        .then((r) => {
          if (r.ran) console.log(`[cron] auto-backup wrote ${r.filename}`);
        })
        .catch((err) => console.error('[cron] auto-backup failed', err)),
    );
  },
};
