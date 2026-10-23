import { describe, expect, it } from 'vitest';
import { eligible, queueHead } from '../../src/core/queue';
import type { ContentIndex, LessonMeta, Phase } from '../../src/core/types';

const phase = (n: number, track: Phase['track'] = 'main'): Phase => ({
  id: `p${String(n).padStart(2, '0')}`, n, title: `Phase ${n}`, label: 'FOUNDATION', track, competence: '', skills: [],
});

const lesson = (id: string, overrides: Partial<LessonMeta> = {}): LessonMeta => ({
  id,
  phase: id.slice(0, 3),
  order: Number(id.slice(1, 3)) * 10000 + Number(id.slice(-2)),
  title: id,
  kind: /-g\d{2}$/.test(id) ? 'gate' : 'learn',
  minutes: 25,
  visibility: 'public',
  status: 'ready',
  prereqs: [],
  sources: [],
  hash: '',
  ...overrides,
});

function index(lessons: LessonMeta[]): ContentIndex {
  return {
    version: 'test', builtAt: '', chunks: {}, lessons,
    roadmap: {
      id: 'alfah-lubisi-skills-mastery', sourceDoc: '', sourceDate: '', notes: [], gates: [], certifications: [], portfolio: [],
      phases: [phase(1), phase(2), phase(8), phase(12, 'alongside')],
    },
  };
}

const opts = { target: 4, alongsideEvery: 4 };
const ids = (ls: LessonMeta[]): string[] => ls.map((l) => l.id);

describe('queue', () => {
  it('interleaves 3 main + 1 alongside at target 4 (§7.6)', () => {
    const idx = index(['p01-s01-l01', 'p01-s01-l02', 'p01-s01-l03', 'p01-s01-l04', 'p12-s01-l01', 'p12-s01-l02'].map((id) => lesson(id)));
    expect(ids(queueHead(idx, new Set(), opts))).toEqual(['p01-s01-l01', 'p01-s01-l02', 'p01-s01-l03', 'p12-s01-l01']);
  });

  it('lets either track fill the other when it runs dry, and shrinks when both do', () => {
    const fewMain = index(['p01-s01-l01', 'p12-s01-l01', 'p12-s01-l02', 'p12-s01-l03'].map((id) => lesson(id)));
    expect(ids(queueHead(fewMain, new Set(), opts))).toEqual(['p01-s01-l01', 'p12-s01-l01', 'p12-s01-l02', 'p12-s01-l03']);
    const onlyMain = index(['p01-s01-l01', 'p01-s01-l02'].map((id) => lesson(id)));
    expect(ids(queueHead(onlyMain, new Set(), opts))).toEqual(['p01-s01-l01', 'p01-s01-l02']);
  });

  it('never schedules stubs or completed lessons, and waits for prereqs', () => {
    const idx = index([
      lesson('p01-s01-l01'),
      lesson('p01-s01-l02', { prereqs: ['p01-s01-l01'] }),
      lesson('p01-s01-l03', { status: 'stub' }),
    ]);
    expect(ids(eligible(idx, new Set()).main)).toEqual(['p01-s01-l01']);
    expect(ids(eligible(idx, new Set(['p01-s01-l01'])).main)).toEqual(['p01-s01-l02']);
  });

  it('keeps a gate back until every other lesson of its phase is complete (§7.6)', () => {
    const idx = index([lesson('p01-s01-l01'), lesson('p01-s01-l02'), lesson('p01-g01')]);
    expect(ids(eligible(idx, new Set(['p01-s01-l01'])).main)).toEqual(['p01-s01-l02']);
    expect(ids(eligible(idx, new Set(['p01-s01-l01', 'p01-s01-l02'])).main)).toEqual(['p01-g01']);
  });

  it('runs main-track phases strictly in sequence', () => {
    const idx = index([lesson('p01-s01-l01'), lesson('p01-s01-l02', { status: 'stub' }), lesson('p02-s01-l01')]);
    expect(ids(eligible(idx, new Set(['p01-s01-l01'])).main)).toEqual([]);
    expect(ids(eligible(idx, new Set(['p01-s01-l01', 'p01-s01-l02'])).main)).toEqual(['p02-s01-l01']);
  });

  it('holds the AI-901 hands-on lesson back until its p08 prereqs are done (§7.6)', () => {
    const handsOn = lesson('p12-s09-l02', { prereqs: ['p08-s01-l01'] });
    const idx = index([lesson('p12-s09-l01'), handsOn, lesson('p08-s01-l01')]);
    expect(ids(eligible(idx, new Set(['p12-s09-l01'])).alongside)).toEqual([]);
    expect(ids(eligible(idx, new Set(['p12-s09-l01', 'p08-s01-l01'])).alongside)).toEqual(['p12-s09-l02']);
  });
});
