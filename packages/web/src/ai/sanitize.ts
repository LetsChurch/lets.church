// Defensive normalization for untrusted, attacker-influenceable text that
// flows into the agent's context (transcript passages, titles, channel names
// from user-uploaded media). This does NOT make the text "safe to obey" — the
// agent is instructed to treat all tool output as data, never instructions —
// but it bounds two concrete abuses:
//   - control characters / zero-width tricks used to confuse the model or hide
//     injected directives, and
//   - context-flooding: an attacker stuffing a huge instruction block into a
//     paragraph to dominate the prompt. Capping length blunts that.

// Strip C0 control chars (except tab/newline/carriage-return), DEL, and
// zero-width / BOM characters used to smuggle hidden text. Done by code point
// so we don't put control characters into a regex literal.
function stripHidden(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue;
    if (c === 0x7f) continue;
    if (c === 0x200b || c === 0x200c || c === 0x200d || c === 0xfeff) continue;
    out += ch;
  }
  return out;
}

export function sanitizeSourceText(text: string, maxLen = 1200): string {
  const stripped = stripHidden(text)
    .replace(/[ \t]{3,}/g, '  ')
    .trim();
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen)}…` : stripped;
}
