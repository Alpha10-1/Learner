// Builds throwaway content folders for pipeline tests.
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const REAL_ROADMAP = fileURLToPath(new URL('../../content/roadmap.json', import.meta.url));

export const VALID_BODY = `## Why this matters at Tharisa

Short reason with <b>raw html</b>.

## Learn

Read the [docs](https://example.com/docs) and the [local note](#do). Avoid [this](javascript:alert(1)).

## Do

1. Do the thing.

**Expected result:** it worked.

## Check

**Q:** First question?
**A:** First answer.

**Q:** Second question?
**A:** Second answer.

**Q:** Third question?
**A:** Third answer with \`code\`.
`;

export function frontMatter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p12-s01-l01',
    title: 'A public sample',
    kind: 'learn',
    minutes: 25,
    visibility: 'public',
    status: 'ready',
    sources: [{ title: 'Example', url: 'https://example.com', retrieved: '2026-10-01' }],
    ...overrides,
  };
}

export function lessonFile(front: Record<string, unknown>, body = VALID_BODY): string {
  return `---\n${stringify(front)}---\n\n${body}`;
}

/** A temp project root with the real roadmap, docs/sources/x.pdf, and the given lesson files. */
export function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mq-content-'));
  mkdirSync(join(root, 'content'), { recursive: true });
  copyFileSync(REAL_ROADMAP, join(root, 'content', 'roadmap.json'));
  mkdirSync(join(root, 'docs', 'sources'), { recursive: true });
  writeFileSync(join(root, 'docs', 'sources', 'x.pdf'), '');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

export const PRIVATE_FRONT = frontMatter({
  id: 'p01-s01-l01',
  title: 'A secret sample title',
  visibility: 'private',
  sources: [{ title: 'Wiki', ref: 'docs/sources/x.pdf#p2', retrieved: '2026-10-01' }],
});
