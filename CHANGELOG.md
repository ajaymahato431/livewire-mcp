# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] — 2026-09-04

The first public release. The headline change is that a GitHub token is no
longer required.

### Fixed

- **`GITHUB_TOKEN` is no longer needed.** The page index was built by listing the
  `docs/` directory through `api.github.com`, which allows anonymous callers only
  60 requests an hour — so the server effectively demanded a token. The index now
  comes from `docs/__nav.md` over raw.githubusercontent.com, which has no such
  limit. `GITHUB_TOKEN` remains supported but is entirely optional, and every
  integration test runs with it unset.
- **The index no longer contains the repository's internal files.** Listing the
  directory surfaced `__nav.md`, `__outline.md` and `AGENTS.md` as though they
  were documentation pages, and missed the `rules/` subdirectory entirely.
- **Page titles are real.** They were previously invented by dasherising the
  filename, so `wire-model.md` became "Wire Model". Titles now come from the
  navigation file: that page is `wire:model`.
- **`livewire_best_practices` no longer wastes a request or ignores `topic`.** It
  fetched the upstream `best-practices.md` on every call — a file that is
  currently a ~100-byte stub — and discarded it via a length check. On the branch
  where the fetch did succeed, the caller's `topic` filter was silently dropped.
  Upstream content is now cached and *merged* with the curated guidance, and
  `topic` applies either way.
- **Requests can no longer hang forever.** Every fetch has a timeout (default 15s)
  and retries transient failures with exponential backoff, honouring `Retry-After`.
- **Section extraction picks the right heading.** Matching was a plain substring
  test, so the first heading merely containing your term would win. Matches are
  now ranked exact, then prefix, then substring.
- **A failed startup is now reported.** `main()` was never `.catch()`-ed, so any
  startup error surfaced as a silent unhandled rejection.
- Failed fetches are cached briefly, so a missing page is not re-requested on
  every call.
- Concurrent requests for the same URL now share a single upstream fetch.

### Added

- Pages are read from `livewire.laravel.com`, which serves released documentation
  as real markdown, with raw.githubusercontent.com as a fallback. Pages whose
  published slug differs from their filename — `morphing` is published from
  `morph.md` — resolve correctly from either name.
- `list_livewire_docs` groups pages by the official navigation categories
  (Getting Started, Essentials, Features, HTML Directives, PHP Attributes,
  Blade Directives, Advanced) and accepts `category`, `limit` and `offset`.
- `read_livewire_docs` gains `outline: true`, returning just the page's headings
  so a section can be chosen cheaply. An unknown path now suggests close matches.
- When a requested `section` does not exist, the response lists the available
  headings instead of dumping the whole page.
- Two more best-practice topics: `performance` and `rendering`.
- Full configuration through CLI flags and environment variables, with `.env`
  support and documented precedence: flag > environment > default.
  See [`.env.example`](.env.example).
- `--help` and `--version`.
- `LIVEWIRE_DOCS_VERSION` and `LIVEWIRE_GITHUB_REF` to target another version or
  branch.
- Published to npm with a `bin` entry, so the server runs via
  `npx -y livewire-mcp` with no absolute paths in your MCP configuration.
- A real test suite: 53 offline unit tests and 20 live integration tests.
- CI across Node 20/22/24 on Linux, macOS and Windows.
- `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.

### Changed

- **Breaking:** `list_livewire_docs` with no arguments returns a category summary
  (~80 tokens) rather than every page. Pass `category: "all"` for the full list.
- **Breaking:** requires Node.js 20 or later.
- Migrated to the SDK's `McpServer` / `registerTool` API. Tool arguments are now
  validated, and tools are annotated as read-only.
- `GITHUB_TOKEN` is environment-only by design; there is deliberately no CLI flag,
  because a value passed as a flag is visible to anyone who can list processes.
- Internals split into `src/core/` (shared with the sibling servers) and
  `src/livewire.js`.
- License corrected from `ISC` (declared in `package.json` with no licence file)
  to MIT, with a `LICENSE` file.

## [1.0.0]

- Initial version: `list_livewire_docs`, `read_livewire_docs`,
  `search_livewire_docs`, `livewire_best_practices`.

[Unreleased]: https://github.com/ajaymahato431/livewire-mcp/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/ajaymahato431/livewire-mcp/releases/tag/v2.0.0
[1.0.0]: https://github.com/ajaymahato431/livewire-mcp/releases/tag/v1.0.0
