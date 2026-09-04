/**
 * Livewire-specific documentation handling.
 *
 * Two upstream sources are used, deliberately:
 *
 * - The **index** comes from `__nav.md` in the Livewire repository, fetched over
 *   raw.githubusercontent.com. It is the site's own navigation file, so it
 *   carries official categories and human-written titles, and it excludes the
 *   repo's internal files (`__outline.md`, `AGENTS.md`, `.obsidian/`, `rules/`).
 *   Earlier versions listed the `docs/` directory through `api.github.com`
 *   instead, which is rate-limited to 60 requests an hour for anonymous callers
 *   and therefore required a `GITHUB_TOKEN`. raw.githubusercontent.com has no
 *   such limit, so no token is needed.
 *
 * - **Pages** come from livewire.laravel.com, which serves real `text/markdown`
 *   for the released version, with raw.githubusercontent.com as a fallback.
 */

import { collapseBlankLines, stripHtmlComments } from "./core/markdown.js";

export const SITE_ORIGIN = "https://livewire.laravel.com/docs";
export const RAW_ORIGIN = "https://raw.githubusercontent.com/livewire/livewire";
export const NAV_URL = `${RAW_ORIGIN}/main/docs/__nav.md`;

/** `Title: { uri: /docs/4.x/slug, file: /file.md }` */
const ENTRY = /^\s+(.+?):\s*\{\s*uri:\s*([^,}]+?)\s*,\s*file:\s*([^,}]+?)\s*\}\s*$/;
/** A top-level, unindented `Category:` line. */
const CATEGORY = /^([A-Za-z][^:]*):\s*$/;

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length > 1 && /^(['"]).*\1$/.test(trimmed)) return trimmed.slice(1, -1);
  return trimmed;
}

/**
 * Parses `__nav.md` into `{ title, path, file, category }` entries.
 *
 * `path` is the slug from the page's `uri`, which is what the documentation site
 * serves. `file` is the source filename, which is what raw.githubusercontent
 * serves. These are usually the same but not always — `morphing` is published
 * from `morph.md` — so both are kept and the fallback uses `file`.
 */
export function parseNav(text) {
  const entries = [];
  let category = "Uncategorized";

  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.trim() === "---") continue;

    const entry = line.match(ENTRY);
    if (entry) {
      const [, rawTitle, uri, file] = entry;
      const slug = uri.trim().replace(/\/+$/, "").split("/").pop();
      if (!slug) continue;

      entries.push({
        title: unquote(rawTitle),
        path: slug,
        file: file.trim().replace(/^\/+/, "").replace(/\.md$/, ""),
        category,
      });
      continue;
    }

    const heading = line.match(CATEGORY);
    if (heading) category = heading[1].trim();
  }

  return entries;
}

/** `{ category, count }` rows in the order the navigation defines them. */
export function groupByCategory(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}

export function filterByCategory(entries, category) {
  const target = String(category).toLowerCase().trim();
  return entries.filter((entry) => entry.category.toLowerCase() === target);
}

/**
 * Resolves a caller-supplied path to an index entry, accepting either the
 * published slug or the source filename so that both `morphing` and `morph` work.
 */
export function resolveEntry(entries, path) {
  const target = String(path)
    .trim()
    .replace(/^\/+/, "")
    .replace(/\.md$/, "")
    .toLowerCase();

  return (
    entries.find((entry) => entry.path.toLowerCase() === target) ??
    entries.find((entry) => entry.file.toLowerCase() === target) ??
    null
  );
}

export function cleanMarkdown(md) {
  let out = stripHtmlComments(md);

  // Inline SVG artwork and images carry no meaning for a text consumer.
  out = out.replace(/<svg[\s\S]*?<\/svg>/g, "");
  out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, "");

  return collapseBlankLines(out).trim();
}
