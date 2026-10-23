import { useEffect, useState } from 'preact/hooks';
import { LESSON_ID } from './core/types';
import { Lesson } from './screens/Lesson';
import { Progress } from './screens/Progress';
import { Today } from './screens/Today';

export type Route = { name: 'today' } | { name: 'lesson'; id: string } | { name: 'progress' };

/** Maps a location hash to a route. Anything unknown falls back to Today. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/progress') return { name: 'progress' };
  const id = /^\/lesson\/([^/]+)$/.exec(path)?.[1];
  if (id !== undefined && LESSON_ID.test(id)) return { name: 'lesson', id };
  return { name: 'today' };
}

/** The canonical hash for a route, so unknown or empty hashes can be normalised. */
export function toHash(route: Route): string {
  return route.name === 'lesson' ? `#/lesson/${route.id}` : `#/${route.name}`;
}

function currentRoute(): Route {
  const route = parseRoute(location.hash);
  const hash = toHash(route);
  if (location.hash !== hash) history.replaceState(null, '', hash);
  return route;
}

export function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <>
      <main>
        {route.name === 'today' && <Today />}
        {route.name === 'lesson' && <Lesson id={route.id} />}
        {route.name === 'progress' && <Progress />}
      </main>
      <nav class="tabs" aria-label="Main">
        <a href="#/today" aria-current={route.name === 'today' ? 'page' : undefined}>
          Today
        </a>
        <a href="#/progress" aria-current={route.name === 'progress' ? 'page' : undefined}>
          Progress
        </a>
      </nav>
    </>
  );
}
