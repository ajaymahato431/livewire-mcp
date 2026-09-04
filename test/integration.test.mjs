/**
 * End-to-end tests: spawns the real server and talks JSON-RPC over stdio
 * against the live Livewire documentation.
 *
 * Network-dependent, so excluded from `npm test`. Run with `npm run test:integration`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { startServer, repoRoot } from "./helpers/client.mjs";
import { NAME, VERSION } from "../src/settings.js";

const ROOT = repoRoot(import.meta.url);

async function withServer(fn, options = {}) {
  const client = await startServer({ cwd: ROOT, ...options });
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

/** Every test runs with no token, so a regression to the old rate-limited path would fail. */
const NO_TOKEN = { env: { GITHUB_TOKEN: undefined } };

test("server initializes and reports its identity", async () => {
  await withServer(async (client) => {
    assert.equal(client.serverInfo.name, NAME);
    assert.equal(client.serverInfo.version, VERSION);
  }, NO_TOKEN);
});

test("all four tools are advertised with input schemas and read-only hints", async () => {
  await withServer(async (client) => {
    const tools = await client.listTools();

    assert.deepEqual(tools.map((t) => t.name).sort(), [
      "list_livewire_docs",
      "livewire_best_practices",
      "read_livewire_docs",
      "search_livewire_docs",
    ]);

    for (const tool of tools) {
      assert.ok(tool.description, `${tool.name} needs a description`);
      assert.equal(tool.inputSchema?.type, "object");
      assert.equal(tool.annotations?.readOnlyHint, true);
    }
  }, NO_TOKEN);
});

test("no tool description claims a GitHub token is required", async () => {
  await withServer(async (client) => {
    const tools = await client.listTools();
    for (const tool of tools) {
      assert.doesNotMatch(
        tool.description,
        /requires? .{0,20}GITHUB_TOKEN/i,
        `${tool.name} still advertises a token requirement`
      );
    }
  }, NO_TOKEN);
});

// ─── the headline fix: no token needed ───────────────────────────────────────

test("every documentation tool works with GITHUB_TOKEN unset", async () => {
  await withServer(async (client) => {
    const list = await client.call("list_livewire_docs");
    assert.equal(list.isError, false, `list failed without a token: ${list.text}`);

    const search = await client.call("search_livewire_docs", { query: "validation" });
    assert.equal(search.isError, false, `search failed without a token: ${search.text}`);

    const read = await client.call("read_livewire_docs", { path: "components" });
    assert.equal(read.isError, false, `read failed without a token: ${read.text}`);

    const practices = await client.call("livewire_best_practices");
    assert.equal(practices.isError, false);
  }, NO_TOKEN);
});

test("no response mentions rate limits or asks for a token", async () => {
  await withServer(async (client) => {
    const { text } = await client.call("list_livewire_docs");
    assert.doesNotMatch(text, /rate limit/i);
    assert.doesNotMatch(text, /GITHUB_TOKEN/);
  }, NO_TOKEN);
});

// ─── listing ─────────────────────────────────────────────────────────────────

test("the default listing is a compact category summary", async () => {
  await withServer(async (client) => {
    const { text, isError } = await client.call("list_livewire_docs");

    assert.equal(isError, false);
    assert.ok(text.length < 1500, `expected a compact summary, got ${text.length} chars`);
    assert.match(text, /Essentials — \d+ pages/);
    assert.match(text, /HTML Directives — \d+ pages/);
  }, NO_TOKEN);
});

test("the index excludes the repository's internal files", async () => {
  await withServer(async (client) => {
    const { text } = await client.call("list_livewire_docs", { category: "all" });

    // v1 listed the docs/ directory and surfaced these as documentation pages.
    for (const internal of ["__nav", "__outline", "AGENTS"]) {
      assert.ok(!text.includes(internal), `${internal} should not appear in the index`);
    }
  }, NO_TOKEN);
});

test("listed titles come from the navigation, not from the filename", async () => {
  await withServer(async (client) => {
    const { text } = await client.call("list_livewire_docs", { category: "HTML Directives" });

    // Dasherised filenames produced "Wire Model"; the real title is "wire:model".
    assert.match(text, /wire:model/);
    assert.ok(!text.includes("Wire Model"));
  }, NO_TOKEN);
});

test("an unknown category reports the available ones", async () => {
  await withServer(async (client) => {
    const { text, isError } = await client.call("list_livewire_docs", { category: "nonsense" });
    assert.equal(isError, true);
    assert.match(text, /Available categories/);
  }, NO_TOKEN);
});

// ─── reading ─────────────────────────────────────────────────────────────────

test("read_livewire_docs returns cleaned page content", async () => {
  await withServer(async (client) => {
    const { text, isError } = await client.call("read_livewire_docs", { path: "components" });

    assert.equal(isError, false);
    assert.match(text, /^Source: https:/m);
    assert.ok(text.length > 500);
    assert.ok(!text.includes("<svg"), "SVG markup should be stripped");
  }, NO_TOKEN);
});

