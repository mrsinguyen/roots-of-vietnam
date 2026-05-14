import fs from 'node:fs/promises';
import path from 'node:path';
import { prune } from '../src/lib/backup.js';

const dir = path.resolve(process.cwd(), '../backups');

async function main(): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < 12; i++) {
    const f = path.join(dir, `backup-test-${i.toString().padStart(2, '0')}.json`);
    await fs.writeFile(f, '{}');
    const t = new Date(Date.now() - (12 - i) * 1000);
    await fs.utimes(f, t, t);
  }
  await prune(10);
  const remaining = (await fs.readdir(dir)).filter((f) => f.startsWith('backup-test-'));
  console.log('remaining test files:', remaining.length);
  if (remaining.length !== 10) {
    console.error(`FAIL: expected 10, got ${remaining.length}`);
    process.exitCode = 1;
  } else {
    console.log('PASS: rolling-10 retention');
  }
  for (const f of remaining) await fs.unlink(path.join(dir, f));
}

main();
