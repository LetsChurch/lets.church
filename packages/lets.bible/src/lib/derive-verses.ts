import type { Block, Run } from '@/components/passage/types';

// Reconstruct a chapter's per-verse plain text from its block runs. The reading
// asset ships WITHOUT the full `verses` map (it duplicates the entire text);
// instead it carries only the handful of verses where this reconstruction
// disagrees with the authoritative build-time text (boundary cases where a run's
// verse attribution differs), and the client merges those over the derived map.
//
// A verse's segments can span blocks (prose, poetry lines, focus verse); we
// concatenate each segment's runs, join segments with a space, and normalize
// whitespace — matching the parser's per-verse accumulation (usx/parse.ts).
export function deriveVerses(blocks: Block[]): Record<string, string> {
  const segs = new Map<number, string[]>();
  const add = (v: { verse?: number; num?: number; runs: Run[] }) => {
    const n = v.verse ?? v.num;
    if (n == null) return;
    const text = v.runs.map((r) => r.text).join('');
    const list = segs.get(n);
    if (list) list.push(text);
    else segs.set(n, [text]);
  };
  for (const b of blocks) {
    if (b.kind === 'prose' || b.kind === 'descriptive') b.verses.forEach(add);
    else if (b.kind === 'poetry') b.lines.forEach(add);
    else if (b.kind === 'focusVerse') add(b.verse);
  }
  const out: Record<string, string> = {};
  for (const [n, parts] of segs) {
    out[String(n)] = parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  return out;
}
