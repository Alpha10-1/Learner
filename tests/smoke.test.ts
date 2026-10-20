import { describe, expect, it } from 'vitest';
import { parseRoute, toHash, type Route } from '../src/app';

describe('hash router', () => {
  it.each<[string, Route]>([
    ['', { name: 'today' }],
    ['#/today', { name: 'today' }],
    ['#/progress', { name: 'progress' }],
    ['#/lesson/p03-s02-l01', { name: 'lesson', id: 'p03-s02-l01' }],
    ['#/lesson/p03-g03', { name: 'lesson', id: 'p03-g03' }],
    ['#/lesson/p03-x01', { name: 'lesson', id: 'p03-x01' }],
    ['#/lesson/not-a-lesson', { name: 'today' }],
    ['#/lesson/p03-s02-l01/extra', { name: 'today' }],
    ['#/settings', { name: 'today' }],
  ])('parses %j', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('round-trips every route through its canonical hash', () => {
    const routes: Route[] = [{ name: 'today' }, { name: 'progress' }, { name: 'lesson', id: 'p12-s01-l02' }];
    for (const route of routes) expect(parseRoute(toHash(route))).toEqual(route);
  });
});
