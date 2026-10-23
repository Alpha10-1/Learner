// Reads lesson markdown files and turns them into LessonMeta + LessonBody (CLAUDE.md §6.2, §6.3).
// File = YAML front matter + "## " sections. The "## Check" section holds **Q:** / **A:** pairs,
// which become `checks`; every other section is rendered into `html`.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { LessonCheck, LessonId, LessonKind, LessonMeta, Visibility } from '../../src/core/types.ts';
import { renderInline, renderMarkdown } from './markdown.ts';

export const SENTINEL = '<!-- mq-private -->';
export const CHECK_HEADING = 'Check';

export interface Section {
  heading: string;
  body: string;
}

export interface ParsedLesson {
  file: string; // path relative to the content dir, with forward slashes
  dirVisibility: Visibility; // from the folder: lessons/ = public, private/ = private
  front: Record<string, unknown>;
  meta: LessonMeta;
  sections: Section[];
  rawChecks: { q: string; a: string }[];
  html: string;
  checks: LessonCheck[];
  errors: string[]; // problems found while parsing (validation adds more)
}

export const sha = (text: string, length: number): string =>
  createHash('sha256').update(text).digest('hex').slice(0, length);

/** All lesson files under content/lessons (public) and content/private (private). */
export function listLessonFiles(contentDir: string): { path: string; rel: string; dirVisibility: Visibility }[] {
  const roots: [string, Visibility][] = [['lessons', 'public'], ['private', 'private']];
  return roots.flatMap(([folder, dirVisibility]) => {
    const root = join(contentDir, folder);
    if (!existsSync(root)) return [];
    return readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => ({ path: join(root, f), rel: `${folder}/${f.split(sep).join('/')}`, dirVisibility }));
  });
}

/** Default order: phase, then skill lessons, then project parts, then the gate. */
export function defaultOrder(id: LessonId): number {
  const phase = Number(id.slice(1, 3)) * 10000;
  const lesson = /-s(\d{2})-l(\d{2})$/.exec(id);
  if (lesson) return phase + Number(lesson[1]) * 100 + Number(lesson[2]);
  const part = /-x(\d{2})$/.exec(id);
  if (part) return phase + 9000 + Number(part[1]);
  return phase + 9900 + Number(id.slice(-2));
}

/** Default prereq: the previous lesson in the same skill, or the previous project part. */
export function defaultPrereqs(id: LessonId): LessonId[] {
  const m = /^(.*-[lx])(\d{2})$/.exec(id);
  if (!m?.[1] || !m[2] || m[2] === '01') return [];
  return [`${m[1]}${String(Number(m[2]) - 1).padStart(2, '0')}`];
}

export function splitFrontMatter(source: string): { front: Record<string, unknown>; body: string } | string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!m?.[1] || m[2] === undefined) return 'missing YAML front matter (--- ... ---)';
  try {
    const front: unknown = parseYaml(m[1]);
    if (!front || typeof front !== 'object' || Array.isArray(front)) return 'front matter is not a YAML mapping';
    return { front: front as Record<string, unknown>, body: m[2] };
  } catch (err) {
    return `front matter is not valid YAML: ${(err as Error).message}`;
  }
}

export function splitSections(body: string): { preamble: string; sections: Section[] } {
  const parts = body.replace(/\r\n/g, '\n').split(/^## +/m);
  const preamble = parts.shift() ?? '';
  const sections = parts.map((part) => {
    const nl = part.indexOf('\n');
    return nl === -1 ? { heading: part.trim(), body: '' } : { heading: part.slice(0, nl).trim(), body: part.slice(nl + 1).trim() };
  });
  return { preamble, sections };
}

export function parseChecks(body: string): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  for (const m of body.matchAll(/\*\*Q:\*\*([\s\S]*?)\*\*A:\*\*([\s\S]*?)(?=\*\*Q:\*\*|$)/g)) {
    out.push({ q: (m[1] ?? '').trim(), a: (m[2] ?? '').trim() });
  }
  return out;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseLesson(file: { path: string; rel: string; dirVisibility: Visibility }): ParsedLesson {
  const source = readFileSync(file.path, 'utf8');
  const errors: string[] = [];
  const split = splitFrontMatter(source);
  const front = typeof split === 'string' ? {} : split.front;
  if (typeof split === 'string') errors.push(split);
  const { preamble, sections } = splitSections(typeof split === 'string' ? '' : split.body);
  if (preamble.trim()) errors.push('text before the first "## " section (the title belongs in front matter)');

  const id = str(front.id);
  const isPrivate = file.dirVisibility === 'private';
  // Enum-like fields are taken as written; validate.ts rejects anything outside the allowed values.
  const meta: LessonMeta = {
    id,
    phase: str(front.phase) || id.slice(0, 3),
    order: typeof front.order === 'number' ? front.order : defaultOrder(id),
    title: str(front.title),
    kind: str(front.kind) as LessonKind,
    minutes: typeof front.minutes === 'number' ? front.minutes : NaN,
    visibility: str(front.visibility) as Visibility,
    status: str(front.status) as LessonMeta['status'],
    prereqs: Array.isArray(front.prereqs) ? front.prereqs.map(String) : defaultPrereqs(id),
    sources: Array.isArray(front.sources) ? (front.sources as LessonMeta['sources']) : [],
    hash: sha(source, 12),
  };
  const skill = str(front.skill) || /^(p\d{2}-s\d{2})-l\d{2}$/.exec(id)?.[1];
  if (skill) meta.skill = skill;
  if (typeof front.evidence === 'string') meta.evidence = front.evidence;

  const checkSection = sections.find((s) => s.heading === CHECK_HEADING);
  const rawChecks = checkSection ? parseChecks(checkSection.body) : [];
  const bodyMd = sections
    .filter((s) => s !== checkSection)
    .map((s) => `## ${s.heading}\n\n${s.body}`)
    .join('\n\n');
  const html = (isPrivate ? `${SENTINEL}\n` : '') + renderMarkdown(bodyMd);
  const checks = rawChecks.map((c) => ({ q: renderInline(c.q), a: renderMarkdown(c.a) }));

  return { file: file.rel, dirVisibility: file.dirVisibility, front, meta, sections, rawChecks, html, checks, errors };
}
