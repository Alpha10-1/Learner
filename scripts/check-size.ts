// Gzip size budgets from CLAUDE.md §3. Runs after `vite build` and exits 1 if any budget is exceeded.
// Sizes use node:zlib at its default level, which is how Vite reports gzip sizes in its build output.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

interface Budget {
  label: string;
  limit: number;
  files: string[];
}

const KB = 1024;
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

if (!existsSync(dist)) {
  console.error('check-size: dist/ not found. Run `vite build` first.');
  process.exit(1);
}

const files = readdirSync(dist, { recursive: true, encoding: 'utf8' })
  .filter((file) => statSync(join(dist, file)).isFile())
  .map((file) => file.split(sep).join('/'));

const gzipSize = (file: string): number => gzipSync(readFileSync(join(dist, file))).length;
const isServiceWorker = (file: string): boolean => file === 'sw.js';
const isContentChunk = (file: string): boolean => file.startsWith('content/') && file.endsWith('.json');

if (!files.some(isServiceWorker)) {
  console.error('check-size: dist/sw.js is missing; the service worker was not built.');
  process.exit(1);
}

const budgets: Budget[] = [
  { label: 'app JS', limit: 50 * KB, files: files.filter((f) => f.endsWith('.js') && !isServiceWorker(f)) },
  { label: 'CSS', limit: 10 * KB, files: files.filter((f) => f.endsWith('.css')) },
  { label: 'sw.js', limit: 15 * KB, files: files.filter(isServiceWorker) },
  ...files.filter(isContentChunk).map((f) => ({ label: f, limit: 80 * KB, files: [f] })),
];

const kb = (bytes: number): string => `${(bytes / KB).toFixed(1)} KB`;
let failed = false;

for (const budget of budgets) {
  const sizes = budget.files.map((file) => ({ file, size: gzipSize(file) }));
  const total = sizes.reduce((sum, { size }) => sum + size, 0);
  const ok = total <= budget.limit;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${budget.label.padEnd(24)} ${kb(total).padStart(9)} / ${kb(budget.limit)} gzip`);
  if (budget.files.length > 1 || budget.label !== budget.files[0]) {
    for (const { file, size } of sizes) console.log(`       ${file.padEnd(40)} ${kb(size).padStart(9)}`);
  }
}

if (failed) {
  console.error('check-size: budget exceeded (CLAUDE.md §3).');
  process.exit(1);
}
