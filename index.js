import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ─── Server ──────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "livewire-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const BASE_RAW_URL = "https://raw.githubusercontent.com/livewire/livewire/main/docs";
const GITHUB_API_URL = "https://api.github.com/repos/livewire/livewire/contents/docs";

// ─── LRU Cache ───────────────────────────────────────────────────────────────

const CACHE_MAX = 100;
const DOC_TTL = 3 * 60 * 60 * 1000; // 3 hours for doc pages
const INDEX_TTL = 3 * 60 * 60 * 1000; // 3 hours for index
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    cache.delete(key);
    return null;
  }
  // LRU: re-insert to move to end
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

function cacheSet(key, data, ttl) {
  if (cache.size >= CACHE_MAX) {
    // Evict oldest (first key)
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, ts: Date.now(), ttl });
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

async function fetchWithGithubAuth(url, asJson = false) {
  const headers = {
    "User-Agent": "livewire-mcp",
  };
  
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  
  return asJson ? await res.json() : await res.text();
}

async function fetchText(url, ttl = DOC_TTL) {
  const cached = cacheGet(url);
  if (cached) return cached;

  const text = await fetchWithGithubAuth(url, false);
  cacheSet(url, text, ttl);
  return text;
}

// ─── Markdown Cleaner ────────────────────────────────────────────────────────

function cleanMarkdown(md) {
  let out = md;
  // Remove HTML comments
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  // Remove SVG elements
  out = out.replace(/<svg[\s\S]*?<\/svg>/g, "");
  // Collapse 3+ blank lines to 2
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

// ─── Section Extractor ───────────────────────────────────────────────────────
// Returns only the content under a specific heading (case-insensitive match).

function extractSection(md, sectionName) {
  const lines = md.split("\n");
  const target = sectionName.toLowerCase().trim();
  let capturing = false;
  let captureLevel = 0;
  const result = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].toLowerCase().trim();
      if (!capturing && title.includes(target)) {
        capturing = true;
        captureLevel = level;
        result.push(line);
        continue;
      }
      if (capturing && level <= captureLevel) {
        break; // Next heading of equal or higher level — stop
      }
    }
    if (capturing) {
      result.push(line);
    }
  }

  return result.length > 0 ? result.join("\n").trim() : null;
}

// ─── GitHub API Index Parser ─────────────────────────────────────────────────

async function getDocsIndex() {
  const cached = cacheGet(GITHUB_API_URL);
  if (cached) return cached;

  const data = await fetchWithGithubAuth(GITHUB_API_URL, true);
  
  if (!Array.isArray(data)) {
    throw new Error("Invalid response from GitHub API. Expected array.");
  }

  const entries = data
    .filter(file => file.name.endsWith('.md'))
    .map(file => {
      const path = file.name.replace('.md', '');
      // Make a readable title from the path
      const title = path.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      return { title, path, url: file.download_url };
    });

  cacheSet(GITHUB_API_URL, entries, INDEX_TTL);
  return entries;
}

// ─── Search Scorer ───────────────────────────────────────────────────────────

function scoreMatch(entry, query) {
  const q = query.toLowerCase();
  const title = entry.title.toLowerCase();
  const path = entry.path.toLowerCase();

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (path.includes(q)) return 40;
  const words = q.split(/\s+/);
  const matchCount = words.filter(w => title.includes(w) || path.includes(w)).length;
  if (matchCount > 0) return 20 * (matchCount / words.length);

  return 0;
}

// ─── Fallback Best Practices Content ─────────────────────────────────────────

const FALLBACK_BEST_PRACTICES = {
  components: `## Components (Livewire 4.x)
- Use Single File Components (SFCs) to combine PHP logic and Blade views into a single file by default.
- Keep component state strictly related to the view.
- Avoid storing large Eloquent Collections as public properties. Use computed properties instead.`,

  islands: `## Islands (Livewire 4.x)
- Use the Islands architecture to allow independent sections of a page to update asynchronously without re-rendering the whole page.
- Useful for heavy dynamic components on otherwise static pages.`,

  properties: `## Properties
- Public properties are exposed to the frontend. Avoid putting sensitive data in public properties.
- Use Computed Properties (\`#[Computed]\`) for data that is derived or needs to be queried. This prevents sending unnecessary data over the wire.`,

  actions: `## Actions
- Use \`wire:click\` for user interactions.
- Use new Livewire 4.x directives like \`wire:sort\` for drag-and-drop instead of writing custom JS wrappers.
- Avoid long-running blocking tasks in actions without providing loading state feedback (\`wire:loading\`).`,

  forms: `## Forms
- Group related form fields into a Form Object class to keep components clean.
- Use \`wire:model\` for binding form inputs.
- Only validate data server-side inside the action that processes the form, or use Livewire's built-in validation attributes.`,

  rendering: `## Rendering
- Ensure every component view has exactly ONE root HTML element.
- When iterating over items in a loop, always use \`wire:key\` to help Livewire track elements correctly.`,
};

