# Scripture references in transcripts

BIBLE annotations (the transcript's verse links, the media page's Scripture
index, the `bibleRefs`/`bibleBooks` search facets, MCP `scriptureRefs`, and
lets.bible's "sermons on this verse") come from layers merged in
`packages/temporal/src/util/scripture/`:

| Layer | Finds | Module |
| --- | --- | --- |
| Explicit | Spoken citations: "Romans 8:28", "Second Timothy 1 .5", "Jude, verse three", "2 Timothy 3, 14 through 17", "the book of Jude" | `explicit.ts` |
| Implied | Book-implied mentions: "in verse 17", "verses 18 and 19", "chapter 4, verses 1 through 13", "10 .19", resolved against the passage just cited or the sermon's primary passage (from its title/description) | `implied.ts` |
| Quote | Uncited quotations, matched against KJV/WEB/BSB verse text | `quotes.ts` |
| LLM | The annotate prompt's `#bible` links — the only source of allusions | `annotate-transcript.ts` |
| Versification | Pins single-chapter books to chapter 1 (`{Jude, verse 3}` → Jude 1:3) and drops chapters/verses that don't exist | `versification.ts`, `books.ts` |

`augmentBibleAnnotations` runs every layer and merges overlapping candidates:
compatible references (same passage, or one inside the other) fold into the
most specific one; conflicting ones go to the higher layer — explicit, then
LLM, then implied, then quote. Both `runAnnotation` (production) and
`runAnnotationEdits` (eval-only) apply it, so admin evals score the same merged
output production writes — except that the web bundle doesn't ship the verse
text, so evals run there skip the quote layer (see below).

Every reader that parses stored metadata also normalizes single-chapter books
(`normalizeSingleChapterRef`), so rows written before this pipeline still link,
label and index correctly.

## Verse text

`packages/temporal/src/util/scripture/data/verse-text.tsv.gz` (one line per
verse: OSIS ref, KJV, WEB, BSB — all public domain) is exported from the seeded
lets.bible database. Regenerate after re-seeding a translation:

```
just lb-export-verse-text
```

If the file is missing at runtime (e.g. a bundle that didn't ship it), quote
matching logs a warning and is skipped; the other layers still run.

## Measuring

`just eval-scripture-refs` scores the stored production LLM annotations, each
deterministic layer, and the merged pipeline against a hand-labeled gold set
(`seed-data/eval/scripture-refs-20261027`: 12 recent sermons, 1,021 mentions
typed explicit / implied / quote / allusion). No LLM calls. Per-sermon misses
and false positives land in the corpus's `results.json`.

A mention counts as found when an annotation covers at least half of the
shorter span with a compatible reference. Baseline on 2026-10-27:

| | Stored LLM | Pipeline |
| --- | --- | --- |
| Explicit (235) | 71.9% | 95.7% |
| Implied (116) | 38.8% | 80.2% |
| Quote (449) | 41.4% | 72.6% |
| Allusion (221) | 10.4% | 12.7% |
| All (1,021) | 41.4% | 65.8% |
| Precision | 92.7% | 91.4% |

The quote thresholds (`MIN_INFORMATION`, `MIN_DENSITY`, …) and the implied
windows (`IMMEDIATE_WORDS`, `RECENT_WORDS`) were tuned on this set; with 12
sermons, treat small moves as noise and re-check misses/false positives by hand
before changing them. Allusions remain the LLM's job.

## Backfilling existing uploads

```
just backfill-scripture-refs
```

Starts `backfillScriptureRefsWorkflow`: for every transcribed upload it treats
the stored BIBLE annotations as the LLM layer (no LLM calls), merges in the
deterministic layers, replaces the rows if anything changed, and reindexes that
upload (warm — window embeddings are cached). It is idempotent; a second run
changes nothing. Progress: the `getBackfillScriptureRefsProgress` query.

It holds the same per-upload advisory lock as the annotate activity
(`lockUploadAnnotations`), so a concurrent re-annotate can't interleave with it.
Rows no LLM link contributed to carry `metadata.source: "detected"`; later runs
drop and re-derive them rather than treating them as LLM output, so a rule
tightened afterwards also removes references an earlier run wrote.
