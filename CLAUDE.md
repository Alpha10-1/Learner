# CLAUDE.md — Mastery Queue

> Read this whole file before starting any milestone. Work one milestone at a time (§13), stop at its Definition of Done, and report. Update the Status block when a milestone is done.

**Status:** Current milestone: **M0** · Completed: — · Content runway: 0 days

---

## 1. Product spec

Mastery Queue is a single-user, local-first Progressive Web App that turns Alfah Lubisi's *Skills Mastery Roadmap* (16 phases, 133 skills, 10 mastery gates) into an ordered queue of ~25-minute lessons, serves a fixed daily target (default 4 lessons ≈ 2 hours), tracks completion, streaks and phase progress on-device, and fires one reliable reminder per day (plus an optional "last call") that stays silent once the target is met. Lesson content is authored ahead of time by Claude Code from the Capstone/Tharisa source documents in `docs/sources/` plus verified public sources, compiled to static HTML at build time, and read offline. The home screen answers one question in under a second: *how many lessons are left today?*

**Non-goals (v1).** User accounts, OAuth or multi-user anything. Social features, leaderboards, badges beyond streak + freezes. Any LLM call at runtime (content is authored ahead, never generated in the app). A spaced-repetition/flashcard engine (one optional revisit is the only review mechanic). A notes app or rich-text editor (one plain-text note per completed lesson is the ceiling). Real-time multi-device sync (M9 is optional and gated on approval). Native wrappers (Electron, Tauri, Capacitor) or app-store builds. Runtime markdown parsing or syntax highlighting. Analytics, telemetry, crash reporting. i18n. More than two notifications per day.

## 2. Assumptions

These were not blocking, so they are decided here; §14 lists the ones worth confirming.

1. **One learner, two devices**: a Windows laptop (Chrome or Edge) and one phone. Phone OS unknown, so the design must work on both iOS (16.4+, ideally 18.4+) and Android.
2. **Time**: `Africa/Johannesburg` (UTC+2, no DST) — but code always uses the IANA zone from settings, never a hard-coded offset. The study day starts at **03:00** local so a session ending after midnight counts for the evening it started.
3. **Load**: ~2 h/day = **4 lessons × ~25 min** + buffer, 7 days/week, rest days configurable (default none). Evening study; reminders at **18:00** and **20:30**.
4. **Accounts**: the user will create a free Cloudflare account and has (or will create) Telegram. Hosting on `*.workers.dev` is acceptable.
5. **Repo**: private Git repository. The 17 PDFs from the Claude Project are copied into `docs/sources/` by the user before M1.
6. **Confidentiality**: anything derived from `docs/sources/` (internal Capstone wiki pages, the roadmap itself) is confidential by default. It never ships in the deployed bundle and never leaves the device in plain text (see §6.4, §8.6). Generic technical lessons (KQL, Power BI, Python…) are public.
7. **Roadmap corrections** found during planning (verified on Microsoft Learn, Oct 2026): AI-900 was retired on 30 Jun 2026 and replaced by **AI-901** (same "Azure AI Fundamentals" certification; ~55–60% hands-on Microsoft Foundry and it expects Python). DP-100 (retired 1 Jun 2026) and AI-102 (retired 30 Jun 2026) no longer exist, so the roadmap's "advanced Azure AI / data science credential" must be re-checked when Phase 14/15 content is authored. PL-300 is current (skills measured as of 20 Apr 2026).
8. **Exercises** use free public sandboxes (ADX `help` cluster, a personal free ADX cluster, Power BI Desktop) loaded with **synthetic** Capstone-like data. Real Capstone data is never pasted into the app or any external tool.

## 3. Tech stack

**Rule for versions:** pin exact versions in `package.json`. Use a version published ≥ 14 days ago; if a package's current major is < 60 days old, use the previous major. As of 2026-10-20 that gives the choices below. Do not bump majors without asking.

| Package | Version | Where | One-line rationale |
|---|---|---|---|
| Node.js | 24 LTS | tooling | Runs `scripts/*.ts` directly via built-in type stripping, so no `tsx`/`ts-node`. |
| `vite` | 8.x | dev | Fastest boring bundler; dev server + production build in one tool. |
| `typescript` | 6.0.x | dev | Types + `tsc --noEmit` checks; 7.x (Go port) is skipped until its JS API settles. |
| `preact` | 10.29.x | **runtime** | ~4 KB gz React-compatible components; 11.x is three weeks old. |
| `@preact/preset-vite` | 2.10.x | dev | Official JSX/HMR wiring for Preact in Vite. |
| `idb` | 8.x | **runtime** | ~1 KB promise wrapper over IndexedDB; removes callback/transaction foot-guns. |
| `vite-plugin-pwa` | 1.3.x | dev | Generates the manifest and injects the precache list into *our* hand-written SW (`injectManifest`); 2.0 is too new. |
| `workbox-precaching` | 7.4.x | SW only | Proven precache + cache-cleanup logic, loaded only inside `sw.ts`. |
| `marked` | latest 18.x ≥14d | dev (build) | Compiles lesson markdown to HTML at build time so no markdown parser ships to the client. |
| `yaml` | 2.x | dev (build) | Parses lesson front matter; zero dependencies. |
| `wrangler` | 4.x | dev | Deploys the Worker (static assets + API + cron) and runs it locally. |
| `@pushforge/builder` | 2.0.x | Worker | Zero-dependency VAPID + RFC 8291 (aes128gcm) encryption on WebCrypto, works in Workers. |
| `vitest` | 4.1.x | dev | Fast unit tests sharing Vite config; 5.x is under 60 days old. |
| `fake-indexeddb` | 6.x | dev | Real IndexedDB semantics in Node for data-layer tests. |

**Deliberately absent:** router (hash switch, 3 routes), state library (`useReducer` + context), date library (`Intl` + small helpers in `core/day.ts`), CSS framework (one CSS file with custom properties), UI kit, markdown at runtime, ESLint/Prettier (use `tsc` strict + editor formatting; ask before adding).

**Budgets (CI-enforced by `scripts/check-size.ts`, gzip):** app JS ≤ 50 KB (hard ceiling 200 KB), CSS ≤ 10 KB, `sw.js` ≤ 15 KB, each content chunk ≤ 80 KB. **Cold start:** first meaningful paint from IndexedDB in < 1 s on a throttled mid-range phone; zero network requests needed to render Today.

**Why this is the lightest stack that meets the requirements:** the notification requirement forces a service worker, an HTTPS origin and a tiny server with a scheduler; everything else is static. A single Cloudflare Worker provides all three (static assets, `/api/*`, cron) on one origin with no CORS, for free. On the client, Preact + `idb` is the smallest *boring* way to get components and safe IndexedDB access; everything heavier (markdown, YAML, encryption libraries) runs at build time or on the server.

### Architecture at a glance

```
 Phone / Laptop (installed PWA)                         Cloudflare Worker (one origin)
 ┌──────────────────────────────┐   PUT /api/day       ┌──────────────────────────────┐
 │ Preact UI (3 screens)        │ ───────────────────▶ │ fetch: /api/* (device secret)│
 │ core/ (pure: queue, streak)  │   POST /api/subscribe│ scheduled: cron */15         │
 │ IndexedDB (events, plans…)   │                      │ KV: devices, day status, sent│
 │ sw.ts: precache, push, ack   │ ◀── Web Push ─────── │ push via @pushforge/builder  │
 └──────────────────────────────┘     POST /api/ack ─▶ │ fallback: Telegram Bot API   │
          ▲ static assets (dist/, public lessons only) └──────────────────────────────┘
          └ private-pack.json imported manually (never deployed)
```

