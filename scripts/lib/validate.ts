// Content rules (CLAUDE.md §6.2–6.3): roadmap shape, IDs, folders, visibility, sources,
// prereq DAG, order collisions, lesson shape and word limits. Pure apart from checking that
// docs/sources refs exist on this machine (a warning, since that folder is not in Git).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LESSON_ID, PRIVATE_TITLE, type LessonMeta, type Roadmap } from '../../src/core/types.ts';
import type { ParsedLesson } from './lessons.ts';

export interface Issue {
  file: string;
  message: string;
}

export interface Report {
  errors: Issue[];
  warnings: Issue[];
}

const KINDS = ['learn', 'lab', 'project', 'gate'];
const WHY = 'Why this matters at Tharisa';
const LESSON_SHAPE = [WHY, 'Learn', 'Do', 'Check'];
const words = (md: string): number => md.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function validateRoadmap(roadmap: Roadmap): string[] {
  const errs: string[] = [];
  const phaseIds = new Set(roadmap.phases.map((p) => p.id));
  roadmap.phases.forEach((p, i) => {
    if (p.id !== `p${String(i + 1).padStart(2, '0')}` || p.n !== i + 1) errs.push(`phase ${i + 1} has id ${p.id}`);
    p.skills.forEach((s, j) => {
      if (s.id !== `${p.id}-s${String(j + 1).padStart(2, '0')}` || s.n !== j + 1) errs.push(`skill ${s.id} is out of sequence`);
    });
  });
  for (const g of roadmap.gates) if (!phaseIds.has(g.afterPhase)) errs.push(`gate ${g.id} follows unknown phase ${g.afterPhase}`);
  for (const e of roadmap.portfolio) if (!phaseIds.has(e.phase)) errs.push(`portfolio ${e.id} belongs to unknown phase ${e.phase}`);
  return errs;
}

function checkSections(l: ParsedLesson, err: (m: string) => void): void {
  const headings = l.sections.map((s) => s.heading);
  const body = (h: string): string => l.sections.find((s) => s.heading === h)?.body ?? '';
  const isProjectOrGate = l.meta.kind === 'project' || l.meta.kind === 'gate';
  const core = headings.filter((h) => h !== 'Go deeper');
  if (headings.includes('Go deeper') && headings[headings.length - 1] !== 'Go deeper') err('"Go deeper" must be the last section');
  if (isProjectOrGate) {
    const allowed = [WHY, 'Learn', 'Do', 'Check'];
    if (!core.includes(WHY) || !core.includes('Do')) err(`needs "${WHY}" and "Do" sections`);
    if (core.some((h) => !allowed.includes(h)) || core.join('|') !== allowed.filter((h) => core.includes(h)).join('|')) {
      err(`sections must be, in order, a subset of: ${allowed.join(', ')}, Go deeper`);
    }
  } else if (core.join('|') !== LESSON_SHAPE.join('|')) {
    err(`sections must be, in order: ${LESSON_SHAPE.join(', ')} (then optional Go deeper); found: ${headings.join(', ')}`);
  }
  if (words(body(WHY)) > 80) err(`"${WHY}" has ${words(body(WHY))} words (max 80)`);
  if (words(body('Learn')) > 600) err(`"Learn" has ${words(body('Learn'))} words (max 600)`);
  if (headings.includes('Do') && !/expected result/i.test(body('Do'))) err('"Do" needs an "Expected result" to self-check against');
  const checks = l.rawChecks;
  if (headings.includes('Check') && (checks.length === 0 || checks.some((c) => !c.q || !c.a))) err('"Check" needs **Q:** / **A:** pairs');
  if (!isProjectOrGate && checks.length !== 3) err(`"Check" needs exactly 3 questions, found ${checks.length}`);
  const links = (body('Go deeper').match(/\]\(https?:/g) ?? []).length;
  if (links > 3) err(`"Go deeper" has ${links} links (max 3)`);
}

