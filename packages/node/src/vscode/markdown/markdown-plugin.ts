/**
 * Markdown-it plugin for accessible rendering.
 *
 * Extends VS Code's built-in markdown preview with screen-reader-friendly
 * annotations. Code fences get ARIA regions, headings get sr-only prefixes,
 * tables get structural roles.
 *
 * Registered via "markdown.markdownItPlugins": true in package.json.
 * VS Code calls extendMarkdownIt() from our activate() return value.
 */

interface MarkdownIt {
  renderer: {
    rules: Record<string, RendererRule | undefined>;
  };
}

type RendererRule = (
  tokens: MarkdownItToken[],
  idx: number,
  options: unknown,
  env: unknown,
  self: MarkdownItRenderer
) => string;

interface MarkdownItToken {
  type: string;
  tag: string;
  info: string;
  content: string;
  children?: MarkdownItToken[] | null;
  nesting: number;
  markup: string;
}

interface MarkdownItRenderer {
  renderToken(tokens: MarkdownItToken[], idx: number, options: unknown): string;
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Extend markdown-it with accessible rendering rules.
 * Called by VS Code when rendering markdown preview.
 */
export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  // --- Code fences: wrap with ARIA region + sr-only labels ---
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const lang = token.info.trim().split(/\s+/)[0] || "";
    const langLabel = lang ? capitalizeFirst(lang) : "Code";

    const original = defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : `<pre><code>${escapeHtml(token.content)}</code></pre>`;

    return (
      `<div role="region" aria-label="${langLabel} code block">` +
      `<span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">[${langLabel}]</span>` +
      original +
      `<span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">[End ${langLabel}]</span>` +
      `</div>`
    );
  };

  // --- Headings: add sr-only structural prefix ---
  const defaultHeadingOpen = md.renderer.rules.heading_open;

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const level = parseInt(token.tag.slice(1), 10);
    const label = level <= 2 ? "Heading" : "Subheading";

    const original = defaultHeadingOpen
      ? defaultHeadingOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);

    return (
      `<span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">[${label}] </span>` +
      original
    );
  };

  // --- Thematic break: announce as separator ---
  const defaultHr = md.renderer.rules.hr;

  md.renderer.rules.hr = (tokens, idx, options, env, self) => {
    const original = defaultHr
      ? defaultHr(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);

    return (
      `<span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">[Separator]</span>` +
      original
    );
  };

  return md;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
