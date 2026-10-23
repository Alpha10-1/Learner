import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Roadmap } from '../../src/core/types.ts';
import { validateRoadmap } from '../../scripts/lib/validate.ts';

const roadmap = JSON.parse(readFileSync(new URL('../../content/roadmap.json', import.meta.url), 'utf8')) as Roadmap;

describe('content/roadmap.json', () => {
  it('has 16 phases, 133 skills, 10 gates and 16 portfolio items', () => {
    expect(roadmap.phases).toHaveLength(16);
    expect(roadmap.phases.flatMap((p) => p.skills)).toHaveLength(133);
    expect(roadmap.gates).toHaveLength(10);
    expect(roadmap.portfolio).toHaveLength(16);
  });

  it('matches the per-phase skill counts of the source roadmap', () => {
    expect(roadmap.phases.map((p) => p.skills.length)).toEqual([8, 10, 8, 9, 9, 9, 8, 7, 8, 8, 6, 9, 8, 8, 9, 9]);
  });

  it('has sequential IDs and consistent references', () => {
    expect(validateRoadmap(roadmap)).toEqual([]);
  });

  it('puts only p12 on the alongside track', () => {
    expect(roadmap.phases.filter((p) => p.track === 'alongside').map((p) => p.id)).toEqual(['p12']);
  });

  it('places gates after the phases the roadmap names', () => {
    expect(roadmap.gates.map((g) => g.afterPhase)).toEqual(['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p10', 'p13', 'p16']);
  });

  it('targets AI-901, not the retired AI-900', () => {
    expect(roadmap.phases.find((p) => p.id === 'p12')?.skills.at(-1)?.title).toBe('Azure AI Fundamentals (AI-901) preparation');
    expect(roadmap.certifications.find((c) => c.order === 1)?.exam).toBe('AI-901');
  });
});
