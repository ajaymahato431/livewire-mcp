/**
 * Livewire guidance.
 *
 * Upstream publishes `docs/best-practices.md`, but it is currently a stub of
 * roughly a hundred bytes. Version 1 fetched it on every call and then discarded
 * it via a length check, so the network round-trip was pure waste — and on the
 * branch where it *was* used, the caller's `topic` filter was silently ignored.
 *
 * Both sources are now merged: curated topics always answer, and any upstream
 * content is appended when it is substantial enough to be worth the tokens.
 */

export const BEST_PRACTICES = {
  components: `## Components
- Use Single File Components (SFCs) to combine PHP logic and Blade views into one file.
- Extract a plain Blade component first; reach for a Livewire component only when you need interactivity.
- Keep component state limited to what the view actually renders.
- Avoid storing large Eloquent collections in public properties — use computed properties instead.`,

  islands: `## Islands
- Use islands so independent regions of a page can update without re-rendering the whole component.
- Reach for them when a mostly static page contains a few expensive dynamic regions.
- Combine with lazy loading so heavy islands do not block the initial render.`,

  properties: `## Properties
- Public properties are serialised to the browser and sent back on every request. Never put secrets in them.
- Use \`#[Computed]\` for derived or queried data so it is not sent over the wire.
- Use \`#[Locked]\` for properties the client must not be able to modify.
- Prefer primitives and Eloquent models over large arrays for public state.`,

  actions: `## Actions
- Use \`wire:click\` and friends for user interactions rather than hand-written JavaScript.
- Prefer built-in directives such as \`wire:sort\` over custom JS wrappers.
- Always give long-running actions a loading state with \`wire:loading\`.
- Validate and authorise inside the action; a client can invoke any public method.`,

  forms: `## Forms
- Group related fields into a Form Object to keep components small.
- Bind inputs with \`wire:model\`, and use \`wire:model.live\` only when you genuinely need each keystroke.
- Validate server-side in the action that processes the form, or with validation attributes.
- Use \`wire:submit\` rather than a click handler on the submit button.`,

  rendering: `## Rendering
- Every component view needs exactly one root HTML element.
- Always set \`wire:key\` on elements rendered in a loop so Livewire can track them.
- Use \`wire:navigate\` on links for SPA-style navigation without a full page load.
- Keep the DOM stable between renders; large structural changes defeat morphing.`,

  performance: `## Performance
- Use computed properties instead of re-querying in \`render()\`.
- Lazy-load expensive components with \`#[Lazy]\` and provide a placeholder.
- Paginate long lists rather than rendering everything.
- Watch the payload size: every public property travels to the browser and back.`,
};

export const ALL_TOPICS = Object.keys(BEST_PRACTICES);

/** Upstream is a stub today; only include it when it carries real content. */
export function hasSubstance(text) {
  if (!text) return false;
  const stripped = String(text)
    .replace(/^#.*$/gm, "")
    .replace(/^[\s*\-+]+$/gm, "")
    .trim();
  return stripped.length > 20;
}

export function renderBestPractices({ topic, upstream } = {}) {
  const sections = [];

  if (topic) {
    const key = ALL_TOPICS.find((t) => t.toLowerCase() === String(topic).toLowerCase());
    if (key) {
      sections.push(`# Livewire Best Practices — ${key}\n\n${BEST_PRACTICES[key]}`);
    } else {
      sections.push(
        `Unknown topic "${topic}". Available topics: ${ALL_TOPICS.join(", ")}.\n\n` +
          `# Livewire Best Practices\n\n${Object.values(BEST_PRACTICES).join("\n\n")}`
      );
    }
  } else {
    sections.push(`# Livewire Best Practices\n\n${Object.values(BEST_PRACTICES).join("\n\n")}`);
  }

  if (hasSubstance(upstream)) {
    sections.push(`## From the official docs\n\n${String(upstream).trim()}`);
  }

  return sections.join("\n\n---\n\n");
}
