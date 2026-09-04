/**
 * Server identity and configuration schema.
 *
 * Kept out of index.js so that tests and documentation checks can import it
 * without starting a server.
 */

export const NAME = "livewire-mcp";
export const VERSION = "2.0.0";

const HOURS = 60 * 60 * 1000;

export const SCHEMA = {
  docsVersion: {
    flag: "docs-version",
    env: "LIVEWIRE_DOCS_VERSION",
    type: "string",
    default: "4.x",
    description: "Livewire docs version to read pages from",
  },
  githubRef: {
    flag: "github-ref",
    env: "LIVEWIRE_GITHUB_REF",
    type: "string",
    default: "main",
    description: "Livewire repository ref used for the index and fallback",
  },
  githubToken: {
    // Environment-only: a token passed as a CLI flag would be visible to anyone
    // who can list processes. It is optional — nothing here requires auth.
    secret: true,
    env: "GITHUB_TOKEN",
    type: "string",
    default: "",
    description: "Optional GitHub token; only raises the anonymous rate limit",
  },
  requestTimeoutMs: {
    flag: "timeout",
    env: "REQUEST_TIMEOUT_MS",
    type: "number",
    default: 15000,
    description: "Per-request timeout in milliseconds",
  },
  retries: {
    flag: "retries",
    env: "REQUEST_RETRIES",
    type: "number",
    default: 2,
    description: "Retry attempts for transient upstream failures",
  },
  cacheMax: {
    flag: "cache-max",
    env: "CACHE_MAX_ENTRIES",
    type: "number",
    default: 100,
    description: "Maximum cached documents",
  },
  docTtlMs: {
    flag: "doc-ttl",
    env: "DOC_TTL_MS",
    type: "number",
    default: 3 * HOURS,
    description: "Cache lifetime for documentation pages",
  },
  indexTtlMs: {
    flag: "index-ttl",
    env: "INDEX_TTL_MS",
    type: "number",
    default: 6 * HOURS,
    description: "Cache lifetime for the documentation index",
  },
  negativeTtlMs: {
    flag: "negative-ttl",
    env: "NEGATIVE_TTL_MS",
    type: "number",
    default: 60 * 1000,
    description: "How long a failed fetch is remembered before retrying",
  },
  maxResults: {
    flag: "max-results",
    env: "SEARCH_MAX_RESULTS",
    type: "number",
    default: 5,
    description: "Default number of search results",
  },
};
