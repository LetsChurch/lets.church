# Linting & formatting: oxc (oxlint + oxfmt)

The monorepo uses the **oxc** toolchain for linting and formatting, replacing
Biome (removed 2026-07-07):

- **[oxlint](https://oxc.rs/docs/guide/usage/linter)** `1.73.0` — the linter.
- **[oxfmt](https://oxc.rs/docs/guide/usage/formatter)** `0.58.0` — the
  Prettier-compatible formatter.

Both are pinned in the pnpm catalog (`pnpm-workspace.yaml`) and installed as a
devDependency of every package.

## Running

Each package exposes the same scripts (aggregated by `pnpm run /^check:/`, which
is what `just check` / CI's `pnpm -r run check` invoke):

| Script | Command | Purpose |
| --- | --- | --- |
| `check:lint` | `oxlint` | Lint (errors fail the build) |
| `check:fmt` | `oxfmt --check` | Formatting must be clean |
| `check:ts` | `tsc` / `tsc --noEmit` | Typecheck |
| `fix` | `oxfmt && oxlint --fix` | Format + apply safe lint fixes |
| `fix!` | `oxfmt && oxlint --fix-dangerously` | Also apply risky/suggestion fixes |

The root package's `check:lint` / `check:fmt` target `scripts/` explicitly
(`oxlint scripts`, `oxfmt --check scripts`), mirroring Biome's old root scope.

## Configuration

- **`.oxlintrc.json`** (repo root) — base lint config; oxlint auto-discovers it
  from each package's cwd by walking up.
- **`packages/web/.oxlintrc.json`** — `extends` the root config and adds the
  `no-restricted-imports` rule that blocks importing temporal activities into the
  web app. **It re-declares `plugins`** — a child config that omits `plugins`
  falls back to oxlint's defaults (which include `unicorn`/`react`), so every
  config that sets rules must also pin the plugin set.
- **`.oxfmtrc.json`** (repo root) — single formatter config, auto-discovered from
  subdirectories. `sortImports` (organize imports), `sortTailwindcss` (official
  prettier-plugin-tailwindcss ordering), and `sortPackageJson` are all enabled.

Generated/committed artifacts (`**/*.gen.*`, `**/*.module.css.d.ts`,
`**/generated/**`) are excluded via `ignorePatterns` in both configs.

## Rule mapping from Biome

| Biome rule | oxc equivalent |
| --- | --- |
| `style/useImportType` | `typescript/consistent-type-imports` (`disallowTypeAnnotations: false`, to match Biome's tolerance of `import()` type annotations) |
| `style/useExportType` | `typescript/consistent-type-exports` |
| `style/useConsistentTypeDefinitions` (`type`) | `typescript/consistent-type-definitions` (`"type"`) |
| `suspicious/noExplicitAny` | `typescript/no-explicit-any` |
| `complexity/noBannedTypes` | `typescript/no-empty-object-type` |
| `correctness/noUnusedVariables` | `no-unused-vars` (tuned: `args: "none"`, `^_` ignore patterns — matches Biome's underscore convention and its not enforcing unused params) |
| `style/noRestrictedImports` (web) | `no-restricted-imports` |
| `recommended: true` | oxlint `categories.correctness: "error"` |
| `assist/organizeImports` | oxfmt `sortImports` (perfectionist algorithm — different ordering, no unused-import removal) |
| `nursery/useSortedClasses` | oxfmt `sortTailwindcss` (official Tailwind ordering) |

Suppression comments were converted `biome-ignore lint/<group>/<rule>: …` →
`oxlint-disable-next-line <plugin>/<rule> -- …`.

## Coverage gaps (no faithful oxc equivalent)

These Biome behaviors are **not** enforced under oxc. They were dormant
suppressions or unmappable rules; their `biome-ignore` comments were converted to
the closest oxlint rule name (harmless no-op unless the plugin is enabled) or to
plain explanatory comments.

- **jsx-a11y rules** (`useSemanticElements`, `noStaticElementInteractions`,
  `useKeyWithClickEvents`, `noAutofocus`, `noLabelWithoutControl`). oxlint's
  `jsx-a11y` plugin is a *different, stricter* inventory that flags ~15 sites
  Biome never did, so it isn't enabled. The suppression comments are mapped to
  `jsx-a11y/*` names and ready if the team later opts in (and triages the new
  sites). **Recommended follow-up given the project's a11y focus.**
- **CSS linting** (`complexity/noImportantStyles`) — oxlint does not lint CSS at
  all. oxfmt formats CSS but has no lint rules.
- **`correctness/noUndeclaredDependencies`** — no oxlint equivalent.
- **`suspicious/noDocumentCookie`**, **`suspicious/noAssignInExpressions`** — no
  active oxlint equivalent (the latter's parenthesized-assignment pattern is
  allowed by `no-cond-assign` anyway).
- **`unicorn`/`react` rules** are intentionally **off** (Biome never enforced
  them); enabling them surfaces unrelated new violations.
