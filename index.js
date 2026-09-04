#!/usr/bin/env node
/**
 * livewire-mcp — Model Context Protocol server for Livewire documentation.
 *
 * Fetches, cleans and serves Livewire docs to AI agents over stdio, with an
 * emphasis on returning the smallest useful slice of a page.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { bootstrap } from "./src/core/config.js";
import { createHttpClient } from "./src/core/http.js";
import { extractSection, renderOutline } from "./src/core/markdown.js";
import { searchEntries } from "./src/core/search.js";
import { runMain, serveStdio, textResult, errorResult, safeHandler } from "./src/core/runtime.js";
import {
  SITE_ORIGIN,
  RAW_ORIGIN,
  NAV_URL,
  parseNav,
  cleanMarkdown,
  groupByCategory,
  filterByCategory,
  resolveEntry,
} from "./src/livewire.js";
import { ALL_TOPICS, renderBestPractices } from "./src/best-practices.js";
import { NAME, VERSION, SCHEMA } from "./src/settings.js";

const { config } = bootstrap({
  name: NAME,
  version: VERSION,
  description: "Serves Livewire documentation to AI agents over the Model Context Protocol.",
  schema: SCHEMA,
  importMetaUrl: import.meta.url,
  examples: [`${NAME} --docs-version 3.x`, `${NAME} --timeout 30000`],
});

const navUrl = NAV_URL.replace("/main/", `/${config.githubRef}/`);
const rawBase = `${RAW_ORIGIN}/${config.githubRef}/docs`;
const siteBase = `${SITE_ORIGIN}/${config.docsVersion}`;

const http = createHttpClient({
  userAgent: `${NAME}/${VERSION} (+https://github.com/ajaymahato431/livewire-mcp)`,
  timeoutMs: config.requestTimeoutMs,
  retries: config.retries,
  cacheMax: config.cacheMax,
  defaultTtl: config.docTtlMs,
  negativeTtl: config.negativeTtlMs,
  // Entirely optional. Anonymous raw.githubusercontent.com access is not rate
  // limited the way the api.github.com contents endpoint is, so this only helps
  // users who are already sharing an IP with heavy GitHub traffic.
  headers: config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {},
});

async function loadIndex() {
  const raw = await http.fetchText(navUrl, { ttl: config.indexTtlMs });
  const entries = parseNav(raw);

  if (entries.length === 0) {
    throw new Error(
      `Could not read the documentation index from ${navUrl}. ` +
        `If LIVEWIRE_GITHUB_REF is set, check that the ref exists.`
    );
  }

  return entries;
}

/**
 * Reads a page from the documentation site, falling back to the repository.
 *
 * The site serves the released version and is not rate limited; the repository
 * is the source of truth for whichever ref is configured. Their filenames can
 * differ — `morphing` is published from `morph.md` — so each source is asked for
 * the name it actually knows.
 */
async function readPage(entry) {
  try {
    const raw = await http.fetchText(`${siteBase}/${entry.path}.md`, { ttl: config.docTtlMs });
    return { content: cleanMarkdown(raw), source: `${siteBase}/${entry.path}` };
  } catch (siteError) {
    try {
      const raw = await http.fetchText(`${rawBase}/${entry.file}.md`, { ttl: config.docTtlMs });
      return { content: cleanMarkdown(raw), source: `${rawBase}/${entry.file}.md` };
    } catch {
      throw siteError;
    }
  }
}

const server = new McpServer({ name: NAME, version: VERSION }, { capabilities: { tools: {} } });

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const NETWORK_HINT = "Check network access to livewire.laravel.com and github.com, then try again.";

// ─── list_livewire_docs ──────────────────────────────────────────────────────

server.registerTool(
  "list_livewire_docs",
  {
    title: "List Livewire documentation pages",
    description:
      "Browses the Livewire documentation index, grouped by the official navigation " +
      "categories. Called with no arguments it returns a category summary (~100 tokens). " +
      "Pass `category` to list that category's pages, or `category: \"all\"` for every page " +
      "(~1000 tokens). No GitHub token is required.",
    inputSchema: {
      category: z
        .string()
        .optional()
        .describe(
          'Category to list, e.g. "Essentials", "Features", "HTML Directives", ' +
            '"PHP Attributes", "Advanced". Use "all" for every page.'
        ),
      limit: z.number().int().positive().max(500).optional().describe("Maximum pages to return."),
      offset: z.number().int().min(0).optional().describe("Pages to skip, for paging."),
    },
    annotations: READ_ONLY,
  },
  safeHandler(async ({ category, limit, offset = 0 }) => {
    const entries = await loadIndex();

    if (!category) {
      const groups = groupByCategory(entries);
      const rows = groups.map((g) => `  ${g.category} — ${g.count} pages`).join("\n");
      return textResult(
        `# Livewire ${config.docsVersion} documentation\n` +
          `${entries.length} pages across ${groups.length} categories.\n\n${rows}\n\n` +
          `Next: call again with a category, or use search_livewire_docs to find a page directly.`
      );
    }

    const wantsAll = String(category).toLowerCase() === "all";
    const selected = wantsAll ? entries : filterByCategory(entries, category);

    if (selected.length === 0) {
      const available = groupByCategory(entries)
        .map((g) => g.category)
        .join(", ");
      return errorResult(
        `No category "${category}" in the Livewire docs.\nAvailable categories: ${available}`
      );
    }

    const page = selected.slice(offset, offset + (limit ?? selected.length));
    const more =
      offset + page.length < selected.length
        ? `\n\nMore available: call again with offset ${offset + page.length}.`
        : "";

    return textResult(
      `# Livewire ${config.docsVersion} — ${wantsAll ? "all pages" : category}\n` +
        `Showing ${page.length} of ${selected.length}\n\n` +
        `${page.map((e) => `${e.path} — ${e.title}`).join("\n")}${more}`
    );
  }, NETWORK_HINT)
);

