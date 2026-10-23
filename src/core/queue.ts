// Queue order and eligibility (CLAUDE.md §7.2 rules 4–5). Pure: no DOM, no storage, no clock.
// Plans, revisits and streaks build on this in M2.
import type { ContentIndex, LessonId, LessonMeta, Track } from './types';

export interface QueueOptions {
  target: number;
  alongsideEvery: number;
}

const byOrder = (a: LessonMeta, b: LessonMeta): number => a.order - b.order || a.id.localeCompare(b.id);

/**
 * Lessons that can be scheduled now, per track, in queue order: ready, not completed, every
 * prereq completed, gates only once the rest of their phase is done, and main-track phases
 * strictly in sequence (a phase opens when every lesson of the phases before it is done).
 */
export function eligible(index: ContentIndex, completed: ReadonlySet<LessonId>): Record<Track, LessonMeta[]> {
  const trackOf = new Map(index.roadmap.phases.map((p) => [p.id, p.track]));
  const unfinished = (phase: string, except?: LessonId): boolean =>
    index.lessons.some((l) => l.phase === phase && l.id !== except && !completed.has(l.id));
  const openMain = [...index.roadmap.phases]
    .filter((p) => p.track === 'main')
    .sort((a, b) => a.n - b.n)
    .find((p) => unfinished(p.id))?.id;

  const out: Record<Track, LessonMeta[]> = { main: [], alongside: [] };
  for (const lesson of [...index.lessons].sort(byOrder)) {
    if (lesson.status !== 'ready' || completed.has(lesson.id)) continue;
    if (!lesson.prereqs.every((p) => completed.has(p))) continue;
    if (lesson.kind === 'gate' && unfinished(lesson.phase, lesson.id)) continue;
    const track = trackOf.get(lesson.phase) ?? 'main';
    if (track === 'main' && lesson.phase !== openMain) continue;
    out[track].push(lesson);
  }
  return out;
}

/**
 * The next `target` lessons. max(1, ⌊target / alongsideEvery⌋) slots go to the alongside track
 * while it has eligible lessons; if either track runs dry, the other fills its slots. The result
 * is shorter than `target` when fewer lessons are eligible (§7.2 rule 6).
 */
export function queueHead(index: ContentIndex, completed: ReadonlySet<LessonId>, options: QueueOptions): LessonMeta[] {
  const { main, alongside } = eligible(index, completed);
  const alongsideSlots = Math.min(alongside.length, Math.max(1, Math.floor(options.target / options.alongsideEvery)));
  const mainTake = Math.min(main.length, options.target - alongsideSlots);
  const alongsideTake = Math.min(alongside.length, options.target - mainTake);
  return [...main.slice(0, mainTake), ...alongside.slice(0, alongsideTake)];
}
