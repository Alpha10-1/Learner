// Content build (CLAUDE.md §6.2): content/**.md → .generated/content/index.<hash>.json + one chunk
// per phase with public bodies only; with --private, also dist-private/private-pack.json.
// Usage: node scripts/build-content.ts [--private]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVATE_TITLE, type ContentIndex, type LessonBody, type LessonMeta, type PrivatePack, type Roadmap } from '../src/core/types.ts';
import { listLessonFiles, parseLesson, sha, type ParsedLesson } from './lib/lessons.ts';
import { generateStubs } from './lib/stubs.ts';
import { validateLessons, validateRoadmap, type Issue } from './lib/validate.ts';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

export interface ContentBuild {
  index: ContentIndex;
  indexFile: string; // e.g. 'index.3f2a9c1b0d.json'
  files: Map<string, string>; // file name → JSON, everything that ships under /content/
  pack: PrivatePack;
  parsed: ParsedLesson[];
  errors: Issue[];
  warnings: Issue[];
}

export interface BuildOptions {
  root?: string;
  now?: Date;
}

const byOrder = (a: LessonMeta, b: LessonMeta): number => a.order - b.order || a.id.localeCompare(b.id);

/** What the public index may say about a private lesson (§6.2). */
function publicView(meta: LessonMeta): LessonMeta {
  if (meta.visibility === 'public') return meta;
  const { id, phase, skill, order, kind, minutes, visibility, status, prereqs } = meta;
  return { id, phase, ...(skill ? { skill } : {}), order, kind, minutes, visibility, status, prereqs, title: PRIVATE_TITLE, sources: [], hash: '' };
}

export function buildContent({ root = ROOT, now = new Date() }: BuildOptions = {}): ContentBuild {
  const contentDir = join(root, 'content');
  const roadmap = JSON.parse(readFileSync(join(contentDir, 'roadmap.json'), 'utf8')) as Roadmap;
  const errors: Issue[] = validateRoadmap(roadmap).map((message) => ({ file: 'roadmap.json', message }));

  const parsed = listLessonFiles(contentDir).map(parseLesson);
  const authored = parsed.map((p) => p.meta);
  const all = [...authored, ...generateStubs(roadmap, authored)].sort(byOrder);
  const report = validateLessons(roadmap, parsed, all, join(root, 'docs', 'sources'), now.toISOString().slice(0, 10));
  errors.push(...report.errors);

  const ready = parsed.filter((p) => p.meta.status === 'ready');
  const files = new Map<string, string>();
  const chunks: Record<string, string> = {};
  for (const phase of roadmap.phases) {
    const bodies: LessonBody[] = ready
      .filter((p) => p.meta.visibility === 'public' && p.meta.phase === phase.id)
      .sort((a, b) => byOrder(a.meta, b.meta))
      .map((p) => ({ id: p.meta.id, html: p.html, checks: p.checks }));
    if (!bodies.length) continue;
    const json = JSON.stringify(bodies);
    const name = `${phase.id}.${sha(json, 10)}.json`;
    files.set(name, json);
    chunks[phase.id] = `/content/${name}`;
  }

  const lessons = all.map(publicView);
  const version = sha(JSON.stringify({ roadmap, lessons, chunks }), 10);
  const builtAt = now.toISOString();
  const index: ContentIndex = { version, builtAt, roadmap, lessons, chunks };
  const indexFile = `index.${version}.json`;
  files.set(indexFile, JSON.stringify(index));

  const packLessons = ready
    .filter((p) => p.meta.visibility === 'private')
    .sort((a, b) => byOrder(a.meta, b.meta))
    .map((p) => ({ id: p.meta.id, title: p.meta.title, html: p.html, checks: p.checks, sources: p.meta.sources }));
  const pack: PrivatePack = { format: 'mq-private-pack/1', version: sha(JSON.stringify(packLessons), 10), builtAt, lessons: packLessons };

  return { index, indexFile, files, pack, parsed, errors, warnings: report.warnings };
}

export function writeGenerated(build: ContentBuild, root = ROOT): string {
  const dir = join(root, '.generated', 'content');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, json] of build.files) writeFileSync(join(dir, name), json);
  return dir;
}

export function writePrivatePack(build: ContentBuild, root = ROOT): string {
  const dir = join(root, 'dist-private');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'private-pack.json');
  writeFileSync(file, JSON.stringify(build.pack));
  return file;
}

export function formatIssues(build: ContentBuild): string[] {
  return [
    ...build.errors.map((i) => `error   ${i.file}: ${i.message}`),
    ...build.warnings.map((i) => `warning ${i.file}: ${i.message}`),
  ];
}

if (import.meta.main) {
  const build = buildContent();
  for (const line of formatIssues(build)) console.log(line);
  if (build.errors.length) {
    console.error(`build-content: ${build.errors.length} error(s); nothing written.`);
    process.exit(1);
  }
  const dir = writeGenerated(build);
  const ready = build.index.lessons.filter((l) => l.status === 'ready').length;
  console.log(`build-content: ${build.index.lessons.length} lessons (${ready} ready) → ${dir} (${build.files.size} files, version ${build.index.version})`);
  if (process.argv.includes('--private')) {
    console.log(`build-content: ${build.pack.lessons.length} private lesson(s) → ${writePrivatePack(build)}`);
  }
}
