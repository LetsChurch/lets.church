# lets.bible — End-to-End Testing Guide

Thorough manual/automated E2E test plan for the lets.bible app (`packages/lets.bible`):
the scripture reader, translations, reading preferences, verse + word study,
search (autocomplete + results), the homepage, and OIDC sign-in.

Tests are written so they can be executed by hand in a browser or scripted with
Playwright. Each case lists **Preconditions → Steps → Expected**. IDs are stable
(`LB-<area>-<n>`) so results can be tracked across runs.

---

## 1. Scope

In scope (everything implemented to date):

- Reading: full BSB + MSB text, all USX genres, footnotes, cross-references.
- Chapter navigation: on desktop/tablet, large plain prev/next chevron arrows fixed
  to the viewport center flank the column (reading + interlinear, subtle hover); on
  mobile those are hidden in favor of a **horizontal swipe gesture** (swipe left →
  next, right → prev). A bottom prev/next nav (chevron + chapter name) shows on all
  viewports. All paths preserve the interlinear view and cross book boundaries via
  `adjacentChapter`.
- **King James Version (KJV)** — a third translation (1769, with per-word Strong's
  numbers + Tense/Voice/Mood morphology), sourced from the public-domain e-Sword
  "KJV+" module (`seed/kjv/kjv_strongs.json`, committed) and ingested by
  `seed-kjv.ts` via `src/server/kjv-strongs/parse.ts`. It populates the same
  layers as BSB/MSB (`bible_book` reading blocks, `bible_verse`, `bible_token`
  with Strong's **and** `morph`), so reading, the translation picker, word study,
  interlinear (reading-order layer), Compare, and search all work for it. Because
  the source carries **no paragraphing, poetry, or headings markup**, KJV renders
  as **prose only** (one prose block per chapter) and has **no `bible_cross_reference`
  rows** in its source. **Source-text overlays (divine name, OT quotation,
  divine-name notes) are applied at RENDER time** from a single translation-
  independent index, not baked — so KJV gets them like BSB/MSB, and its OT-quote
  coverage is now **complete** (anchored by Strong's, no longer limited by surface
  alignment). See **Source-text overlay index** below. **Red-letter (words of
  Jesus) IS baked** in `parseVerse`, projected from MSB's `wj` (the overlay index
  doesn't carry it) via Strong's-sequence alignment; ~40.9k tokens, 2,050 verses.
  MSB (Byzantine/Majority) is the reference rather than BSB (critical) because it's
  textually closest to the TR-based KJV — it recovers Byzantine/Majority readings
  the KJV shares but the critical text omits (Luke 4:8 "Get thee behind me, Satan";
  the John 7:53–8:11 pericope).
  **Cross-references are also projected** from MSB (the KJV+ source has none), so the
  OT-quotation source link and the cross-reference feature work like BSB/MSB. KJV
  uses its own **1769 versification**
  (`versification = 'kjv'`), which differs from BSB/MSB's `org` scheme in a few
  places (Psalm titles counted in v1, 3 John length, Joel/Malachi chapter splits),
  so ref-anchored cross-translation features (Compare, highlights, notes) can
  diverge from BSB/MSB at exactly those verses.
- **World English Bible (WEB)** — a fourth translation (public domain, trademark
  eBible.org). Sourced from eBible.org's WEB **USFM** and converted to USX 3.0 by
  `scripts/web/build-web-usx.ts` (committed output under `seed/web/USX_1`,
  regenerated via `just lb-build-web-usx`), then ingested by the shared
  `seed-bible.ts` (`just lb-seed-web`). WEB keeps its **paragraphing,
  poetry, headings, translator footnotes, and red-letter** (words of Jesus), uses
  `org` versification, and projects **cross-references from MSB** (like KJV). It is
  the first translation with **no per-word Strong's**: eBible's `\w …strong="…"`
  tags are badly misaligned (Gen 1:1 "earth"→H8064 *heavens*; John 3:16 "loved"
  untagged), so they are **stripped on conversion** — WEB has **no `bible_token`
  rows**, hence **no English word study and no "English (reverse)" interlinear**.
  WEB still gets the **Original-language interlinear** (Greek/Hebrew) from the
  shared STEPBible source tokens (`bible_source_token`; NT seeded under WEB with
  the **Byzantine/Majority** basis — the WEB NT's Greek text — OT Hebrew falls back
  to the default translation). So reading, search, Compare, footnotes, red-letter,
  cross-references, and the original-language interlinear all work; only the
  English token layer is absent.
- **Per-translation attribution.** `bible_translation` carries `attribution` +
  `attribution_url` (courtesy/copyright line). It is shown in the **version picker**
  (a muted line under each translation's name), at the **bottom of the reader**
  (a small line, linked to the source), and on **`/about`** (a Translations list).
  All four current texts are public domain.
- Verse deep links (`?v=`): scroll the referenced verse to the center of the
  viewport and flash a transient highlight that fades out — without selecting it
  or opening the study panel.
- Translations + switcher.
- Reading preferences (translation, red letter, verse numbers, text size, divine
  name rendering, source-text overlays).
- A single contextual **study panel**, built on the dedicated **Base UI Drawer** (`@base-ui/react`):
  a non-shifting overlay rail fixed under the header on desktop (non-modal, so the
  reading stays put and clicking another verse just updates it), a modal bottom
  sheet on mobile. It overlays the page, so the reading column never shifts when
  it opens/closes (the column stays centered in the viewport). Verse and word
  selection are mutually exclusive; the panel renders the matching view:
  - verse view: a **Base UI tabbed interface** with three tabs — **Verse**,
    **Commentaries**, and **Media** (see below). The **Verse** tab holds the verse text (each
    Strong's-tagged word is clickable into its word study, like the reading text)
    + actions (highlight, note, copy, share, compare, "study a word") + the
    verse's **annotations** (footnotes with their reading letters,
    cross-references, source-text overlay entries). The highlight palette has 6
    colors (gold, sage, slate, rose, sky, plum). A highlighted verse that is also
    selected shows both — the color fill plus a gold underline for the selection.
    The active tab persists for the session (clicking another verse keeps the tab).
  - word view: Greek/Hebrew lexicon + concordance + source-text sections, with
    the verse it came from shown as context (click to return to the verse view).
  A word is studied with two clicks (desktop) or a press-and-hold (touch) — there
  is no double-click gesture; the word-hover affordance shows only when a click
  would actually study the word (verse already selected / panel open).
- **Verse commentaries** (study panel, **Commentaries** tab). Public-domain
  Reformer/Puritan commentaries — **Calvin, Matthew Henry (Complete + Concise),
  Geneva Bible Notes, Wesley** — extracted from CrossWire SWORD modules
  (`scripts/sword/`) into committed artifacts (`seed/commentaries/*.json`), seeded
  into `bible_commentary[_work]`. The tab is a **master/detail navigator**: a list
  of the works that comment on the current verse (name + author · year + a 1-line
  preview, ordered by work ordinal); picking one opens its note (**detail**) with a
  **‹ All commentaries** back link, the work's Source link, and the paragraphed
  body. **Following a work persists for the
  session** (`src/lib/study-session.ts`): clicking from one verse to the next keeps
  you on the Commentaries tab reading the same commentator, showing its note for the
  new verse — or **"{author} has no note on {ref}"** when that work doesn't cover it.
  Fetched **on demand per selected verse** (`bible.verseCommentaries`; the work list
  comes from `bible.commentaryWorks`), not prefetched per chapter (bodies are large).
  Commentaries are **translation-agnostic** (anchored to the canonical
  book/chapter/verse, KJV versification), so the same notes show under BSB/MSB/KJV.
  Each entry covers from its verse **until the next entry** (`verse_end`): per-verse
  works (Calvin/Geneva/Wesley) usually key the exact verse; section works (Matthew
  Henry) key the opening verse of a passage and show on every verse it spans, with an
  **"on vv. X–Y"** range label. Bodies are plain text with blank-line paragraphs;
  **scripture references inside a commentary render as reader links** (OSIS `osisRef`
  for Calvin/MHC/MHCC, parsed inner text for Geneva/Wesley; unresolvable refs stay
  plain text). **Commentaries can be downloaded per commentator for offline use**
  — from the Library page **or** the study panel's Commentaries tab (a per-work
  download icon, in sync with the Library) — stored in IndexedDB; the study panel
  falls back to the downloaded copy when offline. Online is unchanged (server-fetched).
- **Related media** (study panel, **Media** tab). Media from the **lets.church**
  catalog whose transcript teaches the selected verse — surfaced as thumbnailed
  cards (title, channel, view count, duration), **ranked by view count + recency**,
  each deep-linked to the **timestamp** where the verse is discussed
  (`/media/<id>#t=<seconds>`). A **"Search {ref} on lets.church →"** link opens the
  full faceted search for that verse (`/search?bibleRefs=<OSIS token>`). lets.bible
  can't read web's Postgres (view counts, imgproxy thumbnails, annotation
  timestamps), so `bible.relatedMedia` **proxies server-to-server** to web's
  internal endpoint (`/api/internal/media-for-verse`, shared-secret bearer);
  membership + access control come from the `lc_media_v1` `bibleRefs` facet.
  Fetched **on demand** when the Media tab is opened (the Base UI panel unmounts
  inactive tabs); a network/API failure or an env-unconfigured deployment degrades
  to the empty state (never crashes the reader). Verse-scoped, translation-agnostic.
- Source-text overlays: dotted underline + tooltip on the divine name,
  Hallelujah, and OT quotations (the OT-quotation tooltip links to the source
  passage); divine-name rendering (LORD/YHWH/Yahweh). Quotation poetry blocks are
  verse-selectable and their words are studyable. The **OT-quotation underline is
  one continuous span** per rendered line (a single wrapper draws the decoration,
  not a dotted line per word) covering the full quote — first to last anchored
  Strong's word, including supplied/connective words in between.
- **Source-text overlay index (render-time, all translations).** The divine name /
  OT quotation / divine-name notes are **not baked** into any translation. A single
  translation-independent index (`seed/overlays/index.json`, published to
  `public/overlays/index.json` by `build-flex-index.ts`) anchors each annotation by
  **(Strong's number, ordinal)** — the n-th occurrence of that Strong's in the
  verse — which resolves to the right word in any Strong's-tagged translation. It is
  applied at read time: the reader's chapter loader applies it to the rendered runs
  (`src/lib/apply-overlays.ts`, covering the reading view + study panel), and the
  `bible.tokens` / `bible.interlinear` tRPC procedures apply it server-side to the
  overlay-pure `bible_token` rows (`src/server/overlays/apply-tokens.ts`) so the
  interlinear's study panel gets them too. `index.json` is the **authoritative,
  self-contained committed source** — there is no generator with external inputs
  (OT quotations + notes are editorial and can't be derived from the overlay-pure
  seed); ~6.7k divine-name, ~4.1k OT-quote tokens, ~100 notes.
- **Cross-references (committed artifact, DB-seeded).** The same overlay strip also
  removed the USX `<note style="x">` cross-references, so they're committed in
  `seed/overlays/cross-references.json` (BSB 514 / MSB 516, extracted from the baked
  USX) and seeded into `bible_cross_reference` — by `seed-bible`/`seed-kjv` on a full
  seed, or the narrow `just lb-seed-crossrefs` backfill. KJV (no markup of
  its own) projects MSB's set. These power the **OT-quotation hover-card source
  link** (e.g. John 1:23 → "Quoting Isaiah 40:3" → `/bible/isaiah/40?v=3`) and the
  study panel's cross-references, via the `bible.chapterCrossReferences` tRPC.
- Interlinear reading mode (`?view=interlinear`): two layers behind one
  Word-order toggle. **Original** = a TRUE morphological interlinear — the
  original-language words in ORIGINAL Greek/Hebrew order (from STEPBible
  TAGNT/TAHOT via `bible.sourceInterlinear`), each stacked as inflected
  surface / transliteration / contextual English / Strong's / parsing; the
  **Parsing** line decodes the morphology (e.g. `V-AAI-3S` → "Verb · Aorist
  Active Indicative · 3rd person · Singular"). **English (reverse)** = the
  reading-order layer (`bible.interlinear`, English order with dictionary
  lemmas). Per-translation textual basis (BSB → critical/NA, MSB/WEB →
  Byzantine/Majority, KJV → Textus Receptus — so the KJV interlinear carries
  TR-only readings the critical text omits, e.g. the Comma Johanneum at 1 John
  5:7); the shared Masoretic OT Hebrew flows right-to-left. The whole Bible is
  seeded (provision + `lb-up`), so the fall-back to the reading-order layer (with
  the Parsing chip inert) only applies before source tokens exist. When a
  translation has ONLY the original view (no per-word Strong's, e.g. WEB) the
  Word-order toggle is hidden entirely. The original-language line is always
  shown (it isn't a toggle). Tapping a word opens the study panel (which
  shows the decoded parsing). Each verse is a row with the
  verse number in a fixed left gutter; the serif "Chapter N" title is omitted
  (the header + controls bar give context). (Suite R.)
- Search: live typed autocomplete powered **client-side by FlexSearch** (no
  debounce) — an interactive book-jump widget (book → chapter → verse), exact
  phrase, re-ranked verse matches, topics & recent, with a per-translation scope
  dropdown — plus a results page (reference, full-text, cross-refs, related
  passages) still backed by Elasticsearch. Both re-ranks fold in a **verse
  popularity** signal (Common Crawl appearance counts, `seed/popularity.json`) as
  a bounded tie-breaker so a more-quoted verse edges out an equally-good text
  match — a `rank_feature` boost server-side, a log term in the FlexSearch
  `score()` client-side.
- Compare translations: side-by-side verse-aligned view (`/compare/$book/$chapter`),
  launched from the **version picker** (a Compare button on each non-current
  translation row) and from the study panel's verse view.
- The version picker (reader header) also launches **interlinear** per
  translation: every row with word tokens has an "Aα" interlinear button; the
  reader header no longer has standalone Compare / interlinear buttons.
- User library (server-canonical, local-first offline overlay): highlights,
  notes, reading position are stored **server-side** (the source of truth) for
  signed-in users — the reader's loader fetches the chapter's marks
  (`library.chapterMarks`) and returns them in the SSR payload, so they render in
  the server HTML (no flash, cross-device). The TanStack DB + localStorage store
  is an optimistic + offline overlay (works offline and for guests), syncing to
  the server, with a merge-on-sign-in prompt. On sign-in the full library is
  pulled into local storage (all highlights + notes, not lazy per-chapter); on
  **sign-out all on-device data is wiped** (so an account's library can't leak to
  the next user on a shared device). Anonymous users are local-only. Highlights
  render as a translucent fill in light mode and a **text-color tint in dark
  mode**. Powers real "Continue reading" / "Recent" on the homepage and Library.
- Offline: reading content + the search index are **static assets** (built from
  USX into `/reading/` and `/search/`, shipped in the image) that a **service
  worker** (`public/sw.js`) caches cache-first; an **idle auto-precache** pulls
  the whole active translation so the entire Bible + search work offline with
  **no download button**. The SW also caches the app shell, assets, fonts, and
  tRPC query GETs. Notes/highlights/prefs are local-first. Installable PWA
  (`manifest.webmanifest`); the SW is dev-aware (network-first in dev so HMR is
  never served stale; cache-first content in prod).
- Forms built on TanStack Form (the verse note editor) with validation.
- Homepage (signed-out + returning) and the OIDC sign-in/out flow.
- Mobile responsiveness: below `lg` the study panel and the book/chapter/
  translation pickers become **Base UI Drawer** bottom-sheet drawers; words are
  studied with a press-and-hold; headers, the compare grid, and the homepage
  collapse to fit a phone. (Suite Q.)
- Cross-cutting: SSR/hydration, anonymous vs signed-in, accessibility, responsive.

**Known mocked / not-yet-implemented** (do NOT file as bugs — see §18):
the toolbar "Listen" is not built; homepage "Today's plan" card,
standalone `/listen` page, and word pronunciation audio are placeholders. (The
`/listen` page's promise — sermons connected to the passages they teach — is now
delivered inside the study panel's **Media** tab; the dedicated page itself is
still a placeholder.) "Related passages" is lexical (`more_like_this`), not
vector embeddings.

---

## 2. Environment & prerequisites

### 2.1 Services

| Service | URL (dev) | Notes |
| --- | --- | --- |
| lets.bible | http://localhost:4001 | the app under test |
| web (OIDC IdP) | http://localhost:4000 | identity provider for sign-in |
| postgres | localhost:5432 | `letsbible` DB (separate from web's `letschurch`) |
| elasticsearch | localhost:${HOST_ES_PORT} | shared cluster; lets.bible owns `lets_bible_*` indices |

> **Media tab prerequisite:** the study panel's Media tab (Suite E) calls web's
> internal `/api/internal/media-for-verse` server-to-server. It needs the **web**
> app's `lc_media_v1` index populated with public/approved uploads that
> BIBLE-annotate at least one verse, and the shared `INTERNAL_API_TOKEN` set on
> **both** `web` and `letsbible` (with `WEB_INTERNAL_URL` on `letsbible`, default
> `http://web:3000`). Both come from `.envrc`/docker-compose defaults; when unset
> the tab degrades to its empty state (not a bug).

> The Bash shell used for `docker compose` must have direnv loaded first:
> `eval "$(direnv export bash)"`. Otherwise the container is recreated with blank
> env (random port, broken OIDC). See `project_container_add_dep_workflow`.

### 2.2 One-time data setup

`just up` starts the stack and sets up **both** web and lets.bible — it runs
`lb-up`, which migrates + pushes ES mappings + seeds (BSB, MSB, KJV,
lexicon, cross-references, commentaries) + indexes. (Requires the enhanced USX seed under
`packages/lets.bible/seed/{bsb,msb}/USX_1` and the committed KJV source under
`packages/lets.bible/seed/kjv/kjv_strongs.json`.)

```
just up                     # stack + web DB/seed + full lets.bible setup
```

To re-run a single lets.bible step against a running stack:

```
just lb-migrate        # lets.bible schema (incl. oidc_session.id_token)
just lb-es-push        # create lets_bible_verses_v2 mappings (incl. `popularity` rank_feature)
just lb-seed-bsb       # BSB (default) — 66 books / 31,086 verses
just lb-seed-msb       # MSB (second translation) — 31,100 verses
just lb-seed-kjv       # KJV (1769, Strong's + morphology) — 31,102 verses / 790,868 tokens
just lb-build-web-usx  # HOST-only: download eBible WEB USFM → convert to seed/web/USX_1 (committed; only needed to regenerate)
just lb-seed-web       # WEB (World English Bible, public domain) — 31,101 verses / 0 tokens (Strong's stripped)
just lb-seed-crossrefs # backfill bible_cross_reference from the committed artifact (BSB 514 / MSB 516 / KJV 516 / WEB 516)
just lb-seed-commentaries # load bible_commentary[_work] from committed seed/commentaries/*.json (Calvin/MHC/MHCC/Geneva/Wesley — ~52k entries)
just lb-seed-lexicon   # 14,197 Greek+Hebrew Strong's entries
just lb-seed-source NT BSB   # true interlinear: BSB NT Greek (STEPBible TAGNT, critical/NA)
just lb-seed-source OT BSB   # BSB OT Hebrew (STEPBible TAHOT, Masoretic) — MSB/WEB OT fall back to this
just lb-seed-source NT MSB   # MSB NT Greek (Byzantine/Majority)
just lb-seed-source NT WEB   # WEB NT Greek (Byzantine/Majority — the WEB NT's text basis)
just lb-seed-source NT KJV   # KJV NT Greek (STEPBible TAGNT, Textus Receptus — TR-only readings incl. the Comma Johanneum)
# `just lb-up` runs the whole set (BSB ALL + KJV/MSB/WEB NT); prod provision seeds the same.
just lb-index          # index 124,389 verses into ES v2 (BSB + MSB + KJV + WEB) with popularity from seed/popularity.json
just lb-flex           # build client FlexSearch + reading assets + overlay index → public/{search,reading,overlays}/* (incl. KJV + WEB)
just lb-up             # all of the above, in order
```

> **Autocomplete prerequisite:** the client autocomplete + book-jump widget read
> `packages/lets.bible/public/search/{<id>.index.json,<id>.verses.json,structure.json}`
> (git-ignored). These are built from the **committed USX seed** (no DB) by
> `build-flex-index.ts`: in **production** `pnpm build` runs it before `vite build`
> so they ship in the image automatically; for **dev** (which runs `vite dev`, not
> a build) generate them with `just lb-flex`. Without them, focus/typing
> logs a fetch failure and the widget's verse grids/results stay empty. Re-run
> `lb-flex` for dev after changing the USX seed.

### 2.3 Data integrity preflight (run before a full pass)

| Check | Command | Expected |
| --- | --- | --- |
| Translations | `psql letsbible -c "select id,is_default,attribution from bible_translation"` | BSB (default=t), KJV (f), MSB (f), WEB (f); each has a non-null `attribution` (all public domain) |
| Verses | `select count(*) from bible_verse` | 124,389 (31,086 BSB + 31,100 MSB + 31,102 KJV + 31,101 WEB) |
| KJV tokens | `select count(*) from bible_token where translation_id='KJV'` | 790,868 (347,261 with a Strong's number) |
| WEB tokens | `select count(*) from bible_token where translation_id='WEB'` | 0 (Strong's stripped on conversion — WEB has no English word layer) |
| KJV red-letter | `select count(distinct (chapter,verse)) from bible_token where translation_id='KJV' and words_of_jesus` | 2,050 verses (~41,412 tokens; projected from MSB's 2,056) |
| Lexemes | `select count(*) from bible_lexeme` | 14,197 |
| Cross-refs | `select count(*) from bible_cross_reference` | ~2,062 (BSB + MSB + 516 KJV + 516 WEB, both projected from MSB) |
| WEB source tokens | `select language,count(*) from bible_source_token where translation_id='WEB' group by language` | greek (whole NT, Byzantine) seeded; hebrew via OT fallback to the default translation |
| KJV source tokens (Textus Receptus) | `select count(*) from bible_source_token where translation_id='KJV' and book='1JN' and chapter=5 and verse=7` | > 5 (the Comma Johanneum is present — TR-only, absent from the BSB/critical set) |
| Commentary works | `select count(*) from bible_commentary_work` | 5 (calvin, mhc, mhcc, geneva, wesley) |
| Commentary entries | `select count(*) from bible_commentary` | ~52,125 (calvin 11,063 / mhc 5,360 / mhcc 4,059 / geneva 14,713 / wesley 16,930) |
| ES docs | `GET lets_bible_verses_v2/_count` | 124,389 |

### 2.4 Test accounts & inputs

- Sign-in user (seeded in the web IdP): **`admin` / `password`** (dev Turnstile
  uses Cloudflare test keys that always pass).
- Sample references: `John 3:16`, `Matthew 1:23` (has a cross-reference),
  `Genesis 1:1` (Hebrew), `Psalm 23`, `Romans 8`.
- Sample phrases: `fruit of the Spirit`, `love your enemies`, `do not be anxious`.

### 2.5 Cookies (for inspection / negative tests)

| Cookie | Host | Purpose | Flags |
| --- | --- | --- | --- |
| `sid` | lets.bible | opaque session id | HttpOnly, SameSite=Lax, Secure (prod) |
| `lb_oidc_state` | lets.bible | in-flight login CSRF binding | HttpOnly, Lax, 10-min |
| `lb-prefs` | lets.bible | anonymous reading prefs | — |
| `lc-session` | web | IdP SSO session (JWT-wrapped id) | HttpOnly, Lax, Secure (prod) |

---

## 3. Conventions

- **Dev is client-rendered**: `curl` of a route returns only the shell. Verify
  rendered content in a real browser / Playwright, not via `curl` body.
- After editing routes or server code, restart the container
  (`docker compose restart letsbible`) so the route tree / server bundle reloads.
- Selectors that are stable for automation: word runs carry `data-strong`;
  the selected verse carries `data-verse-selected="true"`; the search input has
  `placeholder^="Search a reference"`.
- A case **passes** only if every Expected bullet holds.

### Automated coverage (Playwright)

A Playwright suite lives in `packages/lets.bible/e2e/` (config:
`playwright.config.ts`). It runs against the **already-running** dev server
(`http://localhost:4001`; override with `LETS_BIBLE_E2E_URL`) — it does not start
its own server, so the dev stack must be up with the Bible/lexicon seeded and the
search index built. Run from `packages/lets.bible`:

```
pnpm exec playwright install chromium   # first time
pnpm run test:e2e                        # or test:e2e:ui
```

Each test gets a fresh browser context (empty localStorage/IndexedDB), so the
local-first cases start clean. Automated cases are tagged **[E2E: file]** next to
their ID below; everything else is manual. Keep these in sync (see CLAUDE.md):
adding/changing a spec must update the matching case here.

Currently automated: LB-SMOKE-01/02/03/05 (`smoke`), LB-READ-01/07/08/11/12
(`reading`), LB-SR-01/02 + LB-AC (`search`), LB-VS-07 + LB-WS-01/02/12/13
+ LB-VS-08 (`study`), LB-OV-01 + LB-OV-13/14 + divine-name-Yahweh (`overlays`),
LB-LIB-05/06/10/11/12/13/14/15 + LB-FORM (`library-local`), LB-CMP-01..04 (`compare`), LB-MOB-01..12 (`mobile`),
LB-IL-01..05/09/10 (`interlinear`), LB-CM-01..05/07/11 + LB-OFF-CM-01 (`commentaries`), LB-HOME-03 (`home`).

---

## 4. Suite A — Smoke / health

| ID | Steps | Expected |
| --- | --- | --- |
| LB-SMOKE-01 [E2E: smoke] | GET `/` | 200; homepage renders (wordmark, search box, footer). |
| LB-SMOKE-02 [E2E: smoke] | GET `/bible/john/1` | 200; John 1 renders. |
| LB-SMOKE-03 [E2E: smoke] | GET `/bible` | 302 → `/bible/john/1` (default passage). |
| LB-SMOKE-04 | GET `/bible/john/999` and `/bible/notabook/1` | Not-found handling (no crash). |
| LB-SMOKE-05 [E2E: smoke] | Open browser console on `/` and `/bible/john/1` | No React hydration mismatch errors, no uncaught errors. |

---

## 5. Suite B — Reading experience

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-READ-01 [E2E: reading] | — | Open `/bible/john/1` | Book eyebrow "John", "Chapter 1" heading; verse 1 begins "In the beginning was the Word…". Verse numbers superscript. |
| LB-READ-02 | — | Open `/bible/psalm/23` | Poetry rendered as indented stanzas (not prose paragraphs); line breaks preserved. |
| LB-READ-03 | — | Open `/bible/psalm/119` | Acrostic letter headers render; descriptive/superscription (if present) shown in muted italic. |
| LB-READ-04 | — | Open a chapter with translator notes (e.g. `/bible/john/1`); hover a footnote marker | Footnote markers appear as **superscript sequential letters** (a, b, c, … per chapter, gold italic — print-Bible style, not a bare `*`); **hovering** one shows a **hover card** (Base UI PreviewCard, like the source-text overlays — hoverable so the links in it are clickable) with the note; references inside the note link into the reader. (John 1 has ~11 → a–k.) The marker is a non-focusable `span` (a `<button>` doesn't get Base UI's hover wiring); a click/tap falls through to select the verse, whose footnotes the study panel also lists (the touch/keyboard path). |
| LB-READ-16 | — | Open `/bible/john/1`; hover footnote `b` in verse 14 (after the delay), then move to footnote `c` | **All footnotes + source-text overlays share ONE PreviewCard** (a per-`Passage` Base UI `handle`; each marker/overlay is a detached `Trigger` carrying a `payload` of `{tone, content}`). So once any card is open, moving to another trigger **repositions the single card with no re-open delay** — `c`'s note replaces `b`'s in well under the ~600ms fresh-open delay (Base UI group "instant" mode). Card styling follows the active trigger's tone (light footnote card vs. dark overlay card). |
| LB-READ-16b | — | Open `/bible/john/1`; hover the OT-quotation in verse 23 (incl. the `f` on "Lord", BSB) | A footnote **inside** a quotation is **merged into the quotation's hover card** instead of being its own trigger — so hovering anywhere in the quote (the dotted words OR the `f` marker) shows one stable card: "Quoting Isaiah 40:3" + a divider + the note "Old Testament YHWH, cf. Is 40:3" (both refs linked). The `f` marker is a plain non-interactive `span` (no nested trigger to fight its parent, which is what made the card close when moving between them). |
| LB-READ-05 | — | Open `/bible/matthew/2` | Cross-reference (`r`) lines render as links; clicking navigates to the target passage. |
| LB-READ-06 | Red-letter pref ON (default) | Open a chapter with words of Jesus (e.g. `/bible/john/3`) | Christ's words render in red. |
| LB-READ-07 [E2E: reading] | — | Click the next/prev chapter links at the page bottom | Navigates to adjacent chapter; crossing a book boundary goes to the next book (e.g. John 21 → Acts 1; Genesis 1 has no prev). |
| LB-READ-13 [E2E: reading] | Desktop/tablet (≥`sm`) | Open `/bible/john/3`; observe the **fixed side chevrons** (`[aria-label^="Previous chapter"]` / `[aria-label^="Next chapter"]`) | Two large **plain chevron arrows** (no button chrome — no border/fill/shadow; padded transparent hit area) are **fixed to the viewport, vertically centered**, flanking the centered column. Subtle hover: the faint arrow warms to gold and nudges toward the page (`hover:text-gold` + a small `translate`, transitioned). Clicking next → John 4, prev → John 2; crosses book boundaries (Genesis 50 → Exodus 1). **Genesis 1 has no prev**; the canon's last chapter has no next. In **interlinear** the chevrons appear too, the track widens to the interlinear column, and paging **preserves `?view=interlinear`**. z-20: header (z-30) + open study panel (z-40/50) sit above them. |
| LB-READ-14 [E2E: reading] | Mobile viewport (≈390px) | Open `/bible/john/3`; swipe horizontally over the reading body | The fixed side chevrons are **hidden** (`hidden sm:block`). A clear **horizontal swipe pages chapters**: swipe **left → next** (John 4), **right → prev** (John 2). Guarded so it never fires on a **vertical scroll** (`abs(dx) < 64` or `abs(dx) < abs(dy)·1.6`), a tap (verse select), or a long-press (word study). Works in interlinear too and **preserves `?view=interlinear`**. At canon edges the corresponding swipe is a no-op (Genesis 1 right-swipe does nothing). |
| LB-READ-15 [E2E: reading] | — | Scroll to the chapter bottom (any viewport) | A bottom nav row shows **prev (left)** and **next (right)** as a chevron + chapter name (next is gold-emphasized), with the selection-status text centered between them. Crosses book boundaries; at a canon edge that side is an empty spacer (status stays balanced). Preserves the interlinear view. |
| LB-READ-08 [E2E: reading] | — | Open `/bible/john/3?v=16` | Verse 16 (`[data-verse="16"]`) is **scrolled to the center** of the viewport and briefly **flash-highlighted** (gold background that fades out over ~1.8s via the `verse-flash` class / `lb-verse-flash` animation). The verse is **not** selected and the study panel does **not** open (deep link is a "jump + pulse", not a selection); tapping the verse afterwards selects it as usual. |
| LB-READ-09 | — | Use BookPicker + ChapterPicker in the header | Selecting a book/chapter navigates correctly; pickers are keyboard-operable (Base UI). |
| LB-READ-12 [E2E: reading] | Signed out | Open `/bible/john/1` | The reader header has the same auth affordance as the rest of the site (`AuthActions`): a **"Sign in"** link when signed out (→ `/login`), the account menu (avatar) when signed in. No "About" link in the header (About lives in the footer only). |
| LB-READ-10 | — | Verify divine name / OT-quote styling | "LORD" (divine name) renders in small caps; OT quotations render in normal case with a dotted underline (not small caps). |
| LB-READ-11 [E2E: reading] | — | On `/search?q=John 3:16`, click the "Go to reference → John 3:16" card | Navigates to `/bible/john/3?v=16` and verse 16 is **scrolled into view** (centered), not left at the top. Regression guard: verse deep-links navigate with **`resetScroll: false`** (set on every `?v=` link — centralized in `chapterLink`/`passageLink`, plus the two direct verse `<Link>`s), so TanStack Router's scroll restoration doesn't reset scroll to top and the reader's single `scrollIntoView` sticks — works on a fresh page load *and* on in-app navigation. |

---

## 6. Suite C — Translations

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-TR-01 | — | On `/bible/john/1`, open the TranslationPicker, choose MSB | URL gains `?translation=MSB`; text reloads as MSB; selection persists across chapter nav within the URL param. |
| LB-TR-02 | — | Open `/bible/john/1?translation=MSB` directly | MSB renders. |
| LB-TR-03 | No pref, no URL param | Open `/bible/john/1` | BSB (the default-flagged translation) renders. |
| LB-TR-04 | Translation pref = MSB (Suite D) | Open `/bible/john/1` (no URL param) | MSB renders (pref wins over default). URL `?translation=` still overrides the pref. |
| LB-TR-05 | — | Open the version picker on `/bible/john/3` | The list shows **four** translations: BSB (Berean Standard Bible), KJV (King James Version), MSB (Majority Standard Bible), **WEB (World English Bible)**. Each row carries the interlinear **`Aα`** button (all have `hasInterlinear` — BSB/MSB/KJV via `bible_token`, WEB via `bible_source_token`) and, for non-current rows, **Compare**. Each row also shows a **muted attribution line** under the name (e.g. "Berean Standard Bible — Public Domain", "World English Bible — Public Domain (trademark eBible.org)"). |
| LB-TR-06 | — | Open `/bible/john/3?translation=KJV` | KJV renders: verse 16 reads "For God so loved the world, that he gave his only begotten Son…"; the chapter is **prose** (no poetry blocks); every Strong's-tagged word carries `data-strong` (John 3 has 552 such runs). No console/hydration errors. |
| LB-TR-07 | — | On KJV, two-click "God" in John 3:16 (Greek) and "beginning" in `/bible/genesis/1?v=1` (Hebrew) | Word study resolves the lexicon for both: **θεός / G2316 / Greek** and **רֵאשִׁית / H7225 / Hebrew**, each with the KJV verse shown as context. (Confirms `bible_token` → `bible_lexeme` join for the KJV across both Testaments.) |
| LB-TR-08 | Red-letter pref ON (default) | Open `/bible/john/14?translation=KJV` and `/bible/matthew/4?translation=KJV` | KJV renders **red-letter** (words of Jesus, `.text-redletter`), projected from MSB via Strong's alignment. Full-verse speech is fully red (John 14:1 "Let not your heart be troubled…" entirely red; 14:6 "I am the way…"). Mixed verses split correctly: Matthew 4:4 narration "But he answered and said," is **black**, "It is written, Man shall not live…" is **red**; Matthew 4:20 "And they straightway left their nets…" has **no** red. (Toggling red-letter off hides it, same as BSB — Suite D.) |
| LB-TR-09 | Red-letter pref ON | Open `/bible/luke/4?translation=KJV&v=8` and `/bible/john/8?translation=KJV` | The **MSB reference** (Byzantine/Majority) recovers TR/Byzantine readings the KJV shares: Luke 4:8 "**Get thee behind me, Satan**" renders red (the critical text omits it, so a BSB reference would miss it); John 8:11 (the John 7:53–8:11 pericope, absent from the critical text) renders Jesus's "**Neither do I condemn thee: go, and sin no more**" red. |
| LB-TR-11 | Source-text overlays ON (default) | Open `/bible/john/1?translation=KJV` and `/bible/genesis/2?translation=KJV` | The **divine-name** and **OT-quotation** overlays render on KJV, applied at render time from the translation-independent index (`seed/overlays/index.json` → `src/lib/apply-overlays.ts`), not baked: John 1:23 underlines the quotation "voice of one crying in the wilderness, Make straight the way of the Lord" with a dotted decoration (normal case), while the intro "He said, I am the" and "as said the prophet Esaias" stay plain; Genesis 2:4 "**LORD**" renders small caps + dotted underline + `cursor-help` (`[font-variant:small-caps] … decoration-dotted`), like BSB. The quotation underline is **one continuous span** — a single wrapper draws the dotted decoration across the whole quote (DOM check: exactly one element with `text-decoration-line: underline` declared, whose parent has none, spanning the full quote; the footnote marker inside it is `no-underline`). The span runs first→last anchored Strong's word, covering unanchored words in between (so KJV's "of one", "Make", "of the" are underlined). Hovering shows a **source link** — John 1:23 → "Quoting Isaiah 40:3" → `/bible/isaiah/40?v=3` (cross-references projected from MSB; Matthew 1:23 → Isaiah 7:14). Word study's Source-text section also shows the divine name. |
| LB-TR-12 | Source-text overlays ON | Open `/bible/john/1?translation=KJV` | John 1:23 carries a **divine-name-note footnote** (a `divine_name_note` from the render-time overlay index): a superscript marker `a` after "Lord", whose **hover card** reads "Old Testament YHWH, cf. **Is 40:3**" with the ref linked → `/bible/isaiah/40?v=3`. Selecting the verse, the study panel's **Footnotes** section lists it ("a — Old Testament YHWH, cf. Is 40:3"), matching BSB. These footnotes are the *only* footnotes the KJV has (its source carries none); they come from the committed overlay index (`seed/overlays/index.json`), applied at render time. |
| LB-TR-10 | Red-letter pref ON | Open `/bible/acts/9?translation=KJV` and `/bible/luke/17?translation=KJV` | The two **pure-TR** red-letter gaps (absent from even the Byzantine text, so filled by the `MANUAL_RED` curated override) render red: Acts 9:5 "I am Jesus whom thou persecutest: **it is hard for thee to kick against the pricks**" (the whole clause is red); Luke 17:36 "**Two men shall be in the field; the one shall be taken, and the other left**" (whole verse red, matching the red 17:34–35). Regression guard: Acts 9:6's TR insertion "And he trembling and astonished said, Lord, what wilt thou have me to do?" stays **black** (the projection's full-red fast path is coverage-guarded, so it doesn't blanket-redden a KJV verse that the MSB reference only partly covers). |
| LB-TR-13 | — | Open `/bible/john/3?translation=WEB` | WEB renders: verse 16 reads "For God so loved the world, that he gave his only born Son…"; paragraphs/poetry preserved; **translator footnotes** present as superscript letters (John 3 has a–d; e.g. v3 "born anew" a, v16 "only born" c) with hover cards (Suite B). **Red-letter** words of Jesus render (Suite F pref). No `data-strong` runs (WEB has no per-word Strong's). No console/hydration errors. |
| LB-TR-14 | — | Open `/bible/genesis/1?translation=WEB`; observe v1 | WEB OT renders: Genesis 1:1 "In the beginning, God created the heavens and the earth." Poetry/footnotes where present; WEB prints "Yahweh" for the divine name in its own text (so the divine-name overlay is moot for WEB). |
| LB-TR-15 | — | On `/bible/john/3?translation=WEB`, two-click a word (e.g. "world") in v16 | The word does **not** open an English word-study lexicon entry (WEB has **no `bible_token`** → no per-word Strong's). Verse selection still works (study panel opens with cross-references + footnotes). (Confirms WEB has reading + footnotes + cross-refs but no English word study.) |
| LB-TR-16 | — | Open `/compare/john/3?with=WEB,KJV` | Side-by-side renders both columns: WEB v16 "…only **born** Son…" vs KJV v16 "…only **begotten** Son…". Confirms WEB participates in Compare. |
| LB-TR-17 | — | On `/bible/john/3?translation=WEB`, scroll to the bottom; on `/about` | The reader bottom shows the **attribution line** "World English Bible (WEB). World English Bible — Public Domain (trademark eBible.org)" (the credit linked to `https://ebible.org/web/`). `/about` has a **Translations** section listing all four translations with their attribution lines + a STEPBible interlinear-data credit. |

---

## 7. Suite D — Reading preferences

Resolution order: URL param > saved preference (DB if signed-in, else `lb-prefs`
cookie) > default. Defaults: red letter ON, verse numbers ON, text size 21px.

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-PREF-01 | Anonymous | `/settings` → toggle "Verse numbers" off | Verse number superscripts disappear in the reader; `lb-prefs` cookie updated. |
| LB-PREF-02 | Anonymous | `/settings` → toggle "Red letters" off | Words of Jesus render in normal ink. |
| LB-PREF-03 | Anonymous | `/settings` → drag text-size slider, release | Reading font size changes on commit (poetry = size − 1px); value clamped to 16–32. |
| LB-PREF-04 | Anonymous | Set translation = MSB in `/settings` | Reader (no URL param) now shows MSB. |
| LB-PREF-04b | Anonymous | `/settings` → "Divine name (YHWH)" select → Yahweh / YHWH / The LORD | Reader re-renders the divine name accordingly (see Suite L). |
| LB-PREF-04c | Anonymous | `/settings` → toggle "Source-text overlays" | Dotted-underline overlays appear/disappear in the reader (see Suite L). |
| LB-PREF-05 | Anonymous | Set prefs, reload | Prefs persist via `lb-prefs` cookie (now incl. divineName + sourceOverlay; `secure` flag added in production). |
| LB-PREF-06 | Signed in (Suite J) | Set prefs, sign out, sign back in / open on another browser profile | Prefs follow the user (stored in `user_preference` by `sub`). |
| LB-PREF-07 | — | Confirm settings controls are Base UI | Select / Slider / Switch are keyboard-operable with visible focus + labels. |

---

## 8. Suite E — Verse selection & the study panel (verse view)

| ID | Steps | Expected |
| --- | --- | --- |
| LB-VS-01 | Click a verse in a prose chapter | Verse highlights (`data-verse-selected="true"`); the study panel opens in **verse view** (`aria-label="Verse actions"`) showing the reference, verse text, and actions (highlight / copy / share / compare / add note). |
| LB-VS-02 | Press Esc, or click the panel × | Selection clears; the panel empties (the rail keeps its width — no reflow). |
| LB-VS-03 | Select a verse, then select a different verse | Panel re-targets the new verse; only one verse selected. |
| LB-VS-04 | Keyboard: Tab to a verse, press Enter/Space | Verse selects (verse is `role=button`, keyboard-operable). |
| LB-VS-05 | Select a verse; observe bottom status line | Shows "Verse N selected". |
| LB-VS-06 | Select a verse, then click a word in it | Selection switches to the word (mutually exclusive) — the panel becomes the word view; no verse stays selected. |
| LB-VS-07 [E2E: study] | In the verse view, click a word **in the panel's verse text** | The verse text in the panel renders each Strong's-tagged word as a clickable control (`role="button"`, like the reading text); clicking one opens that word's study (word view, `aria-label="Word study"`) — the panel's hierarchical navigation (verse → word, with the `‹ Ref` back link returning to the verse view). |
| LB-VS-08 [E2E: study] | Select a verse that has annotations | The verse view lists the verse's annotations in dedicated sections (each shown only when non-empty): **Footnotes** — each with its reading letter (a, b, c…) + the note body (e.g. John 1:5 → "a — Or comprehended"); **Cross-references** — links to the cited passages (e.g. Matthew 1:23 → "Isaiah 7:14" → `/bible/isaiah/7?v=14`); **Source text** — overlay explanations present in the verse (Divine name / Old Testament quotation / Hallelujah; e.g. Genesis 2:4 → "Divine name — the LORD renders the Tetragrammaton YHWH"). |

### Commentaries tab (verse view)

Data: `bible_commentary[_work]`, seeded from `seed/commentaries/*.json` (see §2.2).
The verse view is a Base UI `tablist` (**Verse** | **Commentaries**); the
Commentaries tab is a master/detail navigator. Following a work + the active tab
persist in a session store (`src/lib/study-session.ts`).

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-CM-01 [E2E: commentaries] | `/bible/john/3` | Select v.16 | The verse view shows two tabs — **Verse** (selected) and **Commentaries** (`role=tablist`/`tab`/`tabpanel`). The Verse tab holds the verse words, highlight, actions, and footnotes/cross-refs/source-text. |
| LB-CM-02 [E2E: commentaries] | LB-CM-01 | Click the **Commentaries** tab | Tab panel shows the **list** of works that comment on v.16, ordered by work ordinal (Calvin, Matthew Henry Complete, Matthew Henry Concise, Geneva, Wesley), each as a button with name + author · year + a 1-line preview. |
| LB-CM-03 [E2E: commentaries] | LB-CM-02 | Click a work (e.g. Calvin) | **Detail** view: a **‹ All commentaries** back link, the work name + author · year · tradition, the body as multiple paragraphs, and a **Source** link (new tab). |
| LB-CM-04 [E2E: commentaries] | LB-CM-03 (following Calvin) | Click a **different verse** (e.g. v.17) | The panel re-targets to John 3:17, **stays on the Commentaries tab**, and **still follows Calvin** — now showing Calvin's note on v.17. (Active tab + followed work persist across verses.) |
| LB-CM-05 [E2E: commentaries] | LB-CM-02 | Open Matthew Henry Complete (a section work) on v.16 | The detail header shows an **"on vv. 1–21"** range label (Henry keys the whole passage at the opening verse); per-verse works (Calvin/Geneva/Wesley) show no label. |
| LB-CM-06 | Following a work | Navigate to a verse that work doesn't cover | Detail shows **"{author} has no note on {Book C:V}"** (the follow persists; back link still available). |
| LB-CM-07 [E2E: commentaries] | LB-CM-03 | Click **‹ All commentaries** | Returns to the list view for the current verse; nothing is followed. |
| LB-CM-08 | — | On the Commentaries tab, select a verse no work comments on | List view shows **"No commentaries on this verse."** (no error). |
| LB-CM-09 | Any translation (BSB/MSB/KJV) | Follow a work, then switch translation and select the same verse | The same commentaries appear (translation-agnostic, anchored to book/chapter/verse). |
| LB-CM-10 | Offline / API failure | Open the Commentaries tab | The reader and Verse tab still work; the Commentaries tab shows its loading/empty state without crashing (the query is not in the SSR/loader path). |
| LB-CM-11 [E2E: commentaries] | `/bible/john/1`, follow Matthew Henry Complete | Inspect the body | Scripture references render as **reader links** (e.g. "Prov. xxv. 1" → `/bible/proverbs/25?v=1`, relative "ver. 15" → `/bible/john/1?v=15`); ranges link to the first verse. Unresolvable refs stay plain text. The list preview shows no raw `{{ref:…}}` markers. |

### Media tab (verse view)

Media from the lets.church catalog that teaches the selected verse.
lets.bible's `bible.relatedMedia` proxies server-to-server to web's
`/api/internal/media-for-verse` (shared-secret bearer); web resolves membership
from the `lc_media_v1` `bibleRefs` facet, enriches from Postgres (view counts,
imgproxy thumbnails), ranks by **views + recency**, and deep-links each card to
the verse's timestamp. **Prereq:** web's dev corpus has ≥1 public/approved upload
whose transcript BIBLE-annotates the test verse (see §2.2), and both apps share
`INTERNAL_API_TOKEN` (`WEB_INTERNAL_URL` on lets.bible). Pick the test verse from
the current corpus via the data preflight.

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-MEDIA-01 | `/bible/john/3`, verse selected | Observe the tab strip | Three tabs — **Verse**, **Commentaries**, **Media** (`role=tablist`/`tab`). |
| LB-MEDIA-02 | A verse the corpus teaches (from preflight); env configured | Click the **Media** tab | Cards render: thumbnail, title, channel · view count, duration badge. Ordered by the views+recency rank (higher-viewed/newer first). |
| LB-MEDIA-03 | LB-MEDIA-02 | Click a card | Opens the lets.church media page in a **new tab**, seeked to the timestamp where the verse is discussed (`/media/<id>#t=<seconds>`; the full-UUID form 301s to the base58 canonical URL). |
| LB-MEDIA-04 | LB-MEDIA-02 | Click **"Search {ref} on lets.church →"** | Opens the faceted search pre-filtered to that verse in a new tab. The `bibleRefs` param is a **JSON-encoded array** (web's `/search` validates it as `z.array(...)` via TanStack Router's default serializer), e.g. `/search?bibleRefs=%5B%22John.3.16%22%5D` — **not** a bare `?bibleRefs=John.3.16` (which 400s the route). The page renders the media matching that verse **even with no free-text `q`** (web runs a filter-only search for a facet-only browse, newest-first), facets populated, no error boundary. Each result surfaces the **transcript paragraph(s) that cite the verse** as its snippet/segments (resolved from the BIBLE annotations in Postgres — OpenSearch's `bibleRefs` is only a doc-level rollup), each linking into the media at that timestamp. An **AI overview** also renders, grounded in the facet-matched media: web synthesizes a query from the active facet (the verse label, e.g. "John 3:16") and sends `facetOnly` so the answer route skips its relevance-floor decline and always overviews the facet-scoped sources (never the "I couldn't find anything" card, given the facet matched). |
| LB-MEDIA-05 | A verse no upload teaches | Open the **Media** tab | Empty state: **"No media references this verse yet."** with the search link still shown. No error. |
| LB-MEDIA-06 | `INTERNAL_API_TOKEN`/`WEB_INTERNAL_URL` unset, or web unreachable | Open the **Media** tab | Degrades to the empty state; the reader and other tabs keep working (the query is not in the SSR/loader path). |
| LB-MEDIA-07 | — | `curl` `POST ${WEB_INTERNAL_URL}/api/internal/media-for-verse` **without** the bearer (and with a wrong one) | `401 Unauthorized`. With the correct bearer + `{book,chapter,verse}` → `200` `{ items, searchUrl }`. |
| LB-MEDIA-08 | Access control | Confirm a non-PUBLIC / unapproved / still-processing upload citing the verse | Does **not** appear in the Media tab (the `lc_media_v1` access-control filter + Postgres visibility re-check). |

---

## 9. Suite F — Word study panel

Data: each word run carries `data-strong`. The word view is the study panel's
word mode (`aria-label="Word study"`), a right rail below the sticky header (not
an overlay) on desktop. Word study opens by **two clicks** (desktop mouse — the
first selects the verse, the second selects the word; there is **no** double-click
gesture, which would double-fire) or a **press-and-hold** (touch / mobile — see
Suite Q); below `lg` the word view renders in the bottom-sheet drawer instead of
the rail.

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-WS-01 [E2E: study] | `/bible/john/1` | Click the word "God" twice | Study panel opens; header `"God"`; lemma **θεός** (Greek), badge `G2316`, transliteration `theós`, "GREEK", Definition / Translated as / Derivation; the clicked word is highlighted **once** (single highlight — no double-click double-fire). |
| LB-WS-02 [E2E: study] | `/bible/genesis/1` | Click "In the beginning" twice | Hebrew path: lemma **רֵאשִׁית** rendered RTL in the Hebrew font, badge `H7225`, "HEBREW", with transliteration + definition. |
| LB-WS-03 | Verse selected | Single-click a word in the *selected* verse | That word is selected (panel switches to word view) instead of re-selecting the verse. |
| LB-WS-04 | Word selected (word view) | Click a DIFFERENT verse | Selection is **mutually exclusive**: the word is deselected and the panel switches to that verse's verse view (no word stays selected). |
| LB-WS-05 | Word view open ("study mode") | Single-click any word (any verse) | Panel updates to that word directly; highlight moves. |
| LB-WS-06 | Word view open | Expand "Other occurrences" | Lazy-loads a concordance list of verses containing that Strong's number, each linking into the reader; duplicate per-verse occurrences don't crash (unique keys). |
| LB-WS-07 | Word view open | Click an occurrence link | Navigates to that verse. |
| LB-WS-08 | Word view open | Press Esc, or click the × | Panel closes; word highlight clears. |
| LB-WS-09 | Word view open | Navigate to another chapter | Panel closes (selection resets on chapter change). |
| LB-WS-10 | — | Open word study for a word with no lexicon entry (rare) | Panel shows "No lexicon entry for `<strong>`" rather than erroring. |
| LB-WS-11 | Word view open | Inspect a11y | Words are pointer-only (not in the tab order — keyboard users select the verse); panel has `aria-label="Word study"` and a focusable Close. |
| LB-WS-12 [E2E: study] | Word view open | Observe the verse context; click it | The word view shows the verse it's from (`‹ Book C:V` + the verse text). Clicking it returns to that verse's verse view (mutually exclusive — the word deselects). |
| LB-WS-13 [E2E: study] | `/bible/john/1`, nothing selected | Measure the reading column | While idle the reading column is **centered** in the viewport (the panel rail mounts only when something is selected, so reading mode has no gutter). |

---

## 10. Suite G — Search autocomplete

The homepage + search-page box is a Base UI Autocomplete backed **entirely by
client-side FlexSearch** — there is **no debounce** and **no server round-trip**
for suggestions. On focus it lazy-loads the active translation's index assets
(`/search/<id>.index.json` + `.verses.json`, built by `pnpm flex:build`) plus the
small `/search/structure.json`; until they load, book/topic/recent suggestions
(from static data) still work and verse matches fill in once ready. The
`/search` **results page still uses Elasticsearch** (`bible.search`) — FlexSearch
powers the instant autocomplete only.

The dropdown shows, top to bottom:

1. **Book-jump widget** (`[aria-label^="Jump to"]`) — an interactive widget (not a
   plain row) when the query looks like a book/reference; see LB-AC-19+.
2. **Exact phrase** — shown when the typed text appears verbatim in the scoped
   translation (client substring scan); a `❝` row with an **Exact** pill.
3. **Verses** — re-ranked FlexSearch matches (`“`, snippet + ref). Suppressed
   while the book widget is shown.
4. **Topics & recent** — curated topic matches (`#`) from `matchTopics` + recent
   chapters (`↺`) from local reading history (recent only when input is empty).
5. (catch-all, no header) — **Search "…"** (`↵`, "All results").

Verse ranking uses an AND ∪ suggest candidate union + a phrase/proximity re-rank
that matches ES on realistic queries (≈ MRR 0.893 vs 0.918).

A **scope dropdown** (Base UI `Menu`, e.g. `BSB ▾`) sits in the bar when more
than one translation is installed; it sets the translation searched (and switches
which index is loaded) and is carried into the Enter→`/search` query. With a
single translation the dropdown is hidden and the `⌘K` hint shows instead.

The dropdown is **visually connected to the bar** (per the design's "Search
behavior & states"): when it opens with content it anchors to the **whole bar**,
matching its width/left edge, flush (`sideOffset=0`, no gap), with a flattened
seam — bar bottom corners square, menu top corners square + bottom rounded.

| ID | Steps | Expected |
| --- | --- | --- |
| LB-AC-01 | Focus the box (empty) | Dropdown shows recent chapters (if any) + example chips; footer "Press Enter to search everything…". The chips are a **random handful (4)** that **rotates each page load** (`home.ts` `searchSuggestions`), drawn entirely from **curated, readily-answerable** sources — the curated `TOPICS` taxonomy's tuned queries + the curated verse-of-the-day references (`VOTD_REFS`, formatted "Book C:V"). No hand-invented/uncurated topics; every chip returns real results. |
| LB-AC-02 [E2E: search] | Type `john 3` | The **book-jump widget** appears (LB-AC-20) plus the catch-all **Search "john 3"** (`↵`). Verse text rows are suppressed while the widget is shown. |
| LB-AC-03 | Type `galat` | The book-jump widget resolves to **Galatians** + the catch-all. |
| LB-AC-04 | Type `psalm 23` | Book-jump widget = **Psalms**, chapter 23 selected (verse grid) + catch-all. |
| LB-AC-05 [E2E: search] | (covered by LB-AC-22/23 — book-widget verse click / Enter) | Navigates to the reader passage `?v=…` scrolled into view. Regression guard: `openPassage()` sets **`resetScroll: verse == null`** so a `?v=` jump opts out of the router's scroll-to-top reset and the reader's `scrollIntoView` sticks. |
| LB-AC-06 | Click a Verse row (non-book query) | Navigates to that verse in the reader, scrolled into view (same `resetScroll` path). |
| LB-AC-07 | (book navigation) | Handled by the book-jump widget (LB-AC-21/22). |
| LB-AC-08 | Click "Search "…"" or press Enter on a non-book query | Navigates to `/search?q=<query>` (with `&translation=<scope>` when a non-default scope is selected). |
| LB-AC-09 | Click an example chip | Navigates to `/search?q=<chip>`. |
| LB-AC-10 | Type quickly | **No debounce** — suggestions update on every keystroke (client-side FlexSearch); no error toasts, no flicker. |
| LB-AC-11 | Keyboard: ArrowDown through items | Items highlight across groups; list is operable via keyboard (Base UI roles). |
| LB-AC-12 [E2E: search] | Type a phrase that exists verbatim, e.g. `in the beginning` | An **Exact phrase** section appears above **Verses**: a `❝` row "in the beginning" with an **Exact** pill. Clicking it / pressing Enter searches that phrase. |
| LB-AC-13 | Type a phrase **not** present verbatim, e.g. `do not be anxious` (BSB reads "Be anxious for nothing") | **No** Exact phrase section (`countExactPhrase` = 0); Verses + Topics still show. |
| LB-AC-14 | Type a topic word, whole (`anx`) or inside a phrase (`do not be anxious`, `in the beginning`) | A **Topics & recent** section lists the matching curated topic (`#`, e.g. "Anxiety & worry", "Creation"). `matchTopics` is token-aware, so a content word inside a multi-word query still matches. Clicking runs the topic's curated query. |
| LB-AC-15 | After visiting chapters, focus the box | **Topics & recent** includes recent chapters (`↺`, "recent", up to 2) from local reading history; clicking one opens that chapter. |
| LB-AC-16 | With 2+ translations installed, open the scope dropdown (`BSB ▾`) and pick `MSB` | The trigger updates to `MSB ▾`; subsequent suggestions + the Enter→`/search` query are scoped to MSB (`translation=MSB`). With only one translation the dropdown is hidden and the `⌘K` hint shows. |
| LB-AC-17 | Open the dropdown (any state) | The footer shows the "Press Enter to search everything…" line **and** a second muted line "✦ AI-assisted answers coming to results." (affordance for the upcoming AI answer; see LB-SR-10). |
| LB-AC-17b | Popularity tie-breaker | Type a topical word that hits many verses (e.g. `faith`); among the verse suggestions, well-known verses (high Common Crawl count) tend to rank above obscure equally-matching ones. Client `score()` adds `log10(1+popularity)*8` (loaded from `/search/<id>.popularity.json`, id-aligned to `<id>.verses.json`); it's small vs the phrase/coverage tiers so it only nudges near-ties. Regression guard: `<id>.popularity.json` length == `<id>.verses.json` length. |
| LB-AC-18 | Type a query that yields suggestions | The dropdown is **flush-connected** to the bar: same left edge + width as the bar, **no gap** (`sideOffset=0`), no top border, and the bar's bottom corners square off while the menu rounds only its bottom — one continuous control (design "Search behavior & states"). Regression guard: measure `bar.getBoundingClientRect()` vs the popup — `x`/`width` match and `popup.top - bar.bottom ≈ 0–1px`. |

### Book-jump widget (Smart Autocomplete design)

When the query looks like a book/reference, the dropdown shows an interactive
**book-jump widget** (`[aria-label^="Jump to"]`) atop the list: a book row (glyph
+ "Name · N chapters" + caret) that expands into a chapter grid → verse grid with
a breadcrumb and a picked-verse preview. It is **bidirectional** — typing drives
the stage and clicking fills the input or navigates.

| ID | Steps | Expected |
| --- | --- | --- |
| LB-AC-19 [E2E: search] | Type `j` then `john` | A book-jump widget appears from the first keystroke (client book index, instant). At `john` it resolves to **John** — book row "John · 21 chapters", a **7-column chapter grid** of 21 cells (stage: chapter). |
| LB-AC-20 [E2E: search] | Type `john 3` | The same widget advances to **chapter 3**: breadcrumb "John › Chapter 3", an **8-column verse grid** of 36 cells (John 3 has 36 verses, from `structure.json`); no verse selected yet. |
| LB-AC-21 [E2E: search] | Type `john 3:16` | Verse **16** is highlighted (`aria-pressed`), and a **picked preview** shows "John 3:16" + the verse text ("For God so loved the world…") + an **Open** button. |
| LB-AC-22 [E2E: search] | With `john` typed, **click** chapter cell `3` | The input fills to **"John 3"**, the dropdown **stays open** (buttons `preventDefault` mousedown to keep input focus), and the widget advances to the verse grid. Then **click** verse `16` → navigates to `/bible/john/3?v=16` (scrolled into view). |
| LB-AC-23 [E2E: search] | Type `john 3:16` and press **Enter** | Navigates to `/bible/john/3?v=16`. Enter on `john 3` → `/bible/john/3`; Enter on `john` → `/bible/john/1` (most-specific target typed). |
| LB-AC-24 | Click the **book title** ("John") in the row | Navigates to the whole book (`/bible/john/1`). The caret toggles the picker open/closed without navigating. |
| LB-AC-25 | Type a non-book query (e.g. `love is patient`) | **No** book-jump widget; verse rows + topics + catch-all instead. |

---

## 11. Suite H — Search results page (`/search?q=`)

| ID | Steps | Expected |
| --- | --- | --- |
| LB-SR-01 [E2E: search] | `/search?q=fruit of the Spirit` | **Galatians 5:22 ranks first** (exact-phrase boost); matches highlighted with `<mark>`; "N verses" count. |
| LB-SR-02 [E2E: search] | `/search?q=John 3:16` | "GO TO REFERENCE → John 3:16" card linking to `/bible/john/3?v=16`; below it full-text verses + a "Related passages" section. |
| LB-SR-03 | `/search?q=Matthew 1:23` | Reference card + **Cross-references** section (Isaiah 7:14, with verse text, deduped) + verses + Related passages. |
| LB-SR-04 | `/search?q=<gibberish>` | "No results for …" empty state with a suggestion to try a reference. |
| LB-SR-05 | Stemming | `/search?q=fruitful` returns verses containing "fruit"/"fruitful" (english analyzer). |
| LB-SR-06 | Translation scoping | With MSB as the active translation/pref, results come from MSB rows. |
| LB-SR-07 | Click any verse/cross-ref/related row | Navigates to the correct passage + verse. |
| LB-SR-08 | XSS safety | A query that would inject HTML cannot break out: highlight uses `encoder:'html'` (verse text escaped, only `<mark>` injected). |
| LB-SR-09 | `/search` with no `q` | Prompt to "Search a reference, phrase, topic, or idea." (no query fired). |
| LB-SR-10 | Any query **with** results, e.g. `/search?q=fruit of the Spirit` | An **AI answer** card (`aria-label="AI answer (coming soon)"`, ✦ + "AI answer" + **Coming soon** pill + "We're building grounded, cited answers…") renders **first**, above the reference/cross-refs/verses. It is a placeholder only — no generated text, no network/LLM call. |
| LB-SR-11 | Popularity ranking | `/search?q=the word was god` — the decisive text match **John 1:1 ranks first**, but among the weaker matches a well-known verse (e.g. Luke 1:37) outranks an obscure one (e.g. 1 Kings 12:22); the obscure verse is displaced from the top. Popularity is a bounded `rank_feature` boost (pivot 2000, boost 4) — it reorders similar matches, never lifts a non-match or overrides a strong text match (John 1:1 still #1). Requires the v2 index populated with `popularity` (§2.2). |
| LB-SR-11 | A query with **no** results (`/search?q=<gibberish>`) | The AI placeholder is **not** shown — only the "No results…" empty state (the card lives in the results branch, not the empty branch). |

---

## 12. Suite I — Homepage

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-HOME-01 | Anonymous | Open `/` | Signed-out hero: wordmark **directly above** the search box (no subtitle paragraph between them), chips (a rotating random set — LB-AC-01), "Verse of the day", **only a "Sign in"** action in the header (no About link — About is in the footer), footer **"Powered by lets.church · About"** (a single centered line; the "Powered by lets.church" link → web host). |
| LB-HOME-02 | Signed in | Open `/` | Returning view: "Good morning/afternoon/evening, admin." greeting; avatar menu; search; cards. |
| LB-HOME-03 [E2E: home] | — | Verse of the day | Shows a **real verse** from a curated list (`src/lib/votd.ts`), text pulled from the DB (`bible_verse`) — not a hardcoded string. The reference (e.g. "Psalm 19:14") is a link into the reader at that passage (`/bible/psalm/19?v=14`), and the translation tag matches the resolved translation. |
| LB-HOME-03a | — | Same day, reload | The verse is **stable across the day** (keyed by UTC day) and identical in SSR + client (no hydration mismatch). |
| LB-HOME-03b | Signed in with a non-default translation preference (e.g. KJV) | Open `/` | The verse of the day renders in the **preferred translation** (same passage, KJV wording). |
| LB-HOME-04 | — | Greeting time-of-day | Greeting matches local time (client-hint based — verify no hydration mismatch). |
| LB-HOME-05 | — | Header nav (Bible/Library/Listen) | Links route correctly (Bible → `/bible/john/1`). |
| LB-HOME-06 | — | Open `/about` (reached via the **footer** "About" link — there's no header link) | A **real** About page (not a "coming soon" placeholder): eyebrow "About", heading "A focused place to read Scripture", intro blurb, a 4-item feature grid (Read / Search / Study / Keep), a lets.church sync note, and a single "Start reading" (→ John 1) CTA. No "Back home" link, no "still being built" panel. |

---

## 13. Suite J — Auth / OIDC (relying party + IdP)

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-AUTH-01 | Signed out | Click "Sign in" → redirected to web IdP → log in `admin`/`password` | Returns to lets.bible signed-in (greeting + avatar). A `sid` cookie is set (HttpOnly). |
| LB-AUTH-02 | — | Inspect the authorize redirect | Carries `code_challenge` (S256), `state`, `nonce`, `scope=openid profile email offline_access`. |
| LB-AUTH-03 | Signed in | Reload / revisit later | Session persists (DB-backed `oidc_session`). |
| LB-AUTH-04 | Signed in | Click "Log out" | RP session cleared; bounced through the IdP end-session; lands signed-out; revisiting `/login` requires re-authentication (SSO session terminated). |
| LB-AUTH-05 | Signed in | On the web origin, read `document.cookie` | `lc-session` is **absent** (HttpOnly); non-HttpOnly cookies are visible. |
| **Negative / security** | | | |
| LB-SEC-01 | — | GET `/callback?state=forged&code=abc` with **no** `lb_oidc_state` cookie | Redirect to `/?error=state` (login-CSRF blocked); no session created. |
| LB-SEC-02 | — | GET `/callback` with a `lb_oidc_state` cookie that **mismatches** the URL `state` | `/?error=state`. |
| LB-SEC-03 | — | GET `/login` and inspect `Set-Cookie` | Sets `lb_oidc_state` HttpOnly, SameSite=Lax, Max-Age≈600. |
| LB-SEC-04 | Signed in (IdP) | Navigate to `http://localhost:4000/oidc/logout` with **no** `id_token_hint` | SSO session is **NOT** cleared (forged-logout CSRF blocked) — revisiting `/login` round-trips back signed-in. |
| LB-SEC-05 | Signed in | Real RP logout (sends `id_token_hint`) | SSO session **is** cleared (re-auth required). |
| LB-SEC-06 | — | Tamper an id_token (wrong signature/alg) in the callback exchange | Verification fails (`algorithms:['ES256']` pinned); login rejected. |

---

## 14. Suite K — Cross-cutting

| ID | Area | Expected |
| --- | --- | --- |
| LB-X-01 | SSR/hydration | No hydration mismatch warnings on `/`, `/bible/...`, `/search`, `/settings`. The autoplaying media concern doesn't apply here, but the reader must hydrate cleanly. |
| LB-X-02 | Responsive | At ≤ ~900px the study-panel column / reader remains usable; at desktop widths the panel sits beside the reading column. |
| LB-X-03 | Accessibility | Keyboard-only pass: header nav, pickers, verse selection, settings controls, search autocomplete all operable; visible focus rings; landmark roles. |
| LB-X-04 | Back/forward | Browser back after navigating from search → reader → back restores the search results + query. |
| LB-X-05 | Error resilience | If Elasticsearch is down, `/search` shows the error state ("Something went wrong"), the reader (DB-backed) still works. |
| LB-X-06 | Anonymous parity | All reading/search/study features work signed-out (default BSB), except prefs persist via cookie not DB. |

---

## 15. Suite L — Source-text overlays

In-text source-text hints: a dotted underline + hover card (Base UI PreviewCard,
whose popup is hoverable so links in it are clickable) on the divine name,
"Hallelujah", and Old Testament quotations, plus the divine-name rendering
preference. Controlled by the "Source-text overlays" toggle (default on) and the
"Divine name (YHWH)" select. The study panel mirrors the info (Suite F).

The divine name / OT quotation / divine-name notes are **applied at render time**
from the translation-independent index (`seed/overlays/index.json`), not baked, so
they behave identically across **BSB, MSB, and KJV** — the cases below should pass
on each (swap `?translation=`). The reader applies the index in its chapter loader
(`src/lib/apply-overlays.ts`); the interlinear/tokens tRPC apply it server-side
(`src/server/overlays/apply-tokens.ts`).

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-OV-01 [E2E: overlays] | Overlays on, divine name = The LORD | Open `/bible/genesis/2`; hover "LORD" | "LORD" is small-capped with a dotted underline (`decoration-dotted`); tooltip reads "Literally YHWH — the divine name (Tetragrammaton)." The word is still clickable (H3068). The underline uses a deliberate muted-gray (`decoration-muted-2`, not currentColor), so it stays visible and distinct from the text in **both light and dark** mode — it must NOT use the `[text-decoration:…]` shorthand (that resets the color to currentColor and made it vanish on dark/faded text). |
| LB-OV-02 | — | Open `/bible/psalm/115`; hover "Hallelujah" | Dotted underline; tooltip "“Praise Yah” — hallĕlû (praise) + Yah (a short form of YHWH)." |
| LB-OV-03 | — | Open `/bible/1-corinthians/1?v=19`; observe the quotation | OT-quotation words carry a dotted underline only — rendered in **normal case**, not small caps (small caps are reserved for the divine name). Hovering reveals the source link (see LB-OV-14). |
| LB-OV-04 | — | Double-click a word in the OT quotation (e.g. 1 Cor 1:31 "Let him who…") | Study panel shows the lexeme **plus** an "OLD TESTAMENT QUOTATION" section linking to the source (Jeremiah 9:24 via cross-references). When no cross-ref exists it reads "This passage quotes the Old Testament." |
| LB-OV-05 | — | Double-click a divine-name word | Study panel shows a "SOURCE TEXT" section: the divine name יְהוָה (YHWH), traditionally rendered "the LORD". |
| **Divine-name rendering** | | | |
| LB-OV-06 [E2E: overlays] | `/settings` → Divine name = Yahweh | Open `/bible/genesis/2` | Divine name renders as **Yahweh** (not small caps); the preceding English article is dropped — verse 4 reads "…that Yahweh God made them" (not "the Yahweh"); verse 5 "for Yahweh God…". |
| LB-OV-07 | Divine name = YHWH | Open a chapter with the divine name | Renders **YHWH**, article likewise stripped. |
| LB-OV-08 | Divine name = The LORD | — | Renders small-caps "LORD" with the article intact ("the LORD"). |
| LB-OV-09 | Divine name = Yahweh | — | The overlay tooltip on the rendered name reads "The divine name YHWH, traditionally rendered “the LORD”." |
| **Overlay toggle** | | | |
| LB-OV-10 | `/settings` → toggle "Source-text overlays" OFF | Open `/bible/genesis/2` | **No** dotted underlines anywhere; hovering shows no tooltips. Divine-name *rendering* (Yahweh/LORD per the other setting) is unaffected. |
| LB-OV-11 | Overlays OFF | Double-click a divine-name / OT-quote word | Study panel still shows the source-text sections (the panel is independent of the in-text overlay). |
| LB-OV-12 | Toggle overlays back ON | Reload reader | Underlines + tooltips return. |
| **OT-quotation selection & source link** | | | |
| LB-OV-13 [E2E: overlays] | Overlays on | Open `/bible/matthew/1`; click an OT-quotation word (Matthew 1:23 "Behold"), then click it again | The first click selects the **whole verse** (verse 23). The quotation spans several poetry lines and **all** highlight together; the panel opens in verse view ("Verse 23 selected"). A second click (verse selected) opens the study panel for the word (G2400, ἰδού). Regression guard: OT-quotation poetry runs carry their verse number, so verse/word selection works inside quotation blocks — previously these runs had no verse and were unselectable. |
| LB-OV-14 [E2E: overlays] | Overlays on | Open `/bible/matthew/1`; hover an OT-quotation word | A **hover card** (Base UI PreviewCard, not a tooltip — so its popup is hoverable) reads "Quoting <source>" with a **clickable link** to the source passage — "Isaiah 7:14" → `/bible/isaiah/7?v=14` (clicking it navigates there). (1 Corinthians 1:19 → "Isaiah 29:14".) When the verse has no cross-reference it falls back to "Old Testament quotation." |
| LB-OV-15 [render-time index] | Overlays on | Open `/bible/john/1` (try `?translation=BSB`, `MSB`, `KJV`); inspect verse 23's quotation | The OT-quote underline is **one continuous span**, not per-word. DOM guard: within `[data-verse="23"]` exactly **one** element declares `text-decoration-line: underline` (its parent declares none) and its text covers the whole quote ("voice of one crying in the wilderness, Make straight the way of the Lord"). Unanchored in-between words are underlined too (KJV "of one", "Make", "of the"). A trailing footnote marker inside the span is `no-underline` (not part of the line). When the quote spans two blocks (BSB prose intro + poetry line) there is one continuous span **per block** (they're separate lines anyway). |
| LB-OV-16 [render-time index] | Overlays on | `bible_token` is overlay-pure (DB has no divine/otQuote flags) — query `bible.interlinear` for John 1 (or open the interlinear view and word-study a quoted word) | The interlinear tokens come back with `otQuote=true` for John 1:23 "voice"…"Lord" (and `false` for "He said I am the" / "as said the prophet Esaias"), and `divineName=true` for Genesis 2:4 "LORD" — resolved server-side from the index even though `bible_token` stores none. So word study opened **from the interlinear** still shows the Source-text section. |

---

## 16. Suite M — User library (highlights, notes, reading position)

**Server-canonical, with a local-first offline overlay.** For a **signed-in**
user the server is the source of truth: the reader's route loader fetches their
highlights/notes for the chapter (`library.chapterMarks`) and **returns them in
the loader payload**, so they render in the **SSR HTML** (no client-side
"flash-in", consistent across devices). The local-first store (TanStack DB +
localStorage collections) is an **optimistic + offline overlay** on top —
`useChapterMarks(book, chapter, serverMarks)` uses `serverMarks` as the base and
applies local rows over it (local wins so a just-made/offline edit shows
instantly; a local tombstone removes the server row). Writes still go
optimistic-local + background sync to the server. **Anonymous** users have no
server marks, so they're purely local (and the synchronous localStorage seed in
`useCollectionRows` keeps their first paint flash-free — see LB-LIB-15).
Highlights/notes are translation-agnostic (anchored to the verse ref). Storage
keys: `lb-highlights`, `lb-notes`, `lb-progress` (localStorage). The actions live
in the study panel's verse view.

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-LIB-01 | `/bible/john/3` (anyone); **tap verse 16** to open verse view (a direct `?v=16` no longer selects — it only scrolls + flashes, see LB-READ-08) | Verse view → click a highlight color | The palette has **6** swatches (gold, sage, slate, rose, sky, plum — `aria-label="Highlight <color>"`, from `HIGHLIGHT_COLORS` in `src/lib/highlight-colors.ts`). Verse 16 tints with that color (a translucent fill, rendered inline from the `--color-<color>` token — no per-color class); re-clicking another color changes it; "Clear" removes it. Persists in `lb-highlights`. |
| LB-LIB-10 [E2E: library-local] | A **highlighted** verse | Select it (tap) | The verse shows **both** at once: the highlight color fill **and** the selection's **gold underline** (`verse-selected` → `box-shadow: inset 0 -2px 0 gold`). They're on different CSS properties (background vs box-shadow), so neither hides the other. |
| LB-LIB-11 [E2E: library-local] | Highlight in **dark mode** (`[data-theme="dark"]`) | Apply a highlight | In dark mode the highlight tints the **verse text color** (`.verse-highlight` → `color: var(--hl)`), with **no** translucent background box. In light mode it's a translucent background fill. |
| LB-LIB-13 [E2E: library-local] | Highlight a verse with **red-letter** text (words of Christ, e.g. Matthew 5) in **dark mode** | Apply a highlight | The highlight color **takes precedence over the red-letter color** — the red runs render in the highlight color, not red (`.verse-highlight .text-redletter { color: var(--hl) }`). (Light mode keeps red text on the translucent fill.) |
| LB-LIB-14 [E2E: library-local] | — | Open any chapter | Every highlight palette token (`--color-gold/sage/slate/rose/sky/plum`) resolves to a non-empty value in light mode. (Guard: highlights render via inline `var(--color-<key>)`, invisible to Tailwind's scanner; a palette color in `@theme` with no static `bg-*/text-*` usage gets tree-shaken and renders transparent — this silently broke `sage`. The accents live in a plain `:root` block to stay emitted.) |
| LB-LIB-15 [E2E: library-local] | **Anonymous** user; a highlight already in `localStorage` (`lb-highlights`), pre-seeded before page load — not created this session | Cold-load the chapter (no click) | The verse renders highlighted. An anonymous user's marks live only in `localStorage` (per-device), so they **can't be server-rendered**. To avoid the mark "flashing in" a frame or two after the chapter paints (the TanStack DB collection hydrates asynchronously), `useCollectionRows` seeds its read snapshot **synchronously** from the same `localStorage` blob (`readLocalRows`) on the first client render, so the mark is in the first painted client frame; the collection then takes over once it loads. The not-yet-loaded (empty) collection can't clobber the seed (deletions are tombstones, so a loaded collection is never empty while rows exist). (Signed-in users get the marks from the server-rendered loader instead — LB-LIB-16.) |
| LB-LIB-16 (manual — needs a signed-in session) | **Signed-in** user with a highlight on a verse stored server-side (`user_highlight` row) | Cold-load that chapter (or load it on a **different device** / cleared `localStorage`) | The highlight is in the **SSR HTML** — view source / `fetch(url)` shows the verse span with `class="… verse-highlight"` and `style="--hl:var(--color-<color>)"` before any JS runs. No flash, and it appears even with empty local storage (cross-device), because `library.chapterMarks` is fetched in the loader and returned in the SSR payload. Verified manually: signed in as the dev `admin`/`password` user, highlighted John 3:16, confirmed the server HTML carries `--hl:var(--color-sage)` on `data-verse="16"`. |
| LB-LIB-12 [E2E: library-local] | Was signed in (`lb-was-signed-in=1`) with local library data, then signed out | Load the app signed-out | **All** on-device data is wiped (`lb-highlights`/`lb-notes`/`lb-progress`/`lb-translations` cleared, the IndexedDB `letsbible-cache` cleared, `lb-merged` + `lb-was-signed-in` removed) so the account's library can't leak to the next user on a shared device. A never-signed-in visitor (no `lb-was-signed-in`) keeps their own local data. Two layers wipe: (a) the account menu's **"Log out"** click calls `clearLocalData()` before navigating to `/logout` (belt), and (b) this **load-based** detection on the next signed-out load (suspenders — also covers session expiry / other sign-outs). This case tests layer (b); layer (a) is the same `clearLocalData()` and isn't separately automated (it needs a signed-in session to render the menu). |
| LB-LIB-02 | Verse selected | Verse view → "Add note" → type → Save | A ✎ marker shows on the verse; reopening shows "Edit note" with the saved body; Delete removes it. |
| LB-LIB-03 | Anyone | Verse view → "Copy" / "Share" | Copy puts `verse text (Ref)` on the clipboard; Share puts the deep link `…/bible/<book>/<ch>?v=<v>`. Buttons flash "Copied"/"Link copied". |
| LB-LIB-04 | Verse selected | Verse view → "Study a word" | Opens the word view for the verse's first studyable word. |
| LB-LIB-05 [E2E: library-local] | Signed out (guest) | Highlight a verse, reload | Highlight persists (localStorage). Library shows a "reading as a guest — saved on this device" banner. |
| LB-LIB-06 [E2E: library-local] | Anyone | Read a chapter, go to `/` | "Continue reading" shows the most recent chapter (Resume·v.N if a verse); "Recent" lists recent chapters with relative time. Nothing read → "Start reading → John 1". |
| LB-LIB-07 | Anyone | Open `/library` | Highlights (color dot + ref), Notes (body + ref), History sections show on-device data; links open the verse. |
| LB-LIB-08 | Signed in | Highlight a verse | Within ~½s it's pushed to the server (`user_highlight` row); the local row's `dirty` flag clears. |
| LB-LIB-09 | Offline (DevTools → Offline) | Highlight / note / read | Works instantly (localStorage); no errors. On reconnect (`online` event) the dirty rows sync to the server. |
| LB-LIB-10 | Signed in on device B | Edits on device A (synced) | After pull, device B shows them (DB-backed by `sub`); switching translation keeps them (ref-anchored). |

### Suite M2 — Merge on sign-in

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-MRG-01 | Guest with local highlights/notes | Sign in | A "Sync your library" dialog appears: "You have N highlights and M notes saved on this device", with **Merge with my account** / **Use my account's data instead**. |
| LB-MRG-02 | Dialog open | Click "Merge with my account" | Local rows are pushed to the server (union), then the server copy is pulled; dialog closes; `lb-merged=1`. |
| LB-MRG-03 | Dialog open | Click "Use my account's data instead" | Local rows are dropped and replaced by the server's; dialog closes. |
| LB-MRG-04 | Already merged this session | Reload / navigate | No dialog re-appears (guarded by `lb-merged`); a background pull keeps local fresh. |
| LB-MRG-05 | Signed in, no local data | Sign in on a fresh device | No dialog; server data pulled into local silently. |

---

## 17. Suite P — Compare translations

Side-by-side verse-aligned view at `/compare/$book/$chapter` (BSB & MSB share the
`org` versification, so rows align by verse number; a translation missing a verse
shows "—"). Reachable from the reader header ("Compare") and the study panel's
verse view.

| ID | Steps | Expected |
| --- | --- | --- |
| LB-CMP-01 [E2E: compare] | Open `/compare/john/1` | Two columns (BSB, MSB) with verse-aligned rows; verse 1 text appears in both; sticky translation header. |
| LB-CMP-02 [E2E: compare] | Reader header → "Compare" | Opens `/compare/<book>/<chapter>` for the current passage. |
| LB-CMP-03 [E2E: compare] | Select a verse → verse view "Compare" | Opens `/compare/...?v=<n>`; the target verse row is highlighted + scrolled into view. |
| LB-CMP-04 [E2E: compare] | Compare → "← Read" | Returns to the reader at that book/chapter. |
| LB-CMP-05 | `/compare/$book/$chapter?with=BSB,MSB` | Honors the `with` param (column set + order); invalid ids fall back to all translations. |
| LB-CMP-06 | Open a chapter with a Majority-Text difference (e.g. a verse MSB carries that BSB doesn't) | The differing/added verse is visible in the MSB column; the other shows "—" where absent. |

---

## 18. Known mocked / not-implemented (expected, not bugs)

- Toolbar "Listen" action is not built; only Copy/Share/Compare/Highlight/
  Note/Study are functional.
- Homepage "Today's plan" card = static mock; `/listen` = placeholder.
- Word pronunciation audio = not implemented (see `docs/word-pronunciation-audio.md`).
- "Related passages" = lexical similarity (`more_like_this`), not vector-embedding
  semantic search.
- **Autocomplete result-type widgets = book-jump only.** The Smart Autocomplete
  design also sketches interactive *topic facets*, *original-word occurrences*,
  and *recent-with-resume* result widgets — those are concept-only; only the
  book-jump widget (book → chapter → verse) is implemented. Topics/recent appear
  as plain rows.
- **AI-assisted answers = affordance only.** The results-page "AI answer" card
  (LB-SR-10) and the autocomplete footer note (LB-AC-17) are labeled "coming
  soon" placeholders — there is no retrieval/LLM backend yet. The real feature
  (RAG over the verse index + synthesis) is gated on the abuse controls in
  `docs/search-answer-abuse-mitigation.md` before it ships.
- Preferences persist via the `lb-prefs` cookie (works offline, syncs to the DB
  server-side) rather than a TanStack DB collection — intentional, because prefs
  are read during SSR and a client-only collection would flash defaults.
- **KJV is prose-only with limited enriched markup (expected).** The KJV source
  (e-Sword "KJV+") carries only text + per-word Strong's/morphology, so on KJV there
  is **no** poetry layout or section headings — and Compare/highlights/notes can
  misalign vs BSB/MSB at the handful of verses where the 1769 (`kjv`) versification
  differs from `org`. These are not bugs; they're the source's limits. The
  **source-text overlays (red-letter, OT quotation, divine name, divine-name-note
  footnotes) ARE populated**, and cross-references are projected — red-letter from
  MSB, the rest from the overlay tool (see the notes below). KJV's *only* footnotes
  are the overlay tool's divine-name notes (its source has none of its own). The
  only remaining gaps: ~174 OT quotations the tool couldn't resolve onto KJV's
  archaic English (await its LLM tail), and the Hallelujah overlay (moot — KJV reads
  "Praise ye the LORD", not "Hallelujah").
- **KJV red-letter IS populated, projected + curated.** Words of Jesus are
  projected onto KJV from **MSB's** `wj` via Strong's-sequence alignment
  (`src/server/red-letter`), not authored in the KJV source. MSB (Byzantine/
  Majority) is the reference because it's textually closest to the TR-based KJV.
  Quality is high (~2,050 verses; intros stay black, speech turns red). The two
  **pure-TR** readings the Byzantine text lacks entirely (so projection can't reach
  them) are filled by a small curated override (`MANUAL_RED`): **Acts 9:5** "it is
  hard for thee to kick against the pricks" (clause) and **Luke 17:36** "Two men
  shall be in the field…" (whole verse). Every other classic "omitted verse" (Matt
  17:21/18:11/23:14, Mark 7:16/9:44/9:46/11:26, the Lord's-Prayer doxology) is in
  the Byzantine text, so it projects fine. Residual: a rare trailing word can drop
  where word order diverges (e.g. Luke 4:8 "…shalt thou serve"). Not a bug — the
  cost of cross-text-basis projection. (BSB/MSB get red-letter natively from `wj`.)

---

## 19. Suite N — Offline (reading, search, library)

Reading content and the search index are **static assets shipped in the image**,
built from the committed USX seed (no DB) by `build-flex-index.ts` (`pnpm build`):
the reader fetches a chapter from `/reading/<id>/<slug>.json` (isomorphic — a
server self-fetch during SSR, a relative fetch on the client) and slices the
chapter; search loads `/search/<id>.*`. **There is no download button and no
IndexedDB chapter cache** — the service worker is the offline cache, and an
**idle auto-precache** (`local/precache.ts`) pulls the whole active translation
(all 66 `/reading/<id>/*.json` + `/search/<id>.*`) once per version
(`lb-precache:<v>:<id>`, skipped on data-saver) so the entire Bible + search work
offline with no user action.

The service worker (`public/sw.js`) caches `/reading/` and `/search/` **cache-first**
in prod (network-first in dev so a `flex:build` regen refreshes), under the
`lb-content-<VERSION>` cache. Notes, highlights, reading position and prefs are
local-first (TanStack DB collections / `lb-prefs` cookie) and already worked
offline — unchanged by this.

The **app shell itself** is cached by a hand-rolled **service worker**
(`public/sw.js`): navigations are network-first → cached page → app-shell;
built assets are stale-while-revalidate; Google Fonts and tRPC query GETs are
cached too — so the app loads (and reloads) fully offline, not just within an
already-open tab. A `manifest.webmanifest` makes it an installable PWA.

Because a service worker doesn't control the page during its *first* load (so
runtime caching would miss everything until a second visit), the page posts the
URLs it just loaded to the SW after first paint (`lb-precache` message) and the
SW caches them — so the app is offline-ready after a **single** visit. (Warms the
current page's resources; visiting other routes caches those too. Full-app
precache-on-install is a possible later upgrade.)

> **Dev caveat:** test offline *styling* against a **prod build**, not `vite
> dev`. In dev, Vite serves `app.css` as a `text/javascript` JS-injection module
> plus a per-load timestamped `/src/app.css?t=<ts>` stylesheet it re-injects with
> a fresh timestamp each load, so the offline reload can't match the cached CSS
> and the page renders **unstyled** (content still loads). This is Vite's dev
> CSS-HMR pipeline; production ships a stable hashed `text/css` file that caches +
> serves offline correctly (verified: `--color-gold` persists offline in prod).

> **Testing offline:** the service worker is **dev-aware** — registered in both
> dev and prod, with `/sw.js?dev` in dev selecting a network-first-everything
> strategy (online always serves fresh, so HMR is never handed a stale module;
> the cache only kicks in offline). So LB-OFF-08..10 can be checked against the
> **dev** server (Playwright `context.setOffline(true)` on :4001) — and against a
> prod build for the cache-optimised strategies: `docker compose run --rm -d -p
> 4090:3000 letsbible sh -lc "pnpm --filter @letschurch/lets.bible run build &&
> pnpm --filter @letschurch/lets.bible run start"`, then a Playwright run with
> `LETS_BIBLE_E2E_URL=http://localhost:4090`. (Both verified working 2026-06-22.)

| ID | Preconditions | Steps | Expected |
| --- | --- | --- | --- |
| LB-OFF-01 | `/settings` | Scroll to "Offline" | An informational note ("lets.bible works offline automatically … No download needed.") — **no** download buttons / per-translation rows. |
| LB-OFF-02 | Reader, open the translation picker | Inspect each row | Rows have **no** download button — only the translation name, Compare, and (where present) the interlinear `Aα`. |
| LB-OFF-03 [E2E: reading] | Open `/bible/john/3` | The reader renders from the static `/reading/<id>/<slug>.json` asset (the request appears in the network panel; **no** tRPC `bible.chapter`). All 36 verses render; footnotes work. |
| LB-OFF-04 | Load any chapter, wait for idle | An auto-precache pass fetches all 66 `/reading/<id>/*.json` + `/search/<id>.*` for the active translation. Runs once per version (guarded by `lb-precache:<v>:<id>` in localStorage) and is **skipped on data-saver** connections. |
| LB-OFF-05 [E2E: reading-local] | Highlight/note a verse, reload | The mark renders on the statically-rendered chapter (local-first `lb-highlights`/`lb-notes` collections; verified JHN.3.16 gold tint persists across reload). Reading the chapter no longer depends on the DB. |
| LB-OFF-06 (manual — go offline after precache) | After the idle precache (or after visiting books), `context.setOffline(true)` | Reload / navigate to any chapter of a precached translation → renders fully offline from the SW `lb-content` cache (verses + footnotes); the search autocomplete (book jump + verse matches) also works offline. |
| LB-OFF-07 (manual — first visit, no precache yet) | Visit a chapter online **once**, then go offline | Reload → app shell + the chapter's `/reading/` asset load from the SW (warmed on the first visit); navigating within the same book works offline. Cold-start guard: a single visit suffices. |
| LB-OFF-08 (manual; prod build) | Prod build, offline, a chapter whose asset isn't cached yet (precache incomplete) | Degrades gracefully — the app shell loads (SW) and the reader shows a not-available/error state; no white screen. Cross-refs + interlinear are skipped offline (`crossRefsQueryOptions` resolves `{}`; interlinear shows its loading state). |
| LB-OFF-09 (manual; prod build) | Prod build | Inspect the page | A linked `manifest.webmanifest` (name "lets.bible", `display: standalone`, theme `#f4f1e9`, icon) makes the app installable; the SW (`/sw.js`) is registered and controlling; `/reading/` + `/search/` responses are in the `lb-content-<VERSION>` cache. |

### Offline commentaries (download + manage)

Unlike reading/search (auto-cached), commentaries are **opt-in downloads** managed per commentator on the Library page, stored in IndexedDB (`letsbible-cache`/`kv`, keys `commentary:*`). Online is unchanged; the study panel falls back to the downloaded copy only when the server call fails. See `src/local/offline-commentaries.ts`.

| ID | Steps | Expected |
| --- | --- | --- |
| LB-OFF-CM-01 [E2E: commentaries] | As a guest (signed out), click **Library** in the header (shown for anonymous users alongside Sign in; signed-in users reach it via the account menu) | Lands on `/library` (no redirect). An **Offline commentaries** section lists all 5 works (Calvin, Matthew Henry ×2, Geneva, Wesley) with author + size in MB (from `bible.commentaryWorksWithSize`), each with a **Download** button. |
| LB-OFF-CM-02 | Click **Download** on a work (e.g. Geneva ~4.4 MB) | Button shows **%** progress (per-book loop), then flips to **Remove**. IndexedDB `letsbible-cache`/`kv` gains `commentary:works`, `commentary:meta` (with the workId), and one `commentary:<workId>:<USFM>` key per covered book (Geneva = 63). |
| LB-OFF-CM-03 | Reload `/library` | The downloaded work still shows **Remove** (status hydrated from `commentary:meta`); others show **Download**. No hydration mismatch (server + first client paint render Download). |
| LB-OFF-CM-04 | With a work downloaded, simulate offline (DevTools offline, or fail `/trpc/`), open a verse it covers (e.g. Geneva on John 3:16), Commentaries tab | The panel lists **only downloaded works** (Geneva), assembled from IndexedDB, with the body rendered. Non-downloaded works do **not** appear offline. Online (no failure) is unchanged — all works show. |
| LB-OFF-CM-05 | Library → **Remove** the work | Its `commentary:<workId>:*` keys are deleted and it's pruned from `commentary:meta`; button returns to **Download**. Offline, that work no longer appears in the panel. Removing mid-download aborts the loop and cleans up. |
| LB-OFF-CM-06 | Study panel → Commentaries tab | Each work (list row, and the detail header when a work is open) has a compact **download icon** on the right (mirrors the translation picker's row actions): a down-arrow when idle, **%** while downloading, a **✓** when saved (tap to remove). It shares the offline store, so downloading/removing here stays in sync with the Library (and vice-versa). |

> Note: reading + search are auto-cached (static assets, SW-cached); commentaries
> are opt-in per-work downloads (IndexedDB, managed on Library). The homepage's
> tRPC-driven cards (verse of the day, plan) still need a connection.
> Library/prefs are local-first.

## 20. Suite O — Forms (TanStack Form)

The verse **note editor** is built on `@tanstack/react-form`.

| ID | Steps | Expected |
| --- | --- | --- |
| LB-FORM-01 [E2E: library-local] | Select a verse → "Add note" | A note form opens (autofocused textarea); Save is **disabled** while empty (onMount validation). |
| LB-FORM-02 | Type a note → Save | Saves to the local-first store (✎ marker on the verse, persists in `lb-notes`); editor closes. |
| LB-FORM-03 | Empty/whitespace-only note | Validation message "Note can't be empty"; Save stays disabled. |
| LB-FORM-04 | Existing note → "Edit note" | Form opens prefilled; Save updates it; Delete removes it. |

---

## 22. Suite Q — Mobile responsiveness

Below the `lg` breakpoint (1024px) the reader's panels are **Base UI Drawer**
bottom-sheet drawers (tap-backdrop/Esc to close): the study panel and the book /
chapter / translation pickers. At `lg` and up the study panel is a non-modal
overlay rail under the header (it never shifts the reading) and the pickers are
Base UI menus / popover. Layout is driven by an SSR-safe `useIsDesktop()`
(`src/lib/use-media-query.ts`) — `false` until hydration, so the server renders
the desktop markup (CSS-hidden on mobile) and drawers only mount on real phones.
Words are studied with a **press-and-hold** on touch (the desktop two-click
flow isn't ergonomic once the modal sheet covers the text); a short tap still bubbles
to select the verse. Run these at a phone viewport (e.g. 390×844) with touch.
The e2e cases assert element **visibility** (not just presence — CSS-hidden
controls stay in the DOM, so they're checked with `toBeHidden`).

| ID | Steps | Expected |
| --- | --- | --- |
| LB-MOB-01 [E2E: mobile] | Phone viewport; open `/bible/john/3` and **tap verse 16** (a direct `?v=16` only scrolls + flashes now, see LB-READ-08) | The study panel is a **bottom-sheet drawer** (`[data-drawer]`) — verse view with "John 3:16" + verse text **visible**, and all actions visible (highlight swatches, Copy, Share, Compare, Add note, Study a word). Esc dismisses it. |
| LB-MOB-02 [E2E: mobile] | Press-and-hold a word ("God", G2316) | The word-study drawer opens directly (no verse step) — visible lemma θεός, "G2316", "Greek", the verse it came from as context, and "Other occurrences". |
| LB-MOB-03 [E2E: mobile] | In the word drawer, tap the "‹ John 1:1" context | Returns to the verse view in the same drawer (mutually exclusive — the word is deselected; "Add note" visible; "G2316" gone). |
| LB-MOB-04 [E2E: mobile] | Tap the chapter trigger in the reader header | A bottom-sheet drawer opens with the chapter grid (chapter links visible); tapping a chapter navigates and closes the sheet. |
| LB-MOB-05 [E2E: mobile] | Tap the book trigger | A Base UI drawer opens with "Old Testament" / "New Testament" labels + book links visible; tapping a book navigates and closes the sheet. |
| LB-MOB-06 [E2E: mobile] | Tap the translation trigger | A Base UI drawer opens with the translation list visible; tapping one navigates with `?translation=` and closes the sheet. |
| LB-MOB-07 [E2E: mobile] | Open the reader on a phone | The chapter picker + the version-picker trigger are visible (compare + interlinear live inside the picker); there are no standalone Compare / interlinear header controls; the "Home" label shows as just the ← arrow. |
| LB-MOB-08 [E2E: mobile] | Open `/compare/john/3` | Both translation columns render and are **visible** for verse 1; tighter gap + smaller serif; no horizontal page overflow (`scrollWidth ≤ innerWidth`). |
| LB-MOB-09 [E2E: mobile] | Open the signed-out home | Wordmark (`img` "lets.bible"), search box, and verse-of-the-day are visible; the ⌘K hint is hidden; no horizontal page overflow. |
| LB-MOB-10 | Returning home on a phone | Greeting + cards stack without overflow; the header drops "Listen". |
| LB-MOB-11 | Desktop (≥ `lg`) regression | Study panel is the side rail (no drawer); book/chapter/translation pickers are Base UI menus; header shows the Compare link + the interlinear toggle; two clicks on a word open the word view. (Covered by the desktop suites.) |
| LB-MOB-12 [E2E: mobile] | `/bible/genesis/1?view=interlinear`, tap a word | The interlinear word cell opens the word study **drawer** — God / H430 / "Hebrew". (Interlinear itself is Suite R.) |

---

## 23. Suite R — Interlinear view

A reading **mode** of the reader, launched per-translation from the version
picker (the `Aα` button) and carried in the URL as `?view=interlinear`. Words
render as borderless **centered stacks** — original-language lemma on top
(`bible.interlinear` joins each token to its lexicon entry; Greek in Noto Serif
`lang="el"`, Hebrew in Frank Ruhl Libre `lang="he" dir="rtl"`), then
transliteration, English gloss, and Strong's; articles (G3588 / "the") render
faded; gold verse-number badges sit inline. A **full-width controls bar** (a
second sticky header under the reader chrome) holds the Word-order toggle and
Lines chips (Translit / Gloss / Strong's / Parsing).

The Word-order toggle switches between two real layers (not just a stack flip):
- **Original** — a TRUE morphological interlinear from `bible.sourceInterlinear`
  (STEPBible TAGNT Greek / TAHOT Hebrew, CC BY 4.0, seeded into
  `bible_source_token`): the original-language words in ORIGINAL word order, each
  stacked as inflected surface / transliteration / contextual English / Strong's
  / **parsing**. The textual basis is per-translation (BSB → critical NA27/28,
  MSB → Byzantine). Hebrew tokens flow **right-to-left** (the verse-number gutter
  stays left). The **Parsing** chip is a live toggle here, decoding the
  morphology code (e.g. Greek `V-AAI-3S` → "Verb · Aorist Active Indicative · 3rd
  person · Singular"; Hebrew `Vqp3ms` → "Verb · Qal · Perfect · 3rd person ·
  Masculine · Singular") with the raw code on the visible line and the decode on
  hover (`title`).
- **English (reverse)** — the reading-order layer (`bible.interlinear`, English
  order with dictionary lemmas). The Parsing chip is inert in this mode.

Books without source tokens fall back to the reading-order layer (Parsing inert).
The OT Hebrew is seeded once (under the default translation); other translations'
OT falls back to it. Tapping a word reuses the study panel (overlay rail on
desktop, bottom sheet on mobile — see Suite Q), which shows the decoded parsing;
on desktop the panel starts below the controls bar. (Original-language strings
are asserted via `lang`/`dir` attributes — Hebrew vowel points vary by Unicode
normalization.)

| ID | Steps | Expected |
| --- | --- | --- |
| LB-IL-01 [E2E: interlinear] | Open `/bible/john/1?view=interlinear` | Defaults to the **Original** (forward) view: borderless token cells (`button[data-strong]`) in Greek word order stack the inflected surface form (`lang="el"`, e.g. λόγος) / transliteration / contextual English / Strong's ("G3056"). The version trigger shows the `Aα` interlinear indicator. |
| LB-IL-02 [E2E: interlinear] | Tap an interlinear word ("God", G2316) | The study panel opens (word view) with the lemma, "G2316", "Greek", and the verse it came from as context; the cell highlights. |
| LB-IL-10 [E2E: interlinear] | Select an interlinear word | The selected cell highlights via **background tint + inset ring + color only** — its size does **not** change (no font-weight change on the lemma/gloss), so selecting a word does not shift the surrounding layout. |
| LB-IL-03 [E2E: interlinear] | Open `/bible/genesis/1?view=interlinear` | Hebrew words render an `lang="he" dir="rtl"` inflected surface form, right-to-left; the cell shows its transliteration + English gloss ("In the beginning"). |
| LB-IL-04 [E2E: interlinear] | From `/bible/john/1`, open the version picker → the BSB row's `Aα`; then re-open and pick the translation name | The `Aα` button sets `?view=interlinear` (token cells appear); picking the translation name clears it (back to reading). |
| LB-IL-09 [E2E: interlinear] | In interlinear, toggle the "Strong's" Lines chip | The full-width controls bar shows "Word order" + "Lines"; toggling Strong's hides the per-token Strong's numbers (`data-strong` cells lose the visible `G####`). |
| LB-IL-05 | Interlinear with `Verse numbers` preference off | The inline gold verse-number badges are hidden (the token cells still render). |
| LB-IL-06 | Words-of-Christ verse in interlinear with red-letter on | The English surface of those words renders in red. |
| LB-IL-07 | A word whose Strong's isn't in the lexicon | The cell still shows the surface + Strong's; no lemma/translit/gloss lines (no error). |
| LB-IL-08 | Switch translation while in interlinear | Stays in interlinear (`?view` preserved); the words reload for the chosen translation. |
| LB-IL-11 | Open `/bible/john/3?view=interlinear` (default Original) | TRUE Greek order: the words render in original word order, **not** English order — e.g. John 3:1 starts Ἦν δὲ ἄνθρωπος ("was now a man"), and 3:16 starts οὕτως γὰρ ἠγάπησεν ὁ θεός (the verb ἠγάπησεν is 3rd, the subject θεός follows). The big token line is the **inflected** form (ἠγάπησεν, not the lemma ἀγαπάω). |
| LB-IL-12 | In interlinear, switch Word order to **English (reverse)** | Re-renders the reading-order layer (`bible.interlinear`): English order with dictionary lemmas below (e.g. "Now / there was / a man" over δέ / εἰμί / ἄνθρωπος). Switch back to **Original** → true source order returns. |
| LB-IL-13 | In Original mode, toggle the **Parsing** Lines chip on | Each token gains a parsing line showing the raw morph code (e.g. `V-AAI-3S`, `T-NSM`, `PREP`); hovering it shows the decoded grammar in the `title` (e.g. "Verb · Aorist Active Indicative · 3rd person · Singular"). |
| LB-IL-14 | Switch Word order to English (reverse) | The Parsing chip becomes **inert** (greyed, `title="Parsing isn't available for this passage yet"`) — parsing applies only to the true source layer. |
| LB-IL-15 | Open `/bible/genesis/1?view=interlinear` (Original) | TRUE Hebrew interlinear: tokens flow **right-to-left** (בְּרֵאשִׁית "in beginning" is the rightmost/first word, reading RTL to הָאָרֶץ "the earth"); the verse-number gutter stays on the left. With Parsing on, Hebrew codes decode (e.g. `Vqp3ms` → "Verb · Qal · Perfect · 3rd person · Masculine · Singular", `Td` → "Definite article"). |
| LB-IL-16 | Compare `/bible/john/3?view=interlinear&translation=BSB` vs `…&translation=MSB` at verse 16 | Different Greek per textual basis: BSB (critical) reads υἱὸν τὸν μονογενῆ (25 words); MSB (Byzantine) reads υἱὸν **αὐτοῦ** τὸν μονογενῆ (26 words — includes αὐτοῦ "of him"). |
| LB-IL-17 | Open `/bible/genesis/1?view=interlinear&translation=MSB` | Hebrew renders (via the OT fallback to the default translation's source tokens — MSB OT is not seeded separately; same Masoretic text). |
| LB-IL-18 | Tap a word in the true (Original) interlinear | The study panel's word view shows a **Parsing** section at the top — decoded grammar (e.g. "Adjective · Accusative · Singular · Masculine") with the raw code beneath — above the lexicon entry. |
| LB-IL-19 | Open an unseeded book's interlinear (if any remain) | Falls back to the reading-order layer; the Parsing chip is inert; no console error. |
| LB-IL-20 | Open `/bible/john/3?view=interlinear&translation=WEB` | WEB has **no English token layer**, so the "Word order" control is **hidden entirely** — no Original / English (reverse) toggle and no static chip (`reverseAvailable=false`); the Lines controls stay right-aligned. The view shows the TRUE Greek-order interlinear (Byzantine basis, like MSB): John 3:1 starts Ἦν δὲ ἄνθρωπος; tokens carry transliteration/English/Strong's and open word study on tap. (The `Aα` affordance shows for WEB because it has `bible_source_token` rows.) |
| LB-IL-21 | Open `/bible/genesis/1?view=interlinear&translation=WEB` | WEB OT interlinear renders **Hebrew RTL** via the OT fallback (WEB has no Hebrew of its own; falls back to the default translation's source tokens — same Masoretic text): בְּרֵאשִׁית "in beginning" H7225 is the rightmost/first word. The Word-order control is hidden (no toggle/chip — only the original view exists). |
| LB-IL-22 [E2E: interlinear] | Open `/bible/1-john/5?translation=KJV&view=interlinear` (Original) | KJV uses the **Textus Receptus** basis, so verse 7 renders the Comma Johanneum — Greek surface tokens incl. οὐρανῷ ("heaven"), πατήρ ("Father"), λόγος ("Word"), ἅγιον πνεῦμα ("Holy Spirit") — matching the KJV reading text. (The BSB/critical source omits it.) |

---

## 21. Quick regression checklist

A fast pass to run after any change:

1. `/bible/john/1` renders; verse numbers + red letter on.
1b. Chapter paging: desktop shows fixed side chevrons flanking the column (reading + interlinear); mobile hides them and **swipes** instead (left→next, right→prev; vertical scroll doesn't trigger it); a bottom prev/next nav shows on all viewports. Crosses book boundaries; Genesis 1 has no prev; all paths keep `?view=interlinear`.
2. Translation switch to MSB works; the version picker lists **four** translations (BSB/KJV/MSB/WEB), each with a muted attribution line. `/bible/john/3?translation=KJV` renders KJV prose (v16 "For God so loved the world…"); two-clicking "God" → θεός / G2316. KJV **red-letter** works (John 14 mostly red; Matthew 4:4 intro black + speech red), projected from BSB. (KJV is prose-only — no poetry/cross-refs; see §18.)
2b. **WEB** (`?translation=WEB`): John 3 renders with paragraphs + translator footnotes (a–d hover cards) + red-letter; v16 "…his only born Son…". Two-clicking a word does **not** open word study (no `bible_token`). `Aα` interlinear shows **Original only** (no "English (reverse)" toggle): John 3 Greek (Byzantine), Genesis 1 Hebrew RTL (OT fallback). Compare WEB↔KJV works. Attribution line at the reader bottom + on `/about`.
3. Double-click "God" in John 1 → study panel shows θεός / G2316.
4. One study panel: reading column is centered while idle; select a verse → verse view (highlight/copy/share/compare/note); click a word twice (or press-and-hold on touch) → word view with the verse as context, single highlight. Selecting a word clears the verse and vice-versa (mutually exclusive).
4b. Commentaries tab: select John 3:16 → verse view has **Verse**/**Commentaries**/**Media** tabs; Commentaries tab lists Calvin, Matthew Henry (×2, "on vv. 1–21"), Geneva, Wesley; click Calvin → detail (body + Source + back). Click verse 17 → still on Commentaries tab, still following Calvin (his note on v.17) — tab + work persist. (Requires `just lb-seed-commentaries`.)
4c. Media tab: select a verse the web corpus teaches (pick via preflight) → **Media** tab shows thumbnailed cards (title / channel · views / duration) ranked by views+recency; a card opens the lets.church media page at the verse's timestamp (`#t=`); "Search {ref} on lets.church →" opens `/search?bibleRefs=<token>`. A verse with none → empty state + search link. (Requires web `lc_media_v1` + `INTERNAL_API_TOKEN`; degrades gracefully when unset.)
5. Autocomplete (client-side FlexSearch, no debounce): `john` → book-jump widget (21-chapter grid); `john 3` → 36-verse grid; `john 3:16` → verse 16 + preview; click chapter fills bar, click verse navigates. `for God so loved the world` → JHN.3.16 ranked first in **Verses**; `in the beginning` → **Exact phrase** pill + **Creation** topic; scope dropdown switches BSB↔MSB. (Requires `public/search/*` from `just lb-flex`.)
6. `/search?q=fruit of the Spirit` → Galatians 5:22 first, highlighted.
7. `/search?q=Matthew 1:23` → cross-reference Isaiah 7:14 + related passages.
8. Genesis 2: "LORD" has a dotted underline + "Literally YHWH" hover card; set Divine name = Yahweh → "that Yahweh God" (article dropped); toggle Source-text overlays off → underlines gone.
8b. Matthew 1:23 (OT quotation): clicking "Behold" selects verse 23 (all quote lines highlight); a second click opens the study panel (G2400); hovering shows a "Quoting Isaiah 7:14" hover card whose link is clickable → `/bible/isaiah/7?v=14`.
8c. Overlays are render-time (not baked), so John 1:23's OT-quote underline appears on **BSB, MSB, and KJV** alike, and is **one continuous span** per line (not a dotted line per word; the in-between unanchored words are underlined too). `bible_token` is overlay-pure — divine/otQuote come from `seed/overlays/index.json` (reader: `apply-overlays.ts`; interlinear: `apply-tokens.ts`).
9. Sign in (`admin`/`password`) → returning home → sign out.
9b. Homepage **verse of the day** shows a real DB-backed verse (curated list, `src/lib/votd.ts`); reference links into the reader (e.g. Psalm 19:14 → `/bible/psalm/19?v=14`); stable across a same-day reload, no hydration mismatch.
10. Highlight John 3:16 (as guest) → tint persists across reload (localStorage) + appears in `/library`; "Continue reading" shows John 3; verse view "Study a word" opens the word view; translation dropdown renders above the header.
11. Sign in with local highlights present → "Sync your library" merge dialog → Merge → server `user_highlight` rows created; no SSR/console errors.
12. Reader renders chapters from `/reading/<id>/<slug>.json` (no DB); after the idle precache, block network + navigate to any chapter → still renders (SW `lb-content` cache). Settings → Offline shows the "works offline automatically" note (no download button).
12b. `/library` → Offline commentaries: Download a work (e.g. Geneva) → % then Remove; IndexedDB `commentary:*` keys appear. Simulate offline → that verse's Commentaries tab shows only the downloaded work (from IDB); online still shows all. Remove → keys gone, back to Download.
13. Select verse → Add note (TanStack Form): Save disabled while empty; type + Save → ✎ marker + persists.
14. `/callback?state=x&code=y` (no cookie) → `/?error=state`.
14b. Phone viewport (≈390px): select a verse → study panel is a bottom-sheet drawer; press-and-hold a word → word-study drawer; tap the version trigger → picker drawer with Compare + interlinear (Aα) buttons per row; compare + homepage fit without horizontal scroll. Desktop (≥1024px): study panel is a non-modal overlay rail that doesn't shift the reading; two-click word study; reading centered while idle.
14c. Header `Aα` toggle → `?view=interlinear`. **Original** (default): true source order — John 3 starts Ἦν δὲ ἄνθρωπος; toggle **Parsing** on → morph codes + decoded hover; Genesis 1 flows RTL (בְּרֵאשִׁית rightmost). **English (reverse)**: reading order (English over lemmas), Parsing chip inert. MSB John 3:16 includes αὐτοῦ (Byzantine); BSB omits it. Tapping a word opens the study panel (with a Parsing section) — rail desktop / drawer mobile.
15. `tsc` + `biome` clean; no console errors on the main routes.
```
docker compose exec letsbible sh -c 'cd /usr/src/app/packages/lets.bible && pnpm exec tsc'
cd packages/lets.bible && pnpm exec biome check src
```