test("a page whose slug differs from its filename still resolves", async () => {
  await withServer(async (client) => {
    // `morphing` is published from `morph.md`.
    const bySlug = await client.call("read_livewire_docs", { path: "morphing" });
    assert.equal(bySlug.isError, false, bySlug.text);

    const byFile = await client.call("read_livewire_docs", { path: "morph" });
    assert.equal(byFile.isError, false, byFile.text);
  }, NO_TOKEN);
});

test("section extraction returns far less than the full page", async () => {
  await withServer(async (client) => {
    const full = await client.call("read_livewire_docs", { path: "properties" });
    const outline = await client.call("read_livewire_docs", { path: "properties", outline: true });

    assert.equal(outline.isError, false);
    assert.ok(outline.text.length < full.text.length);

    // Pick an indented (level 2+) heading. The top-level heading's section spans
    // the whole document, so it is not a meaningful saving to assert against.
    const heading = outline.text
      .split("\n")
      .filter((line) => /^\s{2,}- \S/.test(line))
      .map((line) => line.replace(/^\s*- /, "").trim())[0];

    assert.ok(heading, `expected a nested heading in the outline:\n${outline.text}`);

    const section = await client.call("read_livewire_docs", {
      path: "properties",
      section: heading,
    });
    assert.equal(section.isError, false);
    assert.ok(
      section.text.length < full.text.length,
      `section "${heading}" (${section.text.length}) should be smaller than the page (${full.text.length})`
    );
  }, NO_TOKEN);
});

test("a missing section returns the outline rather than the whole page", async () => {
  await withServer(async (client) => {
    const full = await client.call("read_livewire_docs", { path: "components" });
    const { text } = await client.call("read_livewire_docs", {
      path: "components",
      section: "This Heading Does Not Exist",
    });

    assert.match(text, /was not found/);
    assert.match(text, /Available headings/);
    assert.ok(text.length < full.text.length);
  }, NO_TOKEN);
});

test("an unknown page suggests close matches", async () => {
  await withServer(async (client) => {
    const { text, isError } = await client.call("read_livewire_docs", { path: "componets" });
    assert.equal(isError, true);
    assert.match(text, /No such page/);
    assert.match(text, /Did you mean|list_livewire_docs/);
  }, NO_TOKEN);
});

// ─── search ──────────────────────────────────────────────────────────────────

test("search returns ranked results with categories", async () => {
  await withServer(async (client) => {
    const { text, isError } = await client.call("search_livewire_docs", {
      query: "islands",
      maxResults: 3,
    });

    assert.equal(isError, false);
    assert.match(text, /`[a-z0-9-]+`/);
    assert.match(text, /\(.+\)/, "each result should name its category");
  }, NO_TOKEN);
});

test("search with includeContent fetches the top result", async () => {
  await withServer(async (client) => {
    const { text } = await client.call("search_livewire_docs", {
      query: "validation",
      maxResults: 1,
      includeContent: true,
    });
    assert.ok(!text.includes("Could not fetch the top result"));
  }, NO_TOKEN);
});

// ─── best practices ──────────────────────────────────────────────────────────

test("best practices honours the topic filter against live upstream content", async () => {
  await withServer(async (client) => {
    const all = await client.call("livewire_best_practices");
    const one = await client.call("livewire_best_practices", { topic: "forms" });

    assert.match(one.text, /Best Practices — forms/);
    assert.ok(
      one.text.length < all.text.length,
      "the topic filter must apply even when upstream content is merged in"
    );
  }, NO_TOKEN);
});

// ─── configuration ───────────────────────────────────────────────────────────

test("a CLI flag overrides the environment", async () => {
  await withServer(
    async (client) => {
      const { text } = await client.call("list_livewire_docs");
      assert.match(text, /Livewire 3\.x documentation/, "the flag should win over the env var");
    },
    { args: ["--docs-version", "3.x"], env: { LIVEWIRE_DOCS_VERSION: "4.x", GITHUB_TOKEN: undefined } }
  );
});

test("an invalid repository ref fails with an actionable message", async () => {
  await withServer(
    async (client) => {
      const { text, isError } = await client.call("list_livewire_docs");
      assert.equal(isError, true);
      assert.match(text, /LIVEWIRE_GITHUB_REF|HTTP 404/);
    },
    { env: { LIVEWIRE_GITHUB_REF: "no-such-ref-xyz", GITHUB_TOKEN: undefined } }
  );
});

test("invalid arguments are rejected by schema validation", async () => {
  await withServer(async (client) => {
    const response = await client.callRaw("read_livewire_docs", {});
    const failed = Boolean(response.error) || response.result?.isError === true;
    assert.ok(failed, "omitting the required path must not succeed");
  }, NO_TOKEN);
});
