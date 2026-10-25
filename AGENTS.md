# Agent instructions

Personal, uncommitted instructions may live in `AGENTS.local.md` at the repo
root (gitignored; worktrunk copies it into new worktrees). If it exists, read
it and follow it; where it conflicts with this file, it wins.

@AGENTS.local.md

# Committing

Do not stage or commit changes unless the user explicitly asks.

# Security

`docs/security.md` is the canonical reference for our application-level
security **principles** and the shared helper that implements each one:
constrain untrusted input at the boundary, treat user-influenced outbound
requests as SSRF, encode output for its exact sink, derive authorization from the
authenticated principal (never trust client-supplied ids), keep secrets out of
logs, bound client-controlled quantities, and origin-validate redirects.

**Read it before, and keep it in sync when, you touch any of those areas.** Reuse
the canonical helper (`safeFetch`/`assertPublicUrl`, `escapeHtml`, `isSafeUrl`/
`safeHttpHref`, `canViewMedia`/`canViewMediaById`, `redactSensitive`,
`safeRedirect`) rather than hand-rolling a parallel check that can drift. The doc
ends with a contributor checklist — use it.

# Temporal imports in the web app (SSR bundling)

In `packages/web`, **never `import` a runtime _value_ from `@temporalio/client`
(or `@temporalio/common`).** Vite/Rollup "sees through" the package's CJS barrel
and emits a broken **extensionless** deep import into the SSR/Nitro bundle (e.g.
`@temporalio/common/lib/errors` instead of `…/errors.js`). Node's ESM loader
can't resolve it, so it throws `ERR_MODULE_NOT_FOUND` at runtime on **every**
route — including the readiness probe — which 500s the pod and wedges the
Kubernetes rollout. (temporalio/sdk-typescript#2098.)

- **Type-only is fine and required**: `import type { … } from '@temporalio/client'`.
- For runtime values (the `Client`, etc.) use the `createRequire` /
  `requireFromHere(...)` pattern in `packages/web/src/temporal/index.ts`, which
  keeps the package fully opaque to the bundler.
- **Don't `instanceof` Temporal error classes** (that needs a value import).
  Match by name instead, e.g. `err instanceof Error && err.name ===
  'WorkflowNotFoundError'` — Temporal sets `.name` via its
  `SymbolBasedInstanceOfError` decorator.
- This compiles and typechecks fine; it only fails in the **SSR build**. After
  touching anything that imports temporal modules, verify with
  `pnpm --filter @letschurch/web run build` (not just `check:ts`) and confirm no
  extensionless `@temporalio/*` import landed in `.output/server`.

# UI components & accessibility

Accessibility and solid foundations are a priority. Reach for **Base UI**
(`@base-ui-components/react`) for interactive primitives instead of hand-rolling
them — hand-built widgets almost always miss focus management, keyboard
navigation, dismissal, and ARIA roles/labels.

- Use Base UI for things like dialogs/modals, popovers, menus, selects, combobox/
  autocomplete, tooltips, tabs, switches, accordions, and toggle groups. Don't
  re-implement these from scratch (no ad-hoc `useState` open/close + absolute
  divs + manual outside-click backdrops).
- Base UI is headless/unstyled — style it with Tailwind, matching the package's
  design tokens. Follow the existing patterns: `packages/web/src/components/`
  (`lc-menu.tsx`, `avatar.tsx`, `search-bar.tsx` using `Autocomplete`) and
  `packages/lets.bible/src/components/`.
- Keep the accessibility Base UI gives you: real `combobox`/`listbox`/`menu`/
  `dialog` roles, keyboard operability, visible focus states, and labels. When
  wrapping a primitive, use its `render` prop to compose your element (e.g. a
  router `<Link>` or `<a>`) rather than nesting interactive elements.
- Only hand-roll a control when no Base UI primitive fits — and then still cover
  keyboard interaction, focus, and ARIA, and call out the gap.

# Search (OpenSearch)

When a single request needs to run **more than one** OpenSearch query, prefer
one **Multi Search** (`osMsearch`) call over several parallel `osSearch` calls —
whenever it's technically feasible. One round trip to the cluster is cheaper
than N (less connection/HTTP overhead, one set of shard fan-outs), and the
responses come back in a single, ordered array.

- This applies to `Promise.all([osSearch(...), osSearch(...)])`-style code:
  collapse it into `osMsearch([header, body, header, body, ...])` and read
  `response.responses[i]` per query.
- Existing patterns to follow: `packages/web/src/trpc/procedures/search.ts` and
  `church.ts` build their request bodies with the `msearch*` helpers in
  `@letschurch/opensearch` and parse with `MSearchResponseSchema`. lets.bible
  has its own `osMsearch` in `packages/lets.bible/src/search/client.ts`; build
  its request bodies in `packages/lets.bible/src/search`.
- A single query is just `osSearch`; `osMsearch` is only for batching 2+.
  Don't contort genuinely independent, conditionally-issued queries into one
  msearch if it hurts readability and they rarely co-occur — but the default,
  when you're already firing several searches together, is msearch.

# lets.bible — keep the testing plan current

`docs/letsbible-e2e-testing.md` is the living end-to-end test plan for
`packages/lets.bible`. **Any user-facing feature or behavior change you make to
lets.bible must update that plan in the same change** — it should never lag the
app.

When adding/changing a feature:
- Add a new **Suite** (or extend the closest existing one) with cases in the
  `Preconditions → Steps → Expected` format, using stable `LB-<area>-<n>` IDs
  (don't renumber existing IDs; append).
- Update **§1 Scope** (the in-scope bullet list) and, when something moves from
  mocked to real, the **Known mocked / not-implemented** section.
- Add a line to the **Quick regression checklist** for anything on a hot path.
- If setup changed (new seed/index step, new migration, new env, new account),
  update **§2 Environment & prerequisites** and the data-integrity preflight.

The plan and the actual tests must stay in lock-step, in **both** directions:
- **Implement a test → update the plan in the same change.** When you write or
  change an automated test (Playwright spec, Vitest, etc.) for lets.bible, find
  the matching `LB-<area>-<n>` case and reflect it — add the case if it's new,
  mark it as automated, and reference the spec file/test name so the plan shows
  what's covered by automation vs. still manual. If a test's behavior diverges
  from the plan, the plan is what's wrong — fix it.
- **No silent coverage drift.** Don't add a test without a corresponding plan
  case, and don't delete/rename a test without updating (not orphaning) its case.

Ground every Expected in real, observed behavior (verify in the browser /
Playwright first), not aspirations.

# Database migrations

Always generate migrations using the Drizzle tooling — never write migration SQL or edit `_journal.json` by hand:

```
just db-generate <name>
```

This runs `drizzle-kit generate` inside the container, which diffs the current schema against the last snapshot and produces both the SQL file and the updated snapshot in `packages/db/drizzle/meta/`. Hand-written migrations will desync the snapshot and break future generation.

To apply pending migrations:

```
just db-migrate
```

## Resolving migration conflicts during rebase

When two branches each add a migration at the same index (e.g. both add `0013`), do **not** hand-merge the SQL, snapshots, or `_journal.json`. Instead, keep the base branch's migrations and regenerate yours on top:

1. Rebase onto the base branch. Resolve any non-migration code conflicts (e.g. `schema.ts`, route files) normally — make sure the merged `schema.ts` contains **both** branches' schema changes.
2. For the conflicting migration artifacts, take the base branch's versions and discard your own:
   - `git checkout --ours packages/db/drizzle/meta/_journal.json packages/db/drizzle/meta/<NNNN>_snapshot.json` (during a rebase, `--ours` is the branch you're rebasing onto)
   - `git rm packages/db/drizzle/<NNNN>_<your-migration>.sql`
   - Stage the resolved files and finish the rebase (`git rebase --continue`).
3. Regenerate your migration so it diffs against the base branch's latest snapshot and gets the next free index:
   ```
   just db-generate <name>
   ```
   This produces a fresh `<NNNN+k>_<name>.sql`, its snapshot, and a new `_journal.json` entry.
4. Fold the regenerated artifacts back into your commit (`git add` the new SQL/snapshot/`_journal.json`, then `git commit --amend`) so the commit stays self-contained.
5. Verify the rewritten migration applies cleanly with `just db-migrate`.

The regenerated SQL should be an exact subset of your original migration (only your schema delta, nothing from the base branch). If it contains unexpected statements, the merged `schema.ts` is wrong.

# `@fontsource-variable/*` ambient declaration (revisit on toolchain bumps)

Both apps self-host fonts via bare side-effect imports (e.g.
`import '@fontsource-variable/hanken-grotesk'`). Those specifiers resolve through
the package `exports` map to a plain `index.css`, which vite/client's `*.css`
ambient module does **not** cover (it matches on the specifier string, so only
paths literally ending in `.css` qualify). TypeScript 5.x accepted this silently;
the 6.0 → 7.0 line (we're on `7.0.1-rc`) emits **TS2882** on each. Both
`packages/web/src/vite-env.d.ts` and `packages/lets.bible/src/vite-env.d.ts`
therefore carry a `declare module '@fontsource-variable/*';` shim.

**When bumping `typescript`, `vite`, or `@fontsource-variable/*`, check whether
this shim is still needed** — if the toolchain starts providing the declaration
(e.g. vite/client widens its glob, or fontsource ships `.d.ts`), delete the shim
rather than leave it masking a real resolution regression. To verify: temporarily
remove the `declare module` line and run `pnpm --filter @letschurch/web run
check:ts` and `pnpm --filter @letschurch/lets.bible run check:ts`. No TS2882 →
the shim is dead and can go. Errors return → keep it.

# Linting & formatting: oxc (oxlint + oxfmt), not Biome

We use **oxlint** (lint) + **oxfmt** (format) — Biome was removed. Full reference:
`docs/lint-format-oxc.md`. The essentials:

- Per package: `check:lint` (`oxlint`) and `check:fmt` (`oxfmt --check`) run
  alongside `check:ts`; `fix` = `oxfmt && oxlint --fix`. Both tools auto-discover
  the root `.oxlintrc.json` / `.oxfmtrc.json` by walking up from cwd. A change
  isn't "clean" until oxlint **and** oxfmt pass, not just `tsc`.
- **Suppress with `// oxlint-disable-next-line <plugin>/<rule> -- reason`** (e.g.
  `typescript/no-explicit-any`), never `biome-ignore`.
- Any oxlint config that sets `rules` **must also pin `plugins`**
  (`["typescript", "oxc"]`) — a config that omits `plugins` silently falls back to
  oxlint's defaults (unicorn/react on), resurfacing rules we don't enforce. See
  `packages/web/.oxlintrc.json`.
- Not enforced under oxc (documented gaps in the doc): jsx-a11y rules, CSS lint
  (`noImportantStyles`), `noUndeclaredDependencies`. Don't assume a11y/CSS lint
  coverage exists.

# Dev environment: shared infrastructure + worktrees

`docs/worktrees.md` is the reference. Postgres, OpenSearch, Temporal, Valkey,
Mailpit, imgproxy and the Traefik HTTPS router run once (`lc-infra`,
`docker-compose.infra.yml`); each checkout (the primary one, or any `git
worktree`) runs only its app containers (`docker-compose.yml`), isolated by
database name, OpenSearch index prefix, Temporal namespace and Valkey DB, all
derived from `LC_WT` in `.envrc`.

- **All stacks share one Docker network.** Never address an app container by
  its bare service name (`http://web:3000`): that can reach another checkout's
  container. Use the per-checkout alias `http://web.${LC_WT}.internal:3000`.
- **Never hardcode an index or search-pipeline name** (`'lc_media_v1'`,
  `'lets_bible_verses'`, …). Use the constants in
  `packages/opensearch/src/indices.ts` and
  `packages/lets.bible/src/search/client.ts`, which apply
  `OPENSEARCH_INDEX_PREFIX`.
- **Temporal clients and workers must pass `namespace: TEMPORAL_NAMESPACE`**
  (default `default`), like the existing workers do.
- In a worktree, `just wt-up` provisions and starts its stack and `just wt-down`
  deletes it. A worktree that only needs typecheck, lint, or tests doesn't need
  a stack.
