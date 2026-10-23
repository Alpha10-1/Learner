// Content checks (CLAUDE.md §6.2–6.3). Exits 1 on any error.
//   node scripts/content-check.ts         validate all lessons; print per-phase counts and runway
//   node scripts/content-check.ts --dist  leak scan: dist/ must not contain private titles, the
//                                         private-body sentinel, or docs/sources paths
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import { buildContent, formatIssues, ROOT } from './build-content.ts';
import { escapeHtml } from './lib/markdown.ts';
import { SENTINEL } from './lib/lessons.ts';

const DAILY_TARGET = 4; // default Settings.dailyTarget (§4)
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2']);

function checkContent(): number {
  const build = buildContent();
  for (const line of formatIssues(build)) console.log(line);
  const { lessons, roadmap } = build.index;
  for (const phase of roadmap.phases) {
    const inPhase = lessons.filter((l) => l.phase === phase.id);
    const ready = inPhase.filter((l) => l.status === 'ready');
    const priv = ready.filter((l) => l.visibility === 'private').length;
    console.log(`${phase.id} ${phase.track === 'alongside' ? 'alongside' : 'main     '} ${String(ready.length).padStart(3)} ready (${priv} private) / ${String(inPhase.length).padStart(3)} total  ${phase.title}`);
  }
  const ready = lessons.filter((l) => l.status === 'ready').length;
  console.log(`total: ${ready} ready / ${lessons.length} lessons (incl. stubs); runway ≤ ${Math.floor(ready / DAILY_TARGET)} days at ${DAILY_TARGET}/day before any completions`);
  console.log(build.errors.length ? `content-check: ${build.errors.length} error(s)` : 'content-check: ok');
  return build.errors.length ? 1 : 0;
}

function checkDist(): number {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) {
    console.error('content-check --dist: dist/ not found. Run `vite build` first.');
    return 1;
  }
  const privateTitles = buildContent().parsed.filter((p) => p.dirVisibility === 'private' && p.meta.title.trim()).map((p) => p.meta.title);
  // Each needle is also searched for in its JSON-escaped and HTML-escaped forms.
  const needles = [SENTINEL.replace('<!-- ', ''), 'docs/sources/', ...privateTitles].flatMap((n) => [
    ...new Set([n, JSON.stringify(n).slice(1, -1), escapeHtml(n)]),
  ]);
  const files = readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((f) => statSync(join(dist, f)).isFile());
  const leaks: string[] = [];
  for (const file of files) {
    const name = file.split(sep).join('/');
    if (name.endsWith('private-pack.json')) leaks.push(`${name}: the private pack must never be in dist/`);
    if (BINARY.has(extname(file).toLowerCase())) continue;
    const text = readFileSync(join(dist, file), 'utf8');
    for (const needle of needles) if (text.includes(needle)) leaks.push(`${name}: contains "${needle}"`);
  }
  for (const leak of leaks) console.error(`LEAK ${leak}`);
  console.log(leaks.length ? `content-check --dist: ${leaks.length} leak(s)` : `content-check --dist: ok (${files.length} files, ${privateTitles.length} private titles checked)`);
  return leaks.length ? 1 : 0;
}

process.exit(process.argv.includes('--dist') ? checkDist() : checkContent());
