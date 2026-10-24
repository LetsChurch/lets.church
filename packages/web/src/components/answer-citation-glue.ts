// Keeps inline citation badges on the same line as the word they cite.
//
// A badge is an atomic inline (inline-flex), and browsers always allow a line
// break around one — even with no whitespace, and even across U+2060 WORD
// JOINER — so a long paragraph can strand a lone "[1]" on its own line. Text
// tricks can't fix that; the only reliable glue is a `white-space: nowrap`
// wrapper. This rehype plugin wraps each run of citation anchors together with
// the word before it (and any punctuation directly after it) in such a span.

// Minimal hast shapes — only what this plugin touches.
type HastText = { type: 'text'; value: string };
type HastElement = {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
};
type HastNode =
  | HastText
  | HastElement
  | { type: string; children?: HastNode[] };

const CITATION_HREF = /^#lc-cite-\d+$/;

function isCitation(node: HastNode | undefined): node is HastElement {
  if (node?.type !== 'element') return false;
  const el = node as HastElement;
  const href = el.properties?.href;
  return (
    el.tagName === 'a' && typeof href === 'string' && CITATION_HREF.test(href)
  );
}

function isText(node: HastNode | undefined): node is HastText {
  return node?.type === 'text';
}

function text(value: string): HastText {
  return { type: 'text', value };
}

function glue(children: HastNode[]): HastNode[] {
  const out: HastNode[] = [];
  let i = 0;
  while (i < children.length) {
    if (!isCitation(children[i])) {
      out.push(children[i]);
      i += 1;
      continue;
    }

    // Collect the run of badges ([1][2] or [1] [2]), skipping whitespace
    // between them — the badge's own margin spaces them.
    const run: HastNode[] = [];
    while (i < children.length) {
      const node = children[i];
      if (isCitation(node)) {
        run.push(node);
        i += 1;
      } else if (
        isText(node) &&
        node.value.trim() === '' &&
        isCitation(children[i + 1])
      ) {
        i += 1;
      } else break;
    }

    // Pull the preceding word (or inline element, e.g. **bold** / `code`) into
    // the wrapper, dropping the whitespace between it and the badge.
    const lead: HastNode[] = [];
    let prev = out.at(-1);
    if (isText(prev) && prev.value.trim() === '') {
      out.pop();
      prev = out.at(-1);
    }
    if (isText(prev)) {
      const trimmed = prev.value.replace(/\s+$/, '');
      const word = trimmed.match(/\S+$/)?.[0] ?? '';
      out.pop();
      const rest = trimmed.slice(0, trimmed.length - word.length);
      if (rest) out.push(text(rest));
      if (word) lead.push(text(word));
    } else if (prev?.type === 'element') {
      out.pop();
      lead.push(prev);
    }

    // And trailing punctuation ("…last [1].") so it can't dangle either.
    const tail: HastNode[] = [];
    const next = children[i];
    if (isText(next)) {
      const punct = next.value.match(/^[^\s\w]+/)?.[0];
      if (punct) {
        tail.push(text(punct));
        const rest = next.value.slice(punct.length);
        if (rest) children[i] = text(rest);
        else i += 1;
      }
    }

    out.push({
      type: 'element',
      tagName: 'span',
      properties: { className: ['whitespace-nowrap'] },
      children: [...lead, ...run, ...tail],
    });
  }
  return out;
}

function walk(node: HastNode) {
  if (!('children' in node) || !node.children) return;
  for (const child of node.children) walk(child);
  if (node.children.some(isCitation)) node.children = glue(node.children);
}

export function rehypeGlueCitations() {
  return (tree: HastNode) => walk(tree);
}