## 4. Data model

The design is **event-sourced**: the only durable truth is an append-only log of progress events plus one frozen plan per day. Streaks, freezes, percentages and projections are always *derived* by replay, which makes export/import a set union and keeps future sync (M9) cheap.

```ts
// ───────────── Content (static; built from /content; read-only at runtime) ─────────────
type PhaseId  = string;  // "p01".."p16"
type SkillId  = string;  // "p03-s02"
type LessonId = string;  // /^p\d{2}-(s\d{2}-l\d{2}|g\d{2}|x\d{2})$/
                         //  p03-s02-l01 = lesson · p03-g03 = gate · p03-x01 = project part
type Track = 'main' | 'alongside';
type TrackLabel = 'FOUNDATION' | 'CORE TECHNICAL' | 'DELIVERY' | 'ENGINEERING' | 'AI FOUNDATION'
                | 'APPLIED AI' | 'ADVANCED TECHNICAL' | 'ADVANCED AI' | 'LEADERSHIP DESTINATION';

interface Roadmap {
  id: 'alfah-lubisi-skills-mastery'; sourceDoc: string; sourceDate: string; // '2026-10-20'
  phases: Phase[];                // 16
  gates: Gate[];                  // 10
  certifications: Certification[];
  portfolio: string[];            // 16 evidence items
}
interface Phase {
  id: PhaseId; n: number; title: string; label: TrackLabel; track: Track;
  competence: string;             // "Practical definition of competence"
  skills: Skill[];
}
interface Skill { id: SkillId; n: number; title: string }
interface Gate  { id: string; n: number; title: string; exit: string; afterPhase: PhaseId }
interface Certification {
  order: number; name: string; exam?: string;
  status: 'current' | 'retired' | 'tbd'; note: string; afterPhase?: PhaseId;
}

type LessonKind = 'learn' | 'lab' | 'project' | 'gate';
interface Source { title: string; url?: string; ref?: string /* docs/sources/x.pdf#p3 */; retrieved: string /* YYYY-MM-DD */ }
interface LessonMeta {
  id: LessonId; phase: PhaseId; skill?: SkillId;
  order: number;                  // global sort key within its track; IDs never change, order may
  title: string;                  // private lessons: 'Private lesson' in the public index; real title in the pack
  kind: LessonKind; minutes: number;          // 15..40
  visibility: 'public' | 'private';
  status: 'ready' | 'stub';                    // stubs are never scheduled
  prereqs: LessonId[];                         // default: previous lesson in the same skill
  evidence?: string;                           // portfolio item this lesson contributes to
  sources: Source[];                           // ≥ 1 for ready lessons
  hash: string;                                // content hash, for change detection
}
interface LessonBody { id: LessonId; html: string; checks: { q: string; a: string }[] }
interface ContentIndex {
  version: string; builtAt: string; roadmap: Roadmap;
  lessons: LessonMeta[];                       // all lessons incl. stubs and private placeholders
  chunks: Record<PhaseId, string>;             // '/content/p03.<hash>.json' → LessonBody[] (public only)
}
interface PrivatePack {
  format: 'mq-private-pack/1'; version: string; builtAt: string;
  lessons: (LessonBody & { title: string; sources: Source[] })[];
}

// ───────────── User data (IndexedDB 'mq', version 1) ─────────────
type DayKey = string; // 'YYYY-MM-DD' in settings.timeZone, after shifting by dayStartHour
type HHMM = string;   // '18:00'

interface Settings {               // store 'kv', key 'settings'
  key: 'settings'; schema: 1;
  dailyTarget: number;             // 1..8, default 4; changes apply from the next plan
  timeZone: string;                // IANA, default Intl.DateTimeFormat().resolvedOptions().timeZone
  dayStartHour: number;            // 0..6, default 3
  restDays: number[];              // 0=Sun..6=Sat, default []
  pause?: { from: DayKey; to: DayKey };        // holiday mode: rest days + no reminders
  alongsideEvery: number;          // 1 alongside-track lesson per N plan slots, default 4
  reminders: { primary: HHMM; lastCall: HHMM | null };   // default '18:00', '20:30'
  notify: { push: boolean; telegram: boolean; privateTitles: boolean }; // true, true, false
  startDay: DayKey;                // streak accounting starts here
}

type Rating = 'easy' | 'ok' | 'hard';
type ProgressEvent =               // store 'events', keyPath 'id', indexes: 'day', 'lesson'
  | { id: string; t: number; day: DayKey; device: string; type: 'complete';
      lesson: LessonId; rating: Rating; note?: string; revisit?: boolean }
  | { id: string; t: number; day: DayKey; device: string; type: 'undo';
      lesson: LessonId; ref: string };        // ref = id of the 'complete' event; same day only

interface DayPlan {                // store 'plans', keyPath 'day'
  day: DayKey; target: number; lessons: LessonId[]; revisit?: LessonId;
  createdAt: number; device: string;
}
interface Meta {                   // store 'kv', key 'meta'
  key: 'meta'; deviceId: string; deviceSecret: string; enrolled: boolean;
  lastExportAt?: number; contentVersion?: string; privatePackVersion?: string; persisted?: boolean;
}
interface BootSnapshot {           // store 'kv', key 'snapshot' — rewritten after every change
  key: 'snapshot'; day: DayKey; target: number; done: number;
  next?: { id: LessonId; title: string; minutes: number }; streak: number; freezes: number; updatedAt: number;
}
// store 'kv', key 'privatePack' → PrivatePack (imported JSON)

// ───────────── Derived only (never stored) ─────────────
type DayOutcome = 'met' | 'partial' | 'missed' | 'frozen' | 'rest' | 'empty';
interface StreakState { streak: number; freezes: number; freezeProgress: number; outcomes: Map<DayKey, DayOutcome> }

// ───────────── Export file (download/upload JSON) ─────────────
interface ExportFile {
  format: 'mq-export/1'; exportedAt: string; app: string;
  settings: Settings; events: ProgressEvent[]; plans: DayPlan[];
}
```

Content chunks and the app shell live in Cache Storage (service worker), not IndexedDB. `localStorage` may hold only disposable UI hints (last tab). Everything that matters is in IndexedDB.

## 5. File / folder structure

