// M1: lists the head of the queue from the real content index.
// Frozen daily plans, progress and the boot snapshot arrive in M2; the full screen in M3.
import { useEffect, useState } from 'preact/hooks';
import { queueHead } from '../core/queue';
import type { LessonMeta } from '../core/types';
import { loadContentIndex } from '../data/content';

// Settings defaults (§4) until settings are stored in M2.
const DAILY_TARGET = 4;
const ALONGSIDE_EVERY = 4;

type State = { status: 'loading' } | { status: 'ready'; head: LessonMeta[] } | { status: 'error' };

export function Today() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    loadContentIndex().then(
      (index) => setState({ status: 'ready', head: queueHead(index, new Set(), { target: DAILY_TARGET, alongsideEvery: ALONGSIDE_EVERY }) }),
      () => setState({ status: 'error' }),
    );
  }, []);

  const head = state.status === 'ready' ? state.head : [];
  const minutes = head.reduce((sum, l) => sum + l.minutes, 0);
  const first = head[0];

  return (
    <section aria-labelledby="today-title">
      <h1 id="today-title" class="visually-hidden">
        Today
      </h1>
      <p class="hero">
        {state.status === 'ready' ? head.length : <span aria-hidden="true">–</span>}
        <span class="visually-hidden"> lessons left today</span>
      </p>
      {state.status === 'ready' && head.length > 0 && (
        <p class="muted">
          of {head.length} · ~{minutes} min left
        </p>
      )}
      {state.status === 'ready' && head.length < DAILY_TARGET && (
        <p class="muted">
          {head.length === 0 ? 'No lessons are ready yet.' : `Only ${head.length} lessons are ready.`} Ask Claude Code to author the next content wave.
        </p>
      )}
      {state.status === 'error' && <p class="muted">Couldn't load your lessons. Reload to try again.</p>}
      {head.length > 0 && (
        <ol class="plan">
          {head.map((lesson) => (
            <li key={lesson.id}>
              <a href={`#/lesson/${lesson.id}`}>
                <span>
                  {lesson.visibility === 'private' && <span aria-hidden="true">🔒 </span>}
                  {lesson.title}
                </span>
                <span class="muted">{lesson.minutes} min</span>
              </a>
            </li>
          ))}
        </ol>
      )}
      {first && (
        <a class="button" href={`#/lesson/${first.id}`}>
          Start next lesson
        </a>
      )}
    </section>
  );
}