// ─── read_livewire_docs ──────────────────────────────────────────────────────

server.registerTool(
  "read_livewire_docs",
  {
    title: "Read a Livewire documentation page",
    description:
      "Reads one Livewire documentation page. Use `section` to extract a single heading " +
      "instead of the whole page. Find paths with list_livewire_docs or search_livewire_docs. " +
      'Examples: "components", "wire-model", "islands", "attribute-computed".',
    inputSchema: {
      path: z.string().min(1).describe('Doc page path, e.g. "components". Required.'),
      section: z
        .string()
        .optional()
        .describe('Heading to extract, e.g. "Inline components". Greatly reduces output size.'),
      outline: z
        .boolean()
        .optional()
        .describe("Return only the page's heading outline, to choose a section cheaply."),
    },
    annotations: READ_ONLY,
  },
  safeHandler(async ({ path, section, outline }) => {
    const requested = path.replace(/^\/+/, "").replace(/\.md$/, "");
    if (!requested) return errorResult('The "path" parameter cannot be empty.');

    const entries = await loadIndex();
    const entry = resolveEntry(entries, requested);

    if (!entry) {
      const close = searchEntries(entries, requested, { limit: 5 });
      const suggestion = close.length
        ? `\n\nDid you mean:\n${close.map((e) => `  ${e.path} — ${e.title}`).join("\n")}`
        : `\n\nUse list_livewire_docs to browse the available pages.`;
      return errorResult(`No such page: ${requested}${suggestion}`);
    }

    const { content, source } = await readPage(entry);

    if (outline) {
      return textResult(`# Outline — ${entry.title} (${entry.path})\n\n${renderOutline(content)}`);
    }

    if (section) {
      const extracted = extractSection(content, section);
      if (extracted) return textResult(`Source: ${source}\n\n${extracted}`);

      return textResult(
        `Section "${section}" was not found on ${entry.path}. Available headings:\n\n` +
          `${renderOutline(content)}\n\n` +
          `Re-read with one of these, or omit "section" for the full page.`
      );
    }

    return textResult(`Source: ${source}\n\n${content}`);
  }, NETWORK_HINT)
);

// ─── search_livewire_docs ────────────────────────────────────────────────────

server.registerTool(
  "search_livewire_docs",
  {
    title: "Search the Livewire documentation",
    description:
      "Finds Livewire documentation pages by keyword, returning ranked titles, paths and " +
      "categories. Use this when you do not already know the exact page path.",
    inputSchema: {
      query: z.string().min(1).describe('Search terms, e.g. "validation", "islands", "wire:model".'),
      includeContent: z
        .boolean()
        .optional()
        .describe("Also return the full content of the top result. Default false."),
      maxResults: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe("Result count. Default 5."),
    },
    annotations: READ_ONLY,
  },
  safeHandler(async ({ query, includeContent = false, maxResults }) => {
    const entries = await loadIndex();
    const results = searchEntries(entries, query, { limit: maxResults ?? config.maxResults });

    if (results.length === 0) {
      const categories = groupByCategory(entries)
        .map((g) => g.category)
        .join(", ");
      return textResult(
        `No Livewire pages matched "${query}".\nTry broader terms, or browse a category: ${categories}`
      );
    }

    let text =
      `# Search: "${query}"\n${results.length} result${results.length === 1 ? "" : "s"}:\n\n` +
      results.map((e, i) => `${i + 1}. **${e.title}** — \`${e.path}\` (${e.category})`).join("\n");

    if (includeContent) {
      try {
        const { content } = await readPage(results[0]);
        text += `\n\n---\n\n## ${results[0].title}\n\n${content}`;
      } catch {
        text += `\n\n> Could not fetch the top result; read it directly with read_livewire_docs.`;
      }
    }

    return textResult(text);
  }, NETWORK_HINT)
);

// ─── livewire_best_practices ─────────────────────────────────────────────────

server.registerTool(
  "livewire_best_practices",
  {
    title: "Livewire best practices",
    description:
      "Returns curated Livewire coding guidelines and anti-patterns, merged with the " +
      "official best-practices page when it has content. Read this before writing or " +
      "refactoring Livewire components.",
    inputSchema: {
      topic: z.enum(ALL_TOPICS).optional().describe("Single topic to return. Omit for all topics."),
    },
    annotations: READ_ONLY,
  },
  safeHandler(async ({ topic }) => {
    // Cached like any other page, so this costs at most one request per TTL
    // rather than one per call. A failure here must not fail the tool: the
    // curated guidance is the primary source and works offline.
    let upstream = null;
    try {
      upstream = await http.fetchText(`${rawBase}/best-practices.md`, { ttl: config.docTtlMs });
    } catch {
      upstream = null;
    }

    return textResult(renderBestPractices({ topic, upstream }));
  })
);

// ─── Start ───────────────────────────────────────────────────────────────────

runMain(async () => {
  await serveStdio(server, { name: NAME, version: VERSION });
});
