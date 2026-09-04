/**
 * Unit tests for the Livewire navigation parser, page resolution, and the
 * merged best-practices output. Offline — safe to run in CI.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseNav,
  groupByCategory,
  filterByCategory,
  resolveEntry,
  cleanMarkdown,
} from "../src/livewire.js";
import { renderBestPractices, hasSubstance, ALL_TOPICS } from "../src/best-practices.js";
import { repoRoot } from "./helpers/client.mjs";

const ROOT = repoRoot(import.meta.url);
const NAV = readFileSync(join(ROOT, "test", "fixtures", "nav-sample.md"), "utf8");
const STUB = readFileSync(join(ROOT, "test", "fixtures", "best-practices-stub.md"), "utf8");

const entries = parseNav(NAV);

// ─── navigation parsing ──────────────────────────────────────────────────────

test("parseNav reads every entry with its official category", () => {
  assert.equal(entries.length, 10);
  assert.deepEqual(
    groupByCategory(entries).map((g) => g.category),
    ["Getting Started", "Essentials", "HTML Directives", "Blade Directives", "Advanced"]
  );
});

test("parseNav preserves the navigation's own titles", () => {
  // v1 invented titles by dasherising the filename, turning "wire-model" into
  // "Wire Model". The navigation file has the real ones.
  const model = entries.find((e) => e.path === "wire-model");
  assert.equal(model.title, "wire:model");
  assert.equal(model.category, "HTML Directives");
});

test("parseNav unquotes titles that need quoting in the source", () => {
  const island = entries.find((e) => e.path === "directive-island");
  assert.equal(island.title, "@island", "the surrounding quotes should be stripped");
});

test("parseNav keeps the published slug and the source filename separately", () => {
  // `morphing` is published from `morph.md`; conflating them breaks the
  // repository fallback.
  const morphing = entries.find((e) => e.title === "Morphing");
  assert.equal(morphing.path, "morphing");
  assert.equal(morphing.file, "morph");
});

test("parseNav excludes the repository's internal files", () => {
  // The api.github.com listing used by v1 included __nav.md, __outline.md and
  // AGENTS.md as if they were documentation pages.
  for (const entry of entries) {
    assert.doesNotMatch(entry.path, /^__/, `${entry.path} is an internal file`);
    assert.notEqual(entry.path.toLowerCase(), "agents");
  }
});

test("parseNav ignores the document delimiters and blank lines", () => {
  assert.ok(!entries.some((e) => e.path === "---" || e.path === ""));
});

test("parseNav returns nothing for unrelated content rather than guessing", () => {
  assert.deepEqual(parseNav("# Just a heading\n\nSome prose.\n"), []);
});

// ─── categories ──────────────────────────────────────────────────────────────

test("groupByCategory counts pages per category", () => {
  const counts = Object.fromEntries(groupByCategory(entries).map((g) => [g.category, g.count]));
  assert.equal(counts.Essentials, 3);
  assert.equal(counts["HTML Directives"], 2);
  assert.equal(counts["Getting Started"], 2);
});

test("filterByCategory is case-insensitive and matches whole categories", () => {
  assert.equal(filterByCategory(entries, "essentials").length, 3);
  assert.equal(filterByCategory(entries, "ESSENTIALS").length, 3);
  assert.equal(filterByCategory(entries, "essential").length, 0);
});

// ─── page resolution ─────────────────────────────────────────────────────────

test("resolveEntry accepts the published slug", () => {
  assert.equal(resolveEntry(entries, "morphing")?.file, "morph");
});

test("resolveEntry also accepts the source filename", () => {
  assert.equal(resolveEntry(entries, "morph")?.path, "morphing");
});

test("resolveEntry tolerates leading slashes, .md suffixes and casing", () => {
  for (const input of ["/components", "components.md", "/Components.md", "COMPONENTS"]) {
    assert.equal(resolveEntry(entries, input)?.path, "components", `failed for ${input}`);
  }
});

test("resolveEntry returns null for an unknown page", () => {
  assert.equal(resolveEntry(entries, "not-a-real-page"), null);
});

// ─── markdown cleanup ────────────────────────────────────────────────────────

test("cleanMarkdown strips SVGs, images and HTML comments", () => {
  const input = [
    "# Title",
    "<!-- internal note -->",
    "<svg viewBox='0 0 10 10'><path d='M0 0'/></svg>",
    "![diagram](https://example.com/d.png)",
    "Real content.",
  ].join("\n");

  const out = cleanMarkdown(input);
  assert.match(out, /# Title/);
  assert.match(out, /Real content\./);
  for (const noise of ["<svg", "internal note", "d.png"]) {
    assert.ok(!out.includes(noise), `"${noise}" should have been stripped`);
  }
});

// ─── best practices ──────────────────────────────────────────────────────────

test("hasSubstance rejects the upstream stub and empty input", () => {
  // The real docs/best-practices.md is currently ~100 bytes of bullet markers.
  assert.equal(hasSubstance(""), false);
  assert.equal(hasSubstance(null), false);
  assert.equal(hasSubstance("# Heading only"), false);
  assert.equal(hasSubstance("*\n*\n*"), false);
  assert.equal(hasSubstance(STUB), true, "the stub does carry one real sentence");
});

test("best practices honours the topic filter", () => {
  const all = renderBestPractices({});
  const one = renderBestPractices({ topic: "forms" });

  assert.match(one, /Livewire Best Practices — forms/);
  assert.ok(one.length < all.length, "one topic should be smaller than all topics");
  assert.ok(!one.includes("## Islands"), "other topics should be excluded");
});

test("best practices honours the topic filter even when upstream has content", () => {
  // v1 returned the upstream page verbatim and silently dropped `topic`.
  const one = renderBestPractices({ topic: "forms", upstream: STUB });
  assert.match(one, /Livewire Best Practices — forms/);
  assert.match(one, /From the official docs/);
  assert.ok(!one.includes("## Islands"));
});

test("best practices merges upstream content instead of replacing curated guidance", () => {
  const merged = renderBestPractices({ upstream: STUB });
  assert.match(merged, /## Components/, "curated guidance must survive");
  assert.match(merged, /From the official docs/);
  assert.match(merged, /extracting a Blade component first/);
});

test("best practices omits an empty upstream section entirely", () => {
  const out = renderBestPractices({ upstream: "*\n*\n" });
  assert.ok(!out.includes("From the official docs"));
  assert.match(out, /## Components/);
});

test("best practices works with no upstream at all", () => {
  const out = renderBestPractices({});
  assert.match(out, /## Components/);
  assert.ok(!out.includes("From the official docs"));
});

test("an unknown topic lists the valid ones", () => {
  const out = renderBestPractices({ topic: "nonsense" });
  assert.match(out, /Unknown topic/);
  for (const topic of ALL_TOPICS) assert.ok(out.includes(topic));
});