```
mastery-queue/
├─ CLAUDE.md                     # this file
├─ README.md                     # 10 lines: what it is, link to CLAUDE.md, setup commands
├─ package.json  tsconfig.json  vite.config.ts  wrangler.jsonc  index.html
├─ public/                       # icons (192/512/maskable), robots.txt (Disallow: /), _headers (CSP, noindex)
├─ src/
│  ├─ main.tsx                   # boot: open DB → read snapshot → render → hydrate full state
│  ├─ app.tsx                    # hash router: #/today, #/lesson/:id, #/progress
│  ├─ screens/  Today.tsx  Lesson.tsx  Progress.tsx
│  ├─ components/  HeroNumber.tsx  LessonRow.tsx  Banner.tsx  PhaseBars.tsx  Heatmap.tsx  Settings.tsx
│  ├─ core/                      # PURE logic. No DOM, no IndexedDB, no Date.now(): `now` is a parameter
│  │  ├─ types.ts   day.ts  queue.ts  plan.ts  streak.ts  progress.ts
│  ├─ data/
│  │  ├─ db.ts                   # idb schema + migrations
│  │  ├─ repo.ts                 # events, plans, settings, meta, snapshot
│  │  ├─ content.ts              # load index + phase chunks; merge private pack
│  │  ├─ backup.ts               # export/import (validate, merge = union by event id)
│  │  └─ sanitize.ts             # allowlist sanitizer for imported pack HTML (DOMParser, no deps)
│  ├─ notify/
│  │  ├─ subscribe.ts            # permission (user gesture) + PushManager + POST /api/subscribe
│  │  ├─ status.ts               # PUT /api/day (debounced; flushed on visibilitychange)
│  │  └─ ics.ts                  # calendar fallback generator (RFC 5545, no deps)
│  ├─ sw.ts                      # precache, push, notificationclick, pushsubscriptionchange, ack
│  └─ styles.css
├─ shared/                       # imported by BOTH src/ and worker/; pure
│  ├─ reminder.ts                # decide(slot, status, prefs, now) → Message | null
│  ├─ messages.ts                # notification + Telegram text templates
│  ├─ day.ts                     # re-export of core/day.ts (single implementation)
│  └─ api.ts                     # request/response types for /api/*
├─ worker/
│  ├─ index.ts                   # export default { fetch, scheduled }
│  ├─ auth.ts  store.ts  push.ts  telegram.ts
├─ content/
│  ├─ roadmap.json               # canonical structure (from Appendix A in M1)
│  ├─ lessons/p01/…  lessons/p03/p03-s02-l01.md …       # public lessons
│  ├─ private/p01/…                                     # private lessons (never deployed)
│  └─ datasets/                  # synthetic CSVs for labs (generated, seeded)
├─ docs/sources/                 # the 17 project PDFs (input only; never deployed)
├─ scripts/
│  ├─ content-plugin.ts          # Vite plugin: builds + watches content during dev/build
│  ├─ build-content.ts           # md → .generated/content/*.json ; --private → dist-private/private-pack.json
│  ├─ content-check.ts           # schema, IDs, prereq DAG, sources, visibility, word counts
│  ├─ gen-datasets.ts            # seeded synthetic data generator
│  ├─ check-size.ts              # gzip budgets
│  └─ telegram-chatid.ts         # prints chat_id via getUpdates
├─ tests/  core/  shared/  data/  worker/  content/  fixtures/
├─ .generated/  dist/  dist-private/                    # gitignored
```

## 6. Roadmap import and content pipeline

### 6.1 How the roadmap maps to the model

The roadmap PDF is regular: each phase has a track label, a "Skills to learn" bullet list and a "Practical definition of competence". So the mapping is mechanical: **phase → `Phase`** (16), **bullet → `Skill`** (133), **mastery gate → `gate` lesson** placed at the end of the phase it certifies (10), **evidence-portfolio item → `project` lesson(s)** at the end of the most relevant phase (16), **certification → metadata** that lesson authors target. The 23-stage "mastery path" is a coarser view of the same content and is not modelled separately. Lessons are *not* in the PDF; they are authored per skill (§6.3).

**Import without manual data entry:** the parse has already been done during planning and is in **Appendix A**. In M1, convert Appendix A to `content/roadmap.json`, add a test that asserts 16 phases / 133 skills / 10 gates / 16 portfolio items, then **delete Appendix A from this file** and leave a one-line pointer (keeps this file lean for every future session). If the roadmap PDF is revised later, re-derive `roadmap.json` by reading the new PDF and diff it against the old one; never renumber existing IDs.

**Queue tracks:** main = p01→p11, then p13→p16. Alongside = p12 (AI foundations), which starts on day 1 and is interleaved (§7.2), matching the roadmap's "AI-900 and responsible AI — alongside" instruction. Because AI-901 is now Foundry-hands-on and expects Python, p12 is split: concept lessons (AI vs automation vs analytics, generative AI, prompting, hallucinations, bias, privacy, responsible AI, internal policy) run alongside from day 1; the AI-901 hands-on and exam-prep lessons carry prereqs on the first p08 Python lessons, so the scheduler naturally holds them back.

### 6.2 Build pipeline

`scripts/build-content.ts` reads `content/lessons/**.md` and `content/private/**.md`, validates front matter, compiles markdown with `marked` (raw HTML tokens are **escaped**, never passed through; external links get `rel="noopener" target="_blank"`), and writes: `.generated/content/index.<hash>.json` (roadmap + every `LessonMeta`, with private lessons reduced to `{id, phase, skill, order, kind, minutes, visibility, status, prereqs}` and title `'Private lesson'`); one chunk per phase with **public** bodies only; and, with `--private`, `dist-private/private-pack.json` holding private titles, bodies, checks and sources. Skills with no authored lessons get auto-generated **stub** entries so the queue shape is visible from day 1. The service worker precaches the index and all public chunks.

