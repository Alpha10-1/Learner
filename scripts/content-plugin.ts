// Vite plugin: builds lesson content during dev and build (CLAUDE.md §6.2).
// - `virtual:mq-content` exports the hashed index URL for the app.
// - dev: serves /content/* from memory; rebuilds and reloads the page when content/ changes.
// - build: emits the public index and phase chunks into dist/content/ (the private pack never).
import { isAbsolute, join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { buildContent, formatIssues, writeGenerated, type ContentBuild } from './build-content.ts';

const VIRTUAL_ID = 'virtual:mq-content';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export function contentPlugin(): Plugin {
  let root = process.cwd();
  let base = '/';
  let current: ContentBuild | undefined;

  /** Rebuilds content. Errors fail the build; in dev they keep the last good build. */
  const rebuild = (strict: boolean): void => {
    const build = buildContent({ root });
    for (const line of formatIssues(build)) console.warn(`[mq-content] ${line}`);
    if (build.errors.length) {
      const message = `[mq-content] ${build.errors.length} content error(s); see above or run npm run content:check`;
      if (strict || !current) throw new Error(message);
      console.error(`${message}. Keeping the last good build.`);
      return;
    }
    writeGenerated(build, root);
    current = build;
  };

  return {
    name: 'mq-content',
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    buildStart() {
      rebuild(true);
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID || !current) return undefined;
      return `export const contentIndexUrl = ${JSON.stringify(`${base}content/${current.indexFile}`)};`;
    },
    generateBundle() {
      for (const [name, json] of current?.files ?? []) {
        this.emitFile({ type: 'asset', fileName: `content/${name}`, source: json });
      }
    },
    configureServer(server) {
      const prefix = `${base}content/`;
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        const json = path.startsWith(prefix) ? current?.files.get(path.slice(prefix.length)) : undefined;
        if (json === undefined) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(json);
      });
      const contentDir = join(root, 'content');
      server.watcher.add(contentDir);
      server.watcher.on('all', (_event, file) => {
        const rel = relative(contentDir, file);
        if (!rel || rel.startsWith('..') || isAbsolute(rel)) return;
        rebuild(false);
        const graph = server.environments.client.moduleGraph;
        const mod = graph.getModuleById(RESOLVED_ID);
        if (mod) graph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
