// Content model (CLAUDE.md §4). Pure types and constants: imported by the app and by Node build scripts.
// User-data types (settings, events, plans) arrive with the data layer in M2.

export type PhaseId = string; // "p01".."p16"
export type SkillId = string; // "p03-s02"
export type LessonId = string; // see LESSON_ID
export type Track = 'main' | 'alongside';
export type TrackLabel =
  | 'FOUNDATION'
  | 'CORE TECHNICAL'
  | 'DELIVERY'
  | 'ENGINEERING'
  | 'AI FOUNDATION'
  | 'APPLIED AI'
  | 'ADVANCED TECHNICAL'
  | 'ADVANCED AI'
  | 'LEADERSHIP DESTINATION';

/** p03-s02-l01 = lesson · p03-g03 = gate · p03-x01 = project part. */
export const LESSON_ID = /^p\d{2}-(s\d{2}-l\d{2}|g\d{2}|x\d{2})$/;

/** Title that stands in for a private lesson's real title anywhere public. */
export const PRIVATE_TITLE = 'Private lesson';

export interface Roadmap {
  id: 'alfah-lubisi-skills-mastery';
  sourceDoc: string;
  sourceDate: string;
  notes: string[];
  phases: Phase[]; // 16
  gates: Gate[]; // 10
  certifications: Certification[];
  portfolio: PortfolioItem[]; // 16 evidence items
}

export interface Phase {
  id: PhaseId;
  n: number;
  title: string;
  label: TrackLabel;
  track: Track;
  competence: string;
  skills: Skill[];
}

export interface Skill {
  id: SkillId;
  n: number;
  title: string;
}

export interface Gate {
  id: string; // "g01".."g10"
  n: number;
  title: string;
  exit: string;
  afterPhase: PhaseId;
}

export interface Certification {
  order: number;
  name: string;
  exam?: string;
  status: 'current' | 'retired' | 'tbd';
  note: string;
  afterPhase?: PhaseId;
}

/** An evidence-portfolio item; project lessons in `phase` build it. */
export interface PortfolioItem {
  id: string; // "e01".."e16"
  title: string;
  phase: PhaseId;
}

export type LessonKind = 'learn' | 'lab' | 'project' | 'gate';
export type Visibility = 'public' | 'private';

export interface Source {
  title: string;
  url?: string;
  ref?: string; // docs/sources/x.pdf#p3
  retrieved: string; // YYYY-MM-DD
}

export interface LessonMeta {
  id: LessonId;
  phase: PhaseId;
  skill?: SkillId;
  order: number; // sort key within its track; IDs never change, order may
  title: string; // PRIVATE_TITLE in the public index for private lessons
  kind: LessonKind;
  minutes: number; // 15..40
  visibility: Visibility;
  status: 'ready' | 'stub'; // stubs are never scheduled
  prereqs: LessonId[];
  evidence?: string; // PortfolioItem id
  sources: Source[];
  hash: string; // content hash, for change detection ('' for stubs and private placeholders)
}

export interface LessonCheck {
  q: string; // HTML
  a: string; // HTML
}

export interface LessonBody {
  id: LessonId;
  html: string;
  checks: LessonCheck[];
}

export interface ContentIndex {
  version: string;
  builtAt: string;
  roadmap: Roadmap;
  lessons: LessonMeta[]; // all lessons, including stubs and private placeholders
  chunks: Record<PhaseId, string>; // '/content/p03.<hash>.json' → LessonBody[] (public bodies only)
}

export interface PrivatePack {
  format: 'mq-private-pack/1';
  version: string;
  builtAt: string;
  lessons: (LessonBody & { title: string; sources: Source[] })[];
}