`npm run build` must fail if any private title, private body, or anything from `docs/sources/` appears in `dist/` (the content-check greps `dist/` for every private lesson's title and a sentinel comment `<!-- mq-private -->` that the build injects into each private body).

### 6.3 Lesson authoring protocol (Claude Code writes the lessons)

Claude Code authors lesson content from **two inputs**: the PDFs in `docs/sources/` (read them with the Read tool; rasterize pages only where text extraction loses meaning) and **public web sources it searches and verifies at authoring time**. Rules:

1. **Just-in-time waves.** Keep the **runway** (ready, uncompleted lessons ahead of the queue head ÷ daily target) at ≥ 14 days. Author one phase (or part of one) per wave. Beyond the runway, lessons stay stubs. When asked "author the next content wave", compute the runway, pick the next phases, author, run `npm run content:check`, report.
2. **Shape.** One lesson = 20–30 minutes. File = YAML front matter (`LessonMeta` fields minus `hash`) + these sections, in order: **Why this matters at Tharisa** (≤ 80 words, ties the skill to a real Capstone process, system or KPI), **Learn** (≤ 600 words, plain English, one worked example), **Do** (≤ 15 min, exact numbered steps in a named sandbox, with an expected result to self-check against), **Check** (3 questions with answers inside `<details>`-style check blocks parsed into `checks`), **Go deeper** (optional, ≤ 3 links).
3. **Depth by phase.** Phases 1–4: 2–4 lessons per skill. Phases 5–11: 2–3. Phases 12–16: 1–3 (introductory; depth comes from projects). Each phase ends with its project part(s) (`kind: project`, may span 2–4 sessions of ≤ 30 min) and its gate (`kind: gate`: a self-assessment against the gate's exit statement plus a short practical). Expect ~350 lessons in total.
4. **Source hierarchy.** (a) `docs/sources/*` for anything about Tharisa, Capstone, plants, dashboards, apps, data flow — **never invent Tharisa specifics**; if the docs are silent, write "Not documented in the Capstone wiki — confirm with the Capstone team" and give the question to ask. (b) Official vendor/standards docs: learn.microsoft.com (KQL, ADX, ADF, Fabric, Power BI, Azure, DevOps, Entra, Foundry, Copilot Studio, certification study guides), grafana.com/docs, docs.python.org, pandas/NumPy/scikit-learn docs, pytorch.org, git-scm.com, nist.gov (AI RMF / NIST AI 100-1), ServiceNow docs. (c) Reputable secondary sources only when (a)/(b) don't cover it. Every web source gets a `retrieved` date and its URL must load at authoring time.
5. **Writing rules.** Paraphrase; quotations ≤ 15 words and rare. No copied course text. Cert-prep lessons follow the **current** official "skills measured" outline, fetched at authoring time (exams change: AI-900 → AI-901 is the live example).
6. **Visibility.** Any lesson citing a `docs/sources/` ref is `private` and lives under `content/private/`. Generic lessons are `public`. Never put personal contact details from the sources (names, emails) into lessons; say "the Capstone primary contact listed on the wiki".
7. **Sandboxes.** KQL: the free public ADX `help` cluster (`Samples` database, e.g. `StormEvents`), then a personal free ADX cluster loaded with synthetic Capstone-like datasets from `content/datasets/` (downtime events following the time-model hierarchy, hourly shift production per plant, LIMS assay results, weighbridge tickets) generated by the seeded `scripts/gen-datasets.ts`. Power BI: Power BI Desktop with the same CSVs. Python: local install or a notebook. If the user has Capstone ADX access, a lesson may suggest an equivalent query against it, but never asks for real data to be pasted anywhere.
8. **Known source quirks.** `time_model_hierarchy.pdf`: the time-category acronyms (CT, NSOT, SOT, DT, etc.) are images and vanish in text extraction — rasterize pages 1–3 and read them before writing time-model lessons. `capstone_data_platform_mining.pdf`: the "Load and Haul Dashboard" paragraph repeats the Drilling text (a source error; don't propagate it; flag it in the lesson). Dashboard pages are mostly screenshots: rasterize the relevant page when a lesson explains a dashboard. The roadmap also cites documents not in `docs/sources/` (30-Day Study Plan, Capstone Knowledge Base, AI Learning Plan, AI Governance Policy TG-ISMS-POL-024); ask the user for them before authoring lessons that depend on them.

### 6.4 Private pack

`npm run pack:private` emits `dist-private/private-pack.json`. The user imports it once per device via Progress → Settings → "Import private lessons". It is validated (`format`, IDs exist in the index), its HTML passes `data/sanitize.ts` (allowlist: p, h2–h4, ul, ol, li, pre, code, table/thead/tbody/tr/th/td, a[href^=https:], strong, em, blockquote, details, summary, hr, br), and it is stored in IndexedDB. Until imported, private lessons appear in the queue as a lock card with an Import button; scheduling is identical with or without the pack because the index holds their metadata.

## 7. Scheduling and streak rules (plain English)

### 7.1 The day
A day runs from `dayStartHour` (03:00) to 02:59 the next morning, in the settings time zone. Every event is stamped with its `DayKey` at creation. A completion at 01:30 belongs to the previous evening.

### 7.2 Building today's plan
1. The first time the app opens on a new day (or the day rolls over while it's open), it builds and **freezes** a plan. A plan is never rebuilt that day, except that it may be extended when content is imported.
2. **Target** = `settings.dailyTarget` as of plan creation. Changing the target in settings affects the next plan, not today's.
3. **Revisit slot.** If a lesson rated *hard* was completed 3 or more days ago and hasn't been revisited, at most one such lesson takes the first slot (review mode: re-read, redo Check). It counts toward the target.
4. **Eligible** lessons are: not completed, `status: ready`, every prereq completed, and (for gates) every lesson of the gate's phase completed. Main-track phases are strictly sequential; within a track, order by `order`.
5. **Interleave.** Of the remaining slots, `max(1, floor(target / alongsideEvery))` go to the alongside track while it has eligible lessons (default: 1 of 4); the rest go to the main track. If either track runs dry, the other fills its slots.
6. If fewer eligible lessons exist than slots, the target for that day **shrinks to what exists** and a "content runway empty" banner appears. If zero exist, the day is `empty`: treated like a rest day (no streak penalty — missing content is not the learner's fault).
7. **Pulling ahead.** After the target is met, a "One more" button appends the next eligible lesson. Extra completions advance the queue and the finish projection but **never bank** toward tomorrow's target.
8. Missed lessons are not carried as debt. Tomorrow's plan simply starts from the head of the queue, which still contains them. No catch-up multiplier, ever.

### 7.3 Completing, undoing
"Done" records a `complete` event with a rating (easy/ok/hard) and an optional one-line note. A completion counts toward the day it happened in, whether or not the lesson was in that day's plan. "Undo" is allowed only on the same `DayKey` and writes an `undo` event referencing the completion.

### 7.4 Day outcomes, streaks and freezes (computed by replaying days from `startDay` to yesterday; today is shown as "in progress")
- **rest**: a configured rest day, a paused day, or an `empty` day. Ignored by streak math, *unless* the target was met on it, in which case it counts as **met**.
- **met**: completions ≥ that day's plan target. Streak +1 and freeze progress +1.
- **partial**: 1 ≤ completions < target. Streak unchanged (kept alive, not extended). Freeze progress unchanged.
- **missed**: zero completions on a non-rest day (including days the app was never opened). If a freeze is banked, consume it → day becomes **frozen**, streak unchanged. Otherwise streak resets to 0 and freeze progress resets to 0.
- **Freezes:** start with 1. Every 7 **met** days of freeze progress earns 1 more; at most 2 banked.
- **Streak** shown on Today = count of met days in the current unbroken run (partial and frozen days don't break it; they don't extend it either).

### 7.5 Progress figures
Overall % = completed ready lessons ÷ total lessons including stubs. Per-phase % the same, per phase. Gates passed = completed gate lessons (of 10). **Projected finish** = remaining lessons ÷ average completions per study day over the last 14 days (if fewer than 7 days of history, use target × non-rest days per week ÷ 7), shown as a date "at your current pace". **Runway** = ready uncompleted lessons ÷ target, in days.

### 7.6 Required test cases (table-driven, `tests/core/streak.test.ts` and `plan.test.ts`)
met,met,missed with 1 freeze → frozen, streak 2, freezes 0 · missed with 0 freezes → streak 0 · partial → streak unchanged · rest day ignored · rest day with target met → +1 · 7 met → +1 freeze, capped at 2 · app unopened 5 days → freezes consumed first then reset · completion at 01:30 counts for the previous DayKey · target change applies tomorrow · undo on a later day rejected · empty-content day = no penalty · interleave gives 3 main + 1 alongside at target 4 · hard rating schedules a revisit on day +3, max one per day · gate not eligible until its phase is complete · AI-901 hands-on lesson held back until its p08 prereqs are done.

## 8. Notification strategy

### 8.1 Options evaluated (facts verified Oct 2026)

| Option | Fires at a chosen time? | Can stay quiet once target met? | iOS | Android | Desktop | Verdict |
|---|---|---|---|---|---|---|
| **Web Push + SW + tiny scheduled backend** | Yes (server cron) | Yes (server knows today's status) | Yes, 16.4+, only as a Home Screen app; 18.4+ adds Declarative Web Push | Yes | Yes, while the browser process runs | **Primary** |
| Periodic Background Sync | No: browser-controlled interval tied to engagement, installed PWAs only | n/a | No (Chromium only) | Partly | Partly | Rejected |
| Notification Triggers (`showTrigger`) | Would have | Yes | No | No | No | Rejected: Chrome ended development; never shipped |
| Telegram bot via cron | Yes | Yes | Yes | Yes | Yes | **Automatic fallback** (leaves the app; messages aren't end-to-end encrypted) |
| Email via cron | Yes, but slow to notice | Yes | Yes | Yes | Yes | Rejected as default (noisy, needs a provider/domain); swap in if no Telegram |
| OS-level scheduled notification | Yes | No without app logic | Needs a native wrapper (Capacitor + store/sideload) | Same | Task Scheduler covers desktop only | Rejected: violates "no native wrapper, light" |
| Calendar `.ics` recurring event with alarm | Yes, extremely reliable | No | Yes | Yes | Yes | **Last-resort manual fallback** (zero infrastructure) |

### 8.2 Decision
**Primary: standards Web Push, sent by a Cloudflare Worker cron that checks today's status first.** It is the only option that is in-app, time-precise, cross-platform and *state-aware* (silent when you're done) with no native code. Trade-offs accepted: a tiny server exists (free tier, ~150 lines); on iOS the app must be installed to the Home Screen and opened from there; on desktop the browser must be running; push delivery is best-effort, which is why delivery is **acknowledged** and a fallback fires automatically.

**Fallback ladder:** (1) Web Push to every subscribed device → (2) if no device acknowledges within one cron tick (~15 min), or every push send fails, the Worker sends the same message via **Telegram** → (3) a one-time **`.ics` download** (daily event at the primary time with an alarm) covers Worker/Cloudflare outages. The Settings panel shows the last reminder's delivery path ("18:00 · push · acknowledged 18:01").

### 8.3 Implementation notes (exact)
- **Worker shape:** one Worker, `export default { fetch, scheduled }`. `wrangler.jsonc`: `assets: { directory: "./dist", not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, one KV binding `MQ`, `triggers.crons: ["*/15 * * * *"]` (uses 1 of the 5 free cron triggers). Secrets: `VAPID_PRIVATE_KEY` (JWK from `npx @pushforge/builder generate-vapid-keys`), `ENROLL_CODE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Vars: `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (`mailto:`), `APP_URL`. The public key is also exposed to the client at build time as `VITE_VAPID_PUBLIC_KEY`.
- **Free-plan limits to respect:** 10 ms CPU per invocation, 100k requests/day, KV 1,000 writes/day, KV reads can be up to ~60 s stale. Budget: ~96 cron runs/day with a handful of KV reads each; writes only on status changes, sends and acks (< 50/day). If a cron run exceeds 10 ms CPU when encrypting pushes, log it and tell the user; the fix is Workers Paid ($5/month), not code gymnastics.
- **Device auth (not user auth):** on first run the client creates `deviceId` (UUID) and a 32-byte random `deviceSecret`. `POST /api/subscribe` with `Authorization: Bearer <secret>`; for an unknown device it also requires `X-Enroll-Code` (the user types `ENROLL_CODE` once in Settings). The Worker stores `SHA-256(secret)` and verifies it on every later call. This stops strangers on the public URL from enrolling, without accounts.
- **Endpoints** (types in `shared/api.ts`): `POST /api/subscribe {deviceId, subscription, prefs}` · `DELETE /api/subscribe` · `PUT /api/day {day, target, completed: LessonId[], next?, streak, freezes}` → `{ok, resubscribe?: boolean}` · `POST /api/ack {day, slot}` · `POST /api/test` (sends a test push now) · `GET /api/status` (last sends/acks for Settings). `prefs` = `{timeZone, dayStartHour, restDays, pause, reminders, notify}`; the most recently updated device's prefs win.
- **KV keys:** `devices` → `string[]`; `dev:<id>` → `{secretHash, subscription|null, prefs, lastNext?, updatedAt}`; `day:<DayKey>:<id>` → that device's status (TTL 7 days); `sent:<DayKey>:<slot>` → `{at, push: results[], acked?: {at, device}, telegramAt?, skipped?}` (TTL 7 days). Per-device keys avoid clobbering; `done` for the day = size of the **union** of `completed` across devices.
- **Status pings:** the client sends `PUT /api/day` on plan creation and after every complete/undo (debounced 2 s; flushed with `fetch(..., {keepalive: true})` on `visibilitychange`). `next` contains the title only if the lesson is public or `notify.privateTitles` is on; otherwise `"Phase 1 · lesson 3"`.
- **Cron tick (every 15 min):** for each slot (`primary`, `lastCall`): compute local time and `DayKey` from prefs; if the day is a rest/paused day, skip. If local time ∈ [slot, slot + 90 min) and `sent:<day>:<slot>` doesn't exist, call `shared/reminder.decide()`; if it returns a message, push to every device subscription (`TTL` = seconds until slot + 3 h, `Urgency: high`, `Topic: daily` so an undelivered primary is replaced by the last call at the push service), and record results; if it returns null, record `skipped: 'target-met'`. Then **fallback**: for any slot sent ≥ 15 min ago with no ack and no `telegramAt`, send via Telegram and record. Any push response 404/410 deletes that subscription and makes the next `/api/day` response return `resubscribe: true`.
- **Payload = Declarative Web Push JSON**, so WebKit displays it even if the service worker never runs (no silent-push penalty, survives SW eviction), and other browsers display it via our SW: `{"web_push": 8030, "notification": {"title", "body", "navigate": APP_URL + "#/today", "tag": "daily-<DayKey>", "lang": "en-ZA", "silent": false, "app_badge": "<remaining>"}, "mq": {"day", "slot"}}`.
- **Service worker `push` handler:** parse the JSON; **always** call `showNotification` (Chrome shows a generic "updated in the background" notice otherwise, and WebKit revokes subscriptions after unshown pushes — suppression happens only on the server). Before showing, read the boot snapshot from IndexedDB: if it says today's target is already met (status ping didn't reach the server in time), show a quiet `"✓ Target hit today"` with `silent: true` instead. In the same `waitUntil`, `POST /api/ack` (secret read from IndexedDB) and `setAppBadge(remaining)`.
- **`notificationclick`:** focus an existing client and navigate it to `#/today`, else `clients.openWindow`. **`pushsubscriptionchange`:** re-subscribe and re-POST. Because Safari doesn't reliably fire that event, the app also checks `pushManager.getSubscription()` on every open and re-posts if missing or changed.
- **Permission UX:** never on load. A "Turn on daily reminders" button in Settings (and a one-time Today banner) triggers `Notification.requestPermission()` from the click. On iOS, if `PushManager` is missing in a browser tab, show "Add to Home Screen, then open from the icon" instructions instead of the button.
- **Telegram:** `POST https://api.telegram.org/bot<TOKEN>/sendMessage {chat_id, text, disable_web_page_preview: true}`. Setup: create a bot with @BotFather, send it `/start`, run `npm run telegram:chatid`, then `wrangler secret put` both values. Text never includes private titles (Telegram cloud chats aren't end-to-end encrypted) and ends with "Open Mastery Queue from your home screen" plus the URL, because on iOS a link tapped in Telegram opens Safari, whose storage is separate from the Home Screen app.
- **`.ics` fallback:** generated in the browser: one `VEVENT` with `RRULE:FREQ=DAILY` (or `BYDAY` excluding rest days), `DTSTART;TZID=<tz>` at the primary time, `DURATION:PT2H`, `VALARM` with `TRIGGER:PT0M`, summary "Study block — Mastery Queue", URL. It can't know whether the target was met, so it's offered as a backup, not enabled by default.
- **Local testing:** `wrangler dev --test-scheduled` then trigger the scheduled handler via the test route Wrangler prints (check `wrangler dev --help` for the current path). `POST /api/test` sends a real push to enrolled devices.

### 8.4 Payload and timing

| Situation at slot time | Primary 18:00 | Last call 20:30 |
|---|---|---|
| Target met (or rest/paused/empty day) | nothing | nothing |
| 0 done | **"4 lessons today"** · "Start with: KQL — summarize and count (25 min). 🔥 12-day streak" | **"Keep your 12-day streak"** · "One lesson (~25 min) keeps it alive. 1 freeze banked." (streak 0: "Today's still open — one lesson restarts your streak.") |
| Partial | **"2 to go today"** · "2/4 done. Next: Joins and time-window matching" | **"2 left to hit today's target"** · "You're at 2/4. Next: …" |
| No status from any device today | **"Today's lessons are ready"** · "Next: <last known next>" | same as 0 done |
| Content runway empty | **"No lessons ready"** · "Ask Claude Code to author the next content wave." | nothing |

Titles ≤ 40 characters, bodies ≤ 110 (lock-screen truncation). At most two notifications per day; the tag makes the last call replace the primary on screen. The app badge shows remaining lessons and clears at zero.

### 8.5 Platform setup checklist (shown in Settings)
**iPhone:** iOS 16.4+ (18.4+ recommended) → open the URL in Safari → Share → Add to Home Screen → open from the icon → Settings → Turn on daily reminders → Allow. Always use the icon, not a Safari tab (separate storage; push and persistent storage only work in the installed app). Focus modes can silence it.
**Android:** Chrome → Install app → open → Turn on reminders. If reminders arrive late, exempt Chrome from battery optimisation.
**Windows laptop:** Chrome or Edge → Install app → Turn on reminders → enable the browser's "continue running background apps when closed" setting. If the laptop is asleep at 18:00 the push waits in the queue and the Telegram fallback reaches the phone after ~15 min.

### 8.6 Privacy
Push payloads are end-to-end encrypted to the browser (RFC 8291). The Worker stores only device IDs, push subscriptions, preferences, today's completed lesson IDs, counts, and the next lesson's *public* title. Private lesson titles leave the device only if `notify.privateTitles` is explicitly enabled, and never go to Telegram.

## 9. UI principles and screens

**Principles.** The daily number is the hero: on Today it is the largest element on screen (≥ 96 px, `font-variant-numeric: tabular-nums`), shows *lessons remaining*, and becomes a ✓ when the target is met. One primary action per screen. Sparse: system font stack, one accent colour, generous whitespace, light/dark via `prefers-color-scheme`, max content width 640 px on desktop. No spinners on cold start: render from the boot snapshot, then hydrate. No modals except destructive confirms (reset, import-replace). Touch targets ≥ 44 px, visible focus states, WCAG AA contrast, `prefers-reduced-motion` respected. At most one banner at a time, priority: resubscribe > reminders off > runway < 7 days > export older than 14 days. Copy is short, warm and never guilt-tripping.

**Screens (three; do not add more):**
1. **Today** (`#/today`, default). Hero number and "of 4 · ~75 min left". Streak chip ("🔥 12 · ❄ 1"). Today's plan as a list (title, minutes, done state; the revisit is marked). Primary button "Start next lesson". When met: ✓, "Target hit", and a quiet "One more" button. Bottom nav: Today · Progress.
2. **Lesson** (`#/lesson/:id`). Title, minutes, phase/skill breadcrumb, rendered HTML, Check items with tap-to-reveal answers, sources list with retrieval dates. Footer: rating (easy · ok · hard), optional one-line note, "Done" → returns to Today (or "Next lesson" if more remain). Same-day "Undo". Private lesson without pack → lock card + Import button.
3. **Progress** (`#/progress`). Overall % and projected finish date, gates 0/10, runway in days, 16 phase bars (tap to expand skills with lesson ticks), 8-week heatmap (CSS grid). Below a divider: **Settings** (target, reminder times, rest days, pause, reminders on/off + enroll code + test button + delivery status, Telegram status, `.ics` download, export JSON, import JSON, import private lessons, reset, version).

## 10. Commands

```bash
# one-time
npm install
npx @pushforge/builder generate-vapid-keys        # save public key in .env + wrangler.jsonc vars; private JWK as a secret
npx wrangler login
npx wrangler kv namespace create MQ               # paste id into wrangler.jsonc
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put ENROLL_CODE
npx wrangler secret put TELEGRAM_BOT_TOKEN
npm run telegram:chatid && npx wrangler secret put TELEGRAM_CHAT_ID

# daily work
npm run dev            # vite dev server; content plugin builds + watches /content (http://localhost:5173)
npm run dev:worker     # build, then `wrangler dev --test-scheduled` (app + /api + cron locally)
npm test               # vitest run (core, shared, data, worker, content)
npm run test:watch
npm run content:check  # validate lessons, IDs, prereq DAG, sources, visibility, budgets
npm run pack:private   # → dist-private/private-pack.json (import on each device)
npm run build          # content build → tsc --noEmit → vite build → private-leak check → size check
npm run deploy         # build && wrangler deploy
```

All scripts must work on Windows PowerShell as well as macOS/Linux: Node scripts only, no bash-isms, no `&` chaining for parallel processes.

## 11. Coding conventions

TypeScript `strict`, no `any`, no non-null assertions in `core/` and `shared/`. Everything in `core/` and `shared/` is pure and deterministic: time comes in as a `now: number` parameter, time-zone maths uses `Intl.DateTimeFormat` with an explicit `timeZone`, and storage uses `DayKey` strings, never `Date` objects. Events are append-only; the only deletions are "Reset all data" and same-day undo via an `undo` event. IndexedDB schema changes bump the DB version with a tested migration; export format changes bump `format`. Files stay under ~200 lines; named exports; components are small functions with props typed inline. One CSS file using custom properties; no inline style objects except dynamic values. Scripts use only erasable TypeScript syntax (no `enum`, `namespace`, parameter properties) so Node 24 can run them directly. Every bug fix in `core/` or `shared/` ships with a failing-then-passing test. Conventional commits (`feat:`, `fix:`, `content:`, `chore:`); one milestone per branch.

### Do not
- Add, remove or swap **any** dependency (runtime or dev) without asking first.
- Use React, Next, Electron, Tauri, Capacitor, Tailwind, a UI kit, a router, a state library, a date library, a runtime markdown parser, or analytics.
- Store app data in `localStorage`, or anything critical outside IndexedDB.
- Add accounts, OAuth, or login screens. The enroll code + device secret is the entire auth model.
- Suppress a notification in the service worker, request notification permission without a user gesture, or send more than two reminders a day.
- Send private lesson titles or content to the Worker or Telegram (except the opt-in setting for the Worker).
- Ship `content/private/`, `docs/sources/` or `dist-private/` in `dist/`, or commit secrets, `.env`, or VAPID private keys.
- Renumber or reuse lesson IDs once created (progress is keyed by ID); change `order` instead.
- Invent facts about Tharisa or Capstone, or copy source text verbatim beyond short quotes.
- Author lessons far beyond the runway window unless asked.
- Add a fourth screen, modals for non-destructive actions, or features listed as non-goals.
- Mark a milestone done without meeting every item in its Definition of Done.

## 12. Security headers

`public/_headers` (served by Workers static assets): `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Lesson images, if ever needed, are inlined at build time; no remote images.

## 13. Build order

Each milestone ends in a runnable state. Stop and report at each Definition of Done (DoD).

**M0 — Scaffold and offline shell.** Vite + Preact + TS, three placeholder routes, `styles.css`, `vite-plugin-pwa` (injectManifest) with `sw.ts` precaching the shell, manifest + icons, `check-size.ts`, Vitest with one smoke test, `_headers`, `robots.txt`.
*DoD:* `npm run build` and `npm test` pass; app JS ≤ 20 KB gz; Chrome DevTools shows the app as installable; after one online visit the app loads with the network disabled.

**M1 — Roadmap and content pipeline.** `content/roadmap.json` from Appendix A (then delete Appendix A here), `build-content.ts`, `content-plugin.ts`, `content-check.ts`, stub generation, public/private split with the leak check, `pack:private`, one sample public lesson and one sample private lesson.
*DoD:* tests assert 16 phases / 133 skills / 10 gates / 16 portfolio items; `content:check` passes; `dist/` contains no private title or sentinel; the private pack builds; Today lists the queue head from real data.

**M2 — Core logic and data layer.** `core/day.ts`, `queue.ts`, `plan.ts`, `streak.ts`, `progress.ts`; `data/db.ts`, `repo.ts`, `content.ts`; boot snapshot.
*DoD:* every case in §7.6 is a passing test; `core/` line coverage ≥ 90%; completing and undoing in a dev harness persists across reloads; the hero number is correct for seeded histories.

**M3 — Screens.** Today, Lesson, Progress (without Settings internals), bottom nav, banners, heatmap, phase bars.
*DoD:* the full daily loop (open → plan → read → Done → hero decrements → ✓) works offline on desktop and on a phone over the LAN; Lighthouse mobile Performance ≥ 95; app JS ≤ 50 KB gz; keyboard-only navigation works.

**M4 — Backup, private pack, persistence.** Export/import with validation and union-merge, private pack import + sanitizer + lock cards, `navigator.storage.persist()` on first meaningful use, export-reminder banner, Settings section (non-notification parts).
*DoD:* round-trip test (export → wipe → import) reproduces identical derived state; importing into a second browser gives the same streak and progress; a malicious pack fixture (script tags, `javascript:` links, `on*` attributes) renders inert.

**M5 — Deploy + content wave 1 (start studying).** `wrangler.jsonc` serving `dist/` as static assets (no API yet), first deploy. Author wave 1: all of p01 and p02 (mostly private, with gates g01/g02 and their project parts) and the p12 concept lessons, ≥ 14 days of runway. Add `gen-datasets.ts` and the first synthetic datasets for p03.
*DoD:* app installed on laptop and phone from the deployed URL; private pack imported on both; `content:check` passes; every ready lesson has dated sources; the user reviews 5 random lessons and approves; Status block shows runway ≥ 14 days.

**M6 — Web Push (primary).** Worker `fetch` + `scheduled`, KV, auth, `/api/*`, `shared/reminder.ts` + `messages.ts`, push via `@pushforge/builder`, SW push/click/ack/subscription-change, status pings, Settings reminders panel with test button and delivery status, platform checklist.
*DoD:* `decide()` is fully table-tested (every row of §8.4); test push arrives on laptop and phone; scheduled reminders fire within 15 min of the set time on 3 consecutive days; no reminder on a day the target was met before 18:00 (verified); a 410 response removes the subscription and shows the resubscribe banner.

**M7 — Fallbacks.** Telegram fallback on missing ack or failed sends, `.ics` generator, delivery-path display.
*DoD:* with the phone's subscription deliberately invalidated, Telegram delivers within one cron tick; with acks blocked, Telegram fires once and only once per slot; the `.ics` file imports into Outlook and Google Calendar with a daily alarm.

**M8 — Polish and hardening.** SW update flow ("New version — Reload" banner, `SKIP_WAITING`), error boundary with "Export my data" escape hatch, empty states, accessibility pass, badge counts, storage-estimate warning.
*DoD:* an update deploy is picked up without data loss; no serious issues in an axe scan; all budgets still met.

**M9 — Optional, ask first: cross-device sync relay.** Devices push/pull `ProgressEvent`s through the Worker (union by id; settings last-writer-wins), behind the existing device auth.
*DoD:* complete a lesson on the laptop and see it on the phone within one app open; offline edits on both devices merge without loss.

**Ongoing — content waves.** Repeat §6.3 whenever the runway banner appears or the user asks. Each wave: compute runway → author → `content:check` → `pack:private` → deploy → user re-imports the pack → update Status.

## 14. Open questions (defaults in brackets; nothing is blocked)

1. Is your phone an iPhone or Android, and which OS version? [design supports both; iOS needs 16.4+ and a Home Screen install]
2. Is the laptop your Tharisa work machine? Corporate policy may block installing web apps or notifications, and the AI Governance Policy (TG-ISMS-POL-024) may restrict where company-derived text is stored. [private lessons stay on your devices only; nothing internal goes to Cloudflare or Telegram]
3. Is Telegram acceptable as the automatic fallback? [yes; alternative is email, which needs a sending provider]
4. Are 18:00 and 20:30 the right reminder times, and do you want rest days (e.g. Sunday)? [18:00 / 20:30, no rest days]
5. Will you genuinely study on both devices? If yes, approve M9 sync. [no sync in v1; export/import between devices]
6. Can you add the missing source documents to `docs/sources/`: Tharisa_Capstone_30-Day_Study_Plan, Capstone_Complete_Knowledge_Base, AI Learning Plan, AI Governance Policy? [lessons that need them are authored last and marked "confirm with source"]
7. AI-901 placement: concepts alongside from day 1, Foundry hands-on after the first Python lessons. Or would you rather move Python earlier? [as described]
8. Do you have read access to Capstone ADX for practice queries? [labs use the public `help` cluster + synthetic data only]
9. Four ~25-minute lessons, or two ~50-minute deep sessions? [four × 25]

---

## Appendix A — Roadmap seed (parsed from `Alfah_Lubisi_Skills_Mastery_Roadmap.pdf`, dated 2026-10-20)

> **M1: convert this appendix to `content/roadmap.json`, add the count test, then delete this appendix and replace it with: "Roadmap structure lives in content/roadmap.json."**

Skill IDs are `pNN-sMM` in the listed order. Track: main unless marked alongside.

**p01 · Tharisa Operations and Business Context** · FOUNDATION
Competence: Explain what a KPI means physically, what decision it supports, and what operational factors could make it misleading.
Skills: Mining and material movement · Processing and plant flow · Genesis, Voyager and Vulcan context · Engineering and maintenance · Logistics · Shift structures and production measures · Equipment and asset context · Downtime, throughput, recovery and grade

**p02 · Capstone Fundamentals and Architecture** · FOUNDATION
Competence: Draw and narrate the flow from operational source to business decision, including where data is ingested, stored, queried, visualised and documented.
Skills: Capstone purpose and portal · Operational source systems · Data Loader · Azure Data Factory · Azure Data Explorer · KQL and reusable query functions · Asset Centre · Grafana · Capstone Wiki and documentation · SQL databases, APIs, IP.21/historian, LIMS, weighbridge, IoT, PLC/SCADA and D365 integrations

**p03 · Azure Data Explorer, KQL and SQL** · CORE TECHNICAL
Competence: Independently answer a defined operational question with a readable KQL query and explain the logic and limitations.
Skills: ADX clusters, databases, tables, schemas and functions · Basic KQL: take, project, where, sort and date filters · Aggregations: summarize, count, sum, average, minimum and maximum · Time-series analysis · Joins and time-window matching · Duplicate handling and dataset profiling · Reusable query logic · SQL foundations after KQL

**p04 · Data Quality, Validation and Governance** · CORE TECHNICAL
Competence: Produce a validation note that demonstrates whether the result can be trusted and records known gaps.
Skills: Data lineage and source-to-target mapping · Reconciliation to source · Missing values and duplicates · Timestamps and time zones · Units and refresh frequency · Metric definitions · Data ownership · Permissions, restricted data and role-based access · Auditability and documented exceptions

**p05 · Business Analysis and Business Cases** · DELIVERY
Competence: Convert a vague request into a testable problem statement, evidence plan and decision-ready business case.
Skills: Stakeholder interviews · Requirements gathering · Problem and outcome definition · Current-state process mapping · Available versus missing data · Feasibility, benefits, costs and risks · Value propositions and success measures · Living business cases · Decision history and reusable findings

**p06 · Power BI, Grafana and Visual Analytics** · DELIVERY
Competence: Build a report that is traceable to validated data, communicates the required decision and includes appropriate access controls.
Skills: Power Query · Data modelling and relationships · Measures · Report and dashboard design · Filters and drilldown · KPI design · Workspaces and controlled access · Row-level security · Grafana panels, variables, trends and operational monitoring

**p07 · SharePoint and Knowledge Management** · DELIVERY
Competence: Publish a maintained, searchable knowledge page that allows another analyst to reuse the work without repeating discovery.
Skills: Sites and document libraries · Information architecture and metadata · Permissions and versioning · Search and discoverability · Knowledge pages · Authoritative document practices · Structuring content for AI retrieval · Preserving project context, assumptions and decision history

**p08 · Python, APIs and Application Foundations** · ENGINEERING
Competence: Create a small, documented analysis or service that consumes data, performs a useful transformation and produces a repeatable result.
Skills: Python syntax and problem solving · Pandas and NumPy · Visualisation · Working with files and structured data · JSON and APIs · Scikit-learn foundations · Application architecture basics

**p09 · Git, Azure DevOps and Collaboration** · ENGINEERING
Competence: Move a locally developed solution into a shared repository and complete a controlled change through review and merge.
Skills: Repositories · Branches, commits, push and pull · Pull requests and code review · Merging and conflict awareness · Azure DevOps Repos · Boards and work tracking · Pipelines and controlled releases · Change management and shared development practices

**p10 · Azure Hosting, Identity and Deployment** · ENGINEERING
Competence: Deploy a simple authenticated application in an approved environment and explain its key components and access model.
Skills: Azure resource fundamentals · Web hosting/App Service concepts · Linux-hosted applications · Databases and supporting services · Microsoft identity and authentication · Credentials and secret handling · Development, test and production environments · Monitoring, networking and security basics

**p11 · Testing, UAT and Service Delivery** · DELIVERY
Competence: Create a test pack that another person can execute and link defects or incidents to an auditable resolution.
Skills: Acceptance criteria · Test cases and expected results · User acceptance testing · Defect logging, severity and priority · Retesting and release validation · ServiceNow incidents, requests, ownership, escalation, SLA awareness and closure

**p12 · AI Foundations and Responsible Use** · AI FOUNDATION · **alongside**
Competence: Use AI safely for a real task, validate the result, document the risk and explain why the use is appropriate.
Skills: AI versus automation versus analytics · Generative AI · Prompting · Hallucinations and limitations · Bias and validation · Privacy and confidentiality · Responsible AI · Internal AI governance policy · AI-900 preparation *(retitle "Azure AI Fundamentals (AI-901) preparation"; AI-900 retired 2026-06-30)*

**p13 · AI Integration and Automation** · APPLIED AI
Competence: Deliver a bounded AI-enabled workflow that includes human review, defined success measures and clear data boundaries.
Skills: Advanced prompting · Copilot-assisted analysis · Human-in-the-loop design · Process automation · AI use-case discovery · Data readiness · AI Builder and Copilot Studio · Risk controls and measurable benefit

**p14 · Data Science and Machine Learning** · ADVANCED TECHNICAL
Competence: Build and evaluate a model against a defined business baseline without overstating its accuracy or value.
Skills: Descriptive statistics and probability · Distributions, correlation and regression · Feature engineering · Supervised and unsupervised learning · Classification, regression and clustering · Train/test validation · Model evaluation and overfitting · Explainability

**p15 · Advanced AI Engineering** · ADVANCED AI
Competence: Operate an AI application as a governed product, including evaluation, monitoring, change control and production support.
Skills: Deep learning and neural networks · PyTorch or TensorFlow · Natural language processing · Large language models · Embeddings and vector retrieval · Retrieval-augmented generation · Agents · Azure AI services · MLOps, monitoring and scaling

**p16 · AI Governance, Strategy and Architecture** · LEADERSHIP DESTINATION
Competence: Select, govern and prioritise AI initiatives at portfolio level and connect architecture decisions to risk and measurable business outcomes.
Skills: NIST AI Risk Management Framework · Risk assessment and governance controls · Ethics and compliance · Vendor evaluation · AI maturity assessment · Change management and workforce adoption · Portfolio prioritisation · Enterprise AI architecture · Strategy and value measurement

Skill counts: 8, 10, 8, 9, 9, 9, 8, 7, 8, 8, 6, 9, 8, 8, 9, 9 = **133**.

**Gates** (id · title · exit statement · after phase):
g01 Context · I can explain the operational process and the decision behind the metric · p01
g02 Platform · I can draw the Capstone flow from source to user and locate the main services · p02
g03 Query · I can write and explain KQL that answers a defined question · p03
g04 Trust · I can validate lineage, timing, duplicates, units and reconciliation · p04
g05 Insight · I can distinguish evidence from assumptions and explain operational limitations · p05
g06 Communication · I can produce a clear Power BI/Grafana output that supports a decision · p06
g07 Knowledge · I can document the work so another analyst can reuse it · p07
g08 Engineering · I can collaborate through Git/Azure DevOps and support controlled deployment · p10
g09 AI delivery · I can apply AI with validation, human review and governance · p13
g10 Strategy · I can prioritise, architect and govern AI initiatives according to risk and value · p16

**Certifications** (order · target · status · after phase):
1 · Azure AI Fundamentals — roadmap says AI-900; take **AI-901** · current (AI-900 retired 2026-06-30) · concepts with p12, exam after early p08
2 · Power BI Data Analyst (PL-300) · current · after p04 (prep woven into p06)
3 · Microsoft Fabric fundamentals / analytics learning · tbd (confirm exam at authoring) · after p06
4 · ServiceNow foundational certification · tbd · after p11
5 · Azure role-based learning for hosting and identity · tbd · after p10
6 · Advanced Azure AI / data science credential · tbd (DP-100 and AI-102 retired mid-2026) · after p14/p15
Rule from the roadmap: each credential pairs with one workplace artifact (portfolio item).

**Evidence portfolio** (→ `project` lessons): Capstone architecture diagram and glossary (p02) · KQL query workbook (p03) · Data-validation and reconciliation checklist (p04) · Stakeholder interview guide and problem statement template (p05) · Business case with assumptions, value, cost, feasibility and risk (p05) · Power BI report and metric dictionary (p06) · Grafana dashboard interpretation note (p06) · SharePoint knowledge page with version history (p07) · Python analysis notebook or small application (p08) · Git/Azure DevOps repository contribution (p09) · Azure hosting architecture and deployment note (p10) · UAT pack and defect log (p11) · ServiceNow incident/ticket examples permitted for learning records (p11) · Responsible AI and AI risk assessment (p12) · Machine-learning experiment report (p14) · AI solution evaluation and monitoring report (p15)
