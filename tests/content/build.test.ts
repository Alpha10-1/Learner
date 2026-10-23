import { describe, expect, it } from 'vitest';
import { PRIVATE_TITLE, type LessonBody } from '../../src/core/types.ts';
import { buildContent } from '../../scripts/build-content.ts';
import { defaultOrder, defaultPrereqs, SENTINEL } from '../../scripts/lib/lessons.ts';
import { renderMarkdown } from '../../scripts/lib/markdown.ts';
import { frontMatter, lessonFile, makeRoot, PRIVATE_FRONT } from './fixtures.ts';

const NOW = new Date('2026-10-23T08:00:00Z');

function sampleBuild() {
  const root = makeRoot({
    'content/lessons/p12/p12-s01-l01.md': lessonFile(frontMatter()),
    'content/private/p01/p01-s01-l01.md': lessonFile(PRIVATE_FRONT),
  });
  return buildContent({ root, now: NOW });
}

describe('markdown rendering', () => {
  it('escapes raw HTML instead of passing it through', () => {
    expect(renderMarkdown('Hi <script>alert(1)</script> <b>x</b>')).not.toMatch(/<script|<b>/);
    expect(renderMarkdown('<div onclick="x()">block</div>')).toContain('&lt;div onclick=&quot;x()&quot;&gt;');
  });

  it('opens external links in a new tab with rel="noopener" and drops unsafe links', () => {
    expect(renderMarkdown('[a](https://example.com)')).toContain('<a href="https://example.com" rel="noopener" target="_blank">a</a>');
    expect(renderMarkdown('[a](#do)')).toContain('<a href="#do">a</a>');
    expect(renderMarkdown('[bad](javascript:alert(1))')).not.toContain('href');
  });

  it('renders images as their alt text only', () => {
    expect(renderMarkdown('![a chart](https://example.com/x.png)')).not.toContain('<img');
  });
});

describe('content build', () => {
  it('builds the sample content without errors', () => {
    const build = sampleBuild();
    expect(build.errors).toEqual([]);
    expect(build.indexFile).toBe(`index.${build.index.version}.json`);
    expect(build.index.builtAt).toBe(NOW.toISOString());
  });

  it('puts public bodies in phase chunks, with the Check section split out into checks', () => {
    const build = sampleBuild();
    expect(Object.keys(build.index.chunks)).toEqual(['p12']);
    const chunkName = build.index.chunks.p12?.replace('/content/', '') ?? '';
    const bodies = JSON.parse(build.files.get(chunkName) ?? '[]') as LessonBody[];
    expect(bodies.map((b) => b.id)).toEqual(['p12-s01-l01']);
    expect(bodies[0]?.html).toContain('<h2>Learn</h2>');
    expect(bodies[0]?.html).not.toContain('Check');
    expect(bodies[0]?.checks).toHaveLength(3);
    expect(bodies[0]?.checks[2]?.a).toContain('<code>code</code>');
  });

  it('reduces private lessons in the public index and keeps them out of every public file', () => {
    const build = sampleBuild();
    const entry = build.index.lessons.find((l) => l.id === 'p01-s01-l01');
    expect(entry).toMatchObject({ title: PRIVATE_TITLE, visibility: 'private', status: 'ready', sources: [], hash: '' });
    for (const json of build.files.values()) {
      expect(json).not.toContain('A secret sample title');
      expect(json).not.toContain('mq-private -->');
      expect(json).not.toContain('docs/sources');
    }
  });

  it('writes private titles, bodies and sources to the pack, each body marked with the sentinel', () => {
    const { pack } = sampleBuild();
    expect(pack.format).toBe('mq-private-pack/1');
    expect(pack.lessons).toHaveLength(1);
    expect(pack.lessons[0]).toMatchObject({ id: 'p01-s01-l01', title: 'A secret sample title' });
    expect(pack.lessons[0]?.html.startsWith(SENTINEL)).toBe(true);
    expect(pack.lessons[0]?.sources[0]?.ref).toBe('docs/sources/x.pdf#p2');
  });

  it('generates stubs for unauthored skills, project parts and gates, never for authored skills', () => {
    const { index } = sampleBuild();
    const stubs = index.lessons.filter((l) => l.status === 'stub');
    expect(stubs.some((l) => l.skill === 'p01-s01' || l.skill === 'p12-s01')).toBe(false);
    expect(stubs.filter((l) => l.skill === 'p01-s02')).toHaveLength(3);
    expect(stubs.filter((l) => l.skill === 'p05-s01')).toHaveLength(2);
    expect(stubs.filter((l) => l.kind === 'gate').map((l) => l.id)).toContain('p10-g08');
    expect(stubs.filter((l) => l.kind === 'gate')).toHaveLength(10);
    expect(stubs.filter((l) => l.kind === 'project')).toHaveLength(32);
    expect(index.lessons.length).toBeGreaterThan(300);
  });

  it('is deterministic apart from builtAt', () => {
    const a = sampleBuild();
    const b = sampleBuild();
    expect(a.indexFile).toBe(b.indexFile);
    expect([...a.files.keys()]).toEqual([...b.files.keys()]);
  });
});

describe('default order and prereqs', () => {
  it('orders lessons, then project parts, then the gate within a phase', () => {
    expect(defaultOrder('p03-s02-l01')).toBe(30201);
    expect(defaultOrder('p03-x01')).toBe(39001);
    expect(defaultOrder('p03-g03')).toBe(39903);
    expect(defaultOrder('p03-s08-l04')).toBeLessThan(defaultOrder('p03-x01'));
  });

  it('defaults to the previous lesson of the same skill or the previous project part', () => {
    expect(defaultPrereqs('p03-s02-l01')).toEqual([]);
    expect(defaultPrereqs('p03-s02-l03')).toEqual(['p03-s02-l02']);
    expect(defaultPrereqs('p05-x02')).toEqual(['p05-x01']);
    expect(defaultPrereqs('p03-g03')).toEqual([]);
  });
});
