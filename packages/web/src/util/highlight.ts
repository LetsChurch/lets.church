// OpenSearch emits a separate <mark> per matched token, so a multi-word match
// returns as adjacent marks ("<mark>total</mark> <mark>depravity</mark>"). When
// the marks are styled with a translucent background and negative margins (so
// the highlight bleeds past the text), adjacent backgrounds overlap and double
// up into dark seams. Merge marks separated only by whitespace (or nothing) into
// one so the highlight reads as a single phrase. Marks split by other characters
// (e.g. "<mark>foo</mark>, <mark>bar</mark>") are left as separate highlights.
export function joinAdjacentMarks(html: string): string {
  return html.replace(/<\/mark>(\s*)<mark>/g, '$1');
}
