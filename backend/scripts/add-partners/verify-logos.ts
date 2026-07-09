/**
 * Purpose: verifies every NEW_PARTNERS slug has a real image at
 * nexus-website/public/partners/<slug>.png.
 *
 * Checks: file exists, > 1KB, and starts with PNG/JPEG/WebP magic bytes.
 * Run from nexus-website/backend: npx tsx scripts/add-partners/verify-logos.ts
 */
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { NEW_PARTNERS } from './partners.data';

const dir = join(__dirname, '..', '..', '..', 'public', 'partners');
const magics: Array<{ name: string; bytes: number[] }> = [
  { name: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { name: 'webp(riff)', bytes: [0x52, 0x49, 0x46, 0x46] },
];

let failures = 0;
for (const p of NEW_PARTNERS) {
  const file = join(dir, `${p.slug}.png`);
  try {
    const size = statSync(file).size;
    const head = readFileSync(file).subarray(0, 4);
    const isImage = magics.some((m) => m.bytes.every((b, i) => head[i] === b));
    if (size < 1024 || !isImage) {
      console.error(`FAIL ${p.slug}: size=${size} magic=${head.toString('hex')}`);
      failures++;
    }
  } catch {
    console.error(`FAIL ${p.slug}: missing file`);
    failures++;
  }
}
console.log(failures === 0 ? `OK: all ${NEW_PARTNERS.length} logos verified` : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
