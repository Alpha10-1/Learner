// Markdown → HTML for lessons, at build time only (CLAUDE.md §6.2).
// Raw HTML is escaped, never passed through; only https/http/mailto/# links survive;
// external links open in a new tab with rel="noopener"; images are not supported (§12).
import { Marked } from 'marked';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

const SAFE_HREF = /^(https?:\/\/|mailto:|#)/i;

const marked = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!SAFE_HREF.test(href)) return text;
      const external = /^https?:\/\//i.test(href);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      const rel = external ? ' rel="noopener" target="_blank"' : '';
      return `<a href="${escapeHtml(href)}"${t}${rel}>${text}</a>`;
    },
    image({ text }) {
      return escapeHtml(text);
    },
  },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }).trim();
}

export function renderInline(md: string): string {
  return marked.parseInline(md, { async: false }).trim();
}