function checkSources(l: ParsedLesson, docsDir: string, today: string, err: (m: string) => void, warn: (m: string) => void): void {
  const { meta } = l;
  if (meta.status === 'ready' && meta.sources.length === 0) err('ready lessons need at least one source');
  for (const [i, s] of meta.sources.entries()) {
    const where = `source ${i + 1}`;
    if (!s || typeof s !== 'object') { err(`${where} is not a mapping`); continue; }
    if (typeof s.title !== 'string' || !s.title.trim()) err(`${where} needs a title`);
    if (!isDate(s.retrieved)) err(`${where} needs retrieved: YYYY-MM-DD`);
    else if (s.retrieved > today) err(`${where} retrieved date ${s.retrieved} is in the future`);
    if (!s.url && !s.ref) err(`${where} needs a url or a ref`);
    if (s.url !== undefined && (typeof s.url !== 'string' || !s.url.startsWith('https://'))) err(`${where} url must start with https://`);
    if (s.ref !== undefined) {
      const m = typeof s.ref === 'string' ? /^docs\/sources\/([^#]+)(#.*)?$/.exec(s.ref) : null;
      if (!m?.[1]) err(`${where} ref must look like docs/sources/<file>#p3`);
      else if (!existsSync(join(docsDir, m[1]))) warn(`${where} ref ${s.ref} not found on this machine`);
      if (meta.visibility !== 'private') err(`${where} cites docs/sources, so the lesson must be private (content/private/)`);
    }
  }
}

export function validateLessons(roadmap: Roadmap, parsed: ParsedLesson[], all: LessonMeta[], docsDir: string, today: string): Report {
  const report: Report = { errors: [], warnings: [] };
  const allIds = new Set(all.map((l) => l.id));
  const titles = new Set([...roadmap.phases, ...roadmap.phases.flatMap((p) => p.skills), ...roadmap.gates].map((x) => x.title.toLowerCase()));
  const seen = new Map<string, string>();

  for (const l of parsed) {
    const err = (message: string): void => void report.errors.push({ file: l.file, message });
    const warn = (message: string): void => void report.warnings.push({ file: l.file, message });
    const { meta } = l;
    l.errors.forEach(err);
    if (!LESSON_ID.test(meta.id)) { err(`id "${meta.id}" does not match ${LESSON_ID}`); continue; }
    if (seen.has(meta.id)) err(`duplicate id ${meta.id} (also in ${seen.get(meta.id)})`);
    seen.set(meta.id, l.file);
    const folder = l.dirVisibility === 'private' ? 'private' : 'lessons';
    if (l.file !== `${folder}/${meta.id.slice(0, 3)}/${meta.id}.md`) err(`file must be ${folder}/${meta.id.slice(0, 3)}/${meta.id}.md`);

    const phase = roadmap.phases.find((p) => p.id === meta.phase);
    if (!phase || meta.phase !== meta.id.slice(0, 3)) err(`phase must be ${meta.id.slice(0, 3)} and exist in the roadmap`);
    const skillId = /^(p\d{2}-s\d{2})-l\d{2}$/.exec(meta.id)?.[1];
    if (skillId && (meta.skill !== skillId || !phase?.skills.some((s) => s.id === skillId))) err(`skill must be ${skillId} and exist in the roadmap`);
    const isGateId = /-g\d{2}$/.test(meta.id);
    if (isGateId && !roadmap.gates.some((g) => `${g.afterPhase}-${g.id}` === meta.id)) err(`${meta.id} is not a roadmap gate (gate id + the phase it follows)`);
    const expectedKinds = isGateId ? ['gate'] : /-x\d{2}$/.test(meta.id) ? ['project'] : ['learn', 'lab'];
    if (!KINDS.includes(meta.kind) || !expectedKinds.includes(meta.kind)) err(`kind must be ${expectedKinds.join(' or ')}`);

    if (!meta.title.trim()) err('title is required');
    if (meta.visibility === 'private' && (meta.title === PRIVATE_TITLE || titles.has(meta.title.toLowerCase()))) {
      err('private titles must differ from public roadmap titles (they ship publicly; the leak check would fire)');
    }
    if (!Number.isInteger(meta.minutes) || meta.minutes < 15 || meta.minutes > 40) err('minutes must be a whole number from 15 to 40');
    if (meta.visibility !== l.dirVisibility) err(`visibility must be "${l.dirVisibility}" for files under ${folder}/`);
    if (meta.status !== 'ready' && meta.status !== 'stub') err('status must be ready or stub');
    if (!Number.isFinite(meta.order)) err('order must be a number');
    if (meta.evidence !== undefined && !roadmap.portfolio.some((e) => e.id === meta.evidence)) err(`evidence ${meta.evidence} is not a portfolio item`);
    for (const p of meta.prereqs) {
      if (p === meta.id) err('a lesson cannot be its own prereq');
      else if (!allIds.has(p)) err(`prereq ${p} does not exist`);
    }
    checkSources(l, docsDir, today, err, warn);
    if (meta.status === 'ready') checkSections(l, err);
    const md = l.sections.map((s) => s.body).join('\n');
    if (/!\[[^\]]*\]\(/.test(md)) err('images are not supported (CLAUDE.md §12)');
    if (/<\/?[a-z][a-z0-9-]*[\s>/]/i.test(md.replace(/`[^`]*`/g, ''))) warn('raw HTML is escaped, not rendered');
  }

  const orders = new Map<string, string>();
  for (const l of all) {
    const track = roadmap.phases.find((p) => p.id === l.phase)?.track ?? 'main';
    const key = `${track}:${l.order}`;
    if (orders.has(key)) report.errors.push({ file: l.id, message: `order ${l.order} collides with ${orders.get(key)} in the ${track} track` });
    orders.set(key, l.id);
  }
  for (const cycle of findCycles(all)) report.errors.push({ file: cycle[0] ?? '', message: `prereq cycle: ${cycle.join(' → ')}` });
  return report;
}

export function findCycles(lessons: LessonMeta[]): string[][] {
  const prereqs = new Map(lessons.map((l) => [l.id, l.prereqs]));
  const state = new Map<string, 'visiting' | 'done'>();
  const cycles: string[][] = [];
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') { cycles.push([...path.slice(path.indexOf(id)), id]); return; }
    state.set(id, 'visiting');
    for (const p of prereqs.get(id) ?? []) visit(p, [...path, id]);
    state.set(id, 'done');
  };
  for (const id of prereqs.keys()) visit(id, []);
  return cycles;
}
