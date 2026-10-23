import { describe, expect, it } from 'vitest';
import { buildContent } from '../../scripts/build-content.ts';
import { findCycles } from '../../scripts/lib/validate.ts';
import { frontMatter, lessonFile, makeRoot, PRIVATE_FRONT, VALID_BODY } from './fixtures.ts';

const NOW = new Date('2026-10-23T08:00:00Z');

/** Builds one lesson file and returns the error messages. */
function errorsFor(rel: string, text: string): string[] {
  return buildContent({ root: makeRoot({ [rel]: text }), now: NOW }).errors.map((e) => e.message);
}

const PUBLIC = 'content/lessons/p12/p12-s01-l01.md';
const PRIVATE = 'content/private/p01/p01-s01-l01.md';

describe('content validation', () => {
  it('accepts valid public and private lessons', () => {
    expect(errorsFor(PUBLIC, lessonFile(frontMatter()))).toEqual([]);
    expect(errorsFor(PRIVATE, lessonFile(PRIVATE_FRONT))).toEqual([]);
  });

  it('requires lessons citing docs/sources to be private', () => {
    const front = frontMatter({ sources: [{ title: 'Wiki', ref: 'docs/sources/x.pdf#p1', retrieved: '2026-10-01' }] });
    expect(errorsFor(PUBLIC, lessonFile(front)).join()).toMatch(/must be private/);
  });

  it('requires the folder to match the visibility', () => {
    expect(errorsFor(PRIVATE, lessonFile(frontMatter({ id: 'p01-s01-l01' }))).join()).toMatch(/visibility must be "private"/);
  });

  it('rejects private titles that repeat a public roadmap title', () => {
    const front = { ...PRIVATE_FRONT, title: 'Mining and material movement' };
    expect(errorsFor(PRIVATE, lessonFile(front)).join()).toMatch(/private titles must differ/);
  });

  it('checks the file name, ID format, kind and minutes', () => {
    expect(errorsFor('content/lessons/p12/wrong-name.md', lessonFile(frontMatter())).join()).toMatch(/file must be/);
    expect(errorsFor(PUBLIC, lessonFile(frontMatter({ id: 'p12-lesson-1' }))).join()).toMatch(/does not match/);
    expect(errorsFor(PUBLIC, lessonFile(frontMatter({ kind: 'gate' }))).join()).toMatch(/kind must be learn or lab/);
    expect(errorsFor(PUBLIC, lessonFile(frontMatter({ minutes: 90 }))).join()).toMatch(/minutes/);
  });

  it('requires dated https sources on ready lessons', () => {
    expect(errorsFor(PUBLIC, lessonFile(frontMatter({ sources: [] }))).join()).toMatch(/at least one source/);
    const bad = [{ title: 'x', url: 'http://example.com', retrieved: '23 Oct' }];
    const messages = errorsFor(PUBLIC, lessonFile(frontMatter({ sources: bad }))).join();
    expect(messages).toMatch(/retrieved: YYYY-MM-DD/);
    expect(messages).toMatch(/https:\/\//);
    const future = [{ title: 'x', url: 'https://example.com', retrieved: '2027-01-01' }];
    expect(errorsFor(PUBLIC, lessonFile(frontMatter({ sources: future }))).join()).toMatch(/in the future/);
  });

  it('enforces the lesson shape: section order, three checks, an expected result', () => {
    const noDo = VALID_BODY.replace(/## Do[\s\S]*?(?=## Check)/, '');
    expect(errorsFor(PUBLIC, lessonFile(frontMatter(), noDo)).join()).toMatch(/sections must be, in order/);
    const twoChecks = VALID_BODY.replace(/\*\*Q:\*\* Third[\s\S]*$/, '');
    expect(errorsFor(PUBLIC, lessonFile(frontMatter(), twoChecks)).join()).toMatch(/exactly 3 questions/);
    const noExpected = VALID_BODY.replace('**Expected result:** it worked.', '');
    expect(errorsFor(PUBLIC, lessonFile(frontMatter(), noExpected)).join()).toMatch(/Expected result/);
  });

  it('enforces word limits', () => {
    const longWhy = VALID_BODY.replace('Short reason with <b>raw html</b>.', 'word '.repeat(81));
    expect(errorsFor(PUBLIC, lessonFile(frontMatter(), longWhy)).join()).toMatch(/max 80/);
  });

  it('rejects unknown prereqs and images', () => {
    expect(errorsFor(PUBLIC, lessonFile(frontMatter({ prereqs: ['p08-s09-l01'] }))).join()).toMatch(/does not exist/);
    const withImage = VALID_BODY.replace('## Do', '![chart](https://example.com/x.png)\n\n## Do');
    expect(errorsFor(PUBLIC, lessonFile(frontMatter(), withImage)).join()).toMatch(/images are not supported/);
  });

  it('finds prereq cycles', () => {
    const lesson = (id: string, prereqs: string[]) => ({
      id, phase: 'p01', order: 1, title: id, kind: 'learn' as const, minutes: 25, visibility: 'public' as const,
      status: 'ready' as const, prereqs, sources: [], hash: '',
    });
    expect(findCycles([lesson('a', ['b']), lesson('b', ['c']), lesson('c', ['a'])])).toEqual([['a', 'b', 'c', 'a']]);
    expect(findCycles([lesson('a', []), lesson('b', ['a'])])).toEqual([]);
  });

  it('accepts the real content in this repository', () => {
    const build = buildContent({ now: NOW });
    expect(build.errors).toEqual([]);
    expect(build.index.roadmap.phases).toHaveLength(16);
  });
});