const ALL_TOPICS = Object.keys(FALLBACK_BEST_PRACTICES);

// ─── Tool Definitions ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_livewire_docs",
      description: "Returns an index of available Livewire documentation pages with their paths. Requires GITHUB_TOKEN if rate limited.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "read_livewire_docs",
      description: 'Reads a Livewire documentation page. Use list_livewire_docs first to find the correct path. Examples: "components", "actions", "quickstart".',
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: 'The doc page path (e.g., "components"). Required.',
          },
          section: {
            type: "string",
            description: 'Optional heading name to extract only that section (e.g., "Inline components"). Reduces token usage.',
          },
        },
        required: ["path"],
      },
    },
    {
      name: "search_livewire_docs",
      description: 'Searches Livewire docs by keyword. Returns matching page titles and paths, optionally fetching the top result content.',
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: 'Search query (e.g., "validation", "teleport").',
          },
          includeContent: {
            type: "boolean",
            description: "If true, fetches and returns the content of the top matching page.",
          },
          maxResults: {
            type: "number",
            description: "Max matching pages to return. Default: 5.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "livewire_best_practices",
      description: 'Returns Livewire coding guidelines and anti-patterns. Fetches from official best-practices.md or falls back to built-in rules.',
      inputSchema: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: `Optional topic filter (applies only to fallback list): ${ALL_TOPICS.map((t) => `"${t}"`).join(", ")}. Returns all topics if omitted.`,
          },
        },
      },
    },
  ],
}));

// ─── Tool Handlers ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list_livewire_docs") {
    try {
      const entries = await getDocsIndex();
      const lines = entries.map((e) => `${e.path} — ${e.title}`);
      const text = `# Livewire Documentation Index\n${entries.length} pages available.\n\n${lines.join("\n")}`;
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to fetch docs index: ${error.message}\nPlease provide a valid GITHUB_TOKEN environment variable to avoid rate limits.` }],
        isError: true,
      };
    }
  }

  if (name === "read_livewire_docs") {
    const path = (args?.path || "").replace(/^\/+/, "").replace(/\.md$/, "");
    if (!path) {
      return { content: [{ type: "text", text: 'Missing required "path" parameter.' }], isError: true };
    }

    const url = `${BASE_RAW_URL}/${path}.md`;
    try {
      let content = await fetchText(url);
      content = cleanMarkdown(content);

      if (args?.section) {
        const extracted = extractSection(content, args.section);
        if (extracted) {
          content = extracted;
        } else {
          content = `> Section "${args.section}" not found.\n\n${content}`;
        }
      }

      return { content: [{ type: "text", text: `Source: ${url}\n\n${content}` }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to fetch: ${url}\n${error.message}` }], isError: true };
    }
  }

  if (name === "search_livewire_docs") {
    const query = args?.query;
    if (!query) {
      return { content: [{ type: "text", text: 'Missing required "query" parameter.' }], isError: true };
    }

    try {
      const entries = await getDocsIndex();
      const maxResults = args?.maxResults || 5;
      const includeContent = args?.includeContent || false;

      const scored = entries
        .map((e) => ({ ...e, score: scoreMatch(e, query) }))
        .filter((e) => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      if (scored.length === 0) {
        return { content: [{ type: "text", text: `No matches for "${query}".` }] };
      }

      let text = `# Search: "${query}"\n${scored.length} results:\n\n`;
      text += scored.map((e, i) => `${i + 1}. **${e.title}** — \`${e.path}\``).join("\n");

      if (includeContent && scored.length > 0) {
        try {
          let content = await fetchText(`${BASE_RAW_URL}/${scored[0].path}.md`);
          content = cleanMarkdown(content);
          text += `\n\n---\n\n## ${scored[0].title}\n\n${content}`;
        } catch {
          text += `\n\n> Could not fetch content for top result.`;
        }
      }

      return { content: [{ type: "text", text }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Search failed: ${error.message}` }], isError: true };
    }
  }

  if (name === "livewire_best_practices") {
    const topic = args?.topic?.toLowerCase();

    // Try to fetch dynamic best-practices.md
    try {
      const content = await fetchText(`${BASE_RAW_URL}/best-practices.md`);
      if (content.length > 200) {
        return { content: [{ type: "text", text: `# Livewire Best Practices (Dynamic)\n\n${content}` }] };
      }
    } catch (e) {
      // fallback to hardcoded
    }

    // Fallback to hardcoded rules
    if (topic && FALLBACK_BEST_PRACTICES[topic]) {
      return { content: [{ type: "text", text: `# Livewire Best Practices — ${topic}\n\n${FALLBACK_BEST_PRACTICES[topic]}` }] };
    }

    const all = Object.values(FALLBACK_BEST_PRACTICES).join("\n\n");
    return { content: [{ type: "text", text: `# Livewire Best Practices (Fallback)\n\n${all}` }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Livewire MCP Server v1.0.0 running");
}

main();
