// Stub entries for roadmap items with no authored lessons, so the queue's shape and the
// progress totals are visible from day 1 (CLAUDE.md §6.2). Stubs are never scheduled.
// A skill gets stubs only while it has no authored lessons; the same goes for a phase's
// project parts and for each gate.
import type { LessonKind, LessonMeta, Roadmap } from '../../src/core/types.ts';
import { defaultOrder, defaultPrereqs } from './lessons.ts';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Planned lessons per skill (§6.3 depth: phases 1–4 get more), giving ~350 lessons in total. */
export const stubsPerSkill = (phaseN: number): number => (phaseN <= 4 ? 3 : 2);
export const PARTS_PER_PORTFOLIO_ITEM = 2;

function stub(id: string, phase: string, title: string, kind: LessonKind, extra: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id,
    phase,
    order: defaultOrder(id),
    title,
    kind,
    minutes: kind === 'gate' ? 30 : 25,
    visibility: 'public',
    status: 'stub',
    prereqs: defaultPrereqs(id),
    sources: [],
    hash: '',
    ...extra,
  };
}

export function generateStubs(roadmap: Roadmap, authored: LessonMeta[]): LessonMeta[] {
  const out: LessonMeta[] = [];
  for (const phase of roadmap.phases) {
    for (const skill of phase.skills) {
      if (authored.some((l) => l.skill === skill.id)) continue;
      const n = stubsPerSkill(phase.n);
      for (let k = 1; k <= n; k++) {
        out.push(stub(`${skill.id}-l${pad(k)}`, phase.id, `${skill.title} (${k} of ${n})`, 'learn', { skill: skill.id }));
      }
    }

    const items = roadmap.portfolio.filter((e) => e.phase === phase.id);
    if (items.length && !authored.some((l) => l.phase === phase.id && l.kind === 'project')) {
      let x = 0;
      for (const item of items) {
        for (let part = 1; part <= PARTS_PER_PORTFOLIO_ITEM; part++) {
          x++;
          const title = `Project: ${item.title} (part ${part} of ${PARTS_PER_PORTFOLIO_ITEM})`;
          out.push(stub(`${phase.id}-x${pad(x)}`, phase.id, title, 'project', { evidence: item.id }));
        }
      }
    }

    for (const gate of roadmap.gates.filter((g) => g.afterPhase === phase.id)) {
      const id = `${phase.id}-${gate.id}`;
      if (!authored.some((l) => l.id === id)) out.push(stub(id, phase.id, `Gate ${gate.n}: ${gate.title}`, 'gate'));
    }
  }
  return out;
}
