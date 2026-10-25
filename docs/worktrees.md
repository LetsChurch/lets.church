# Parallel development with worktrees

Every checkout of this repo, whether the primary one or any `git worktree`,
runs **its own app containers** (web, lets.bible, workers) against **one shared
set of infrastructure** (Postgres, OpenSearch, Temporal, Valkey, Mailpit,
imgproxy, the download service, and a Traefik HTTPS router). A worktree costs a
few Node containers instead of a second OpenSearch and Temporal, and it gets
its own data, so migrations, reindexes and seeds on one branch never touch
another.

```
                    ┌──────────── lc-infra (docker-compose.infra.yml) ───────────┐
browser ──https──▶  │ traefik ─▶ *.lc.localhost / *.lb.localhost / *.infra.localhost│
                    │ postgres  opensearch  temporal  valkey  mailpit  imgproxy  …│
                    └───────────────▲──────────────────▲────────────────▲──────────┘
                                    │  network lc-infra │                │
               letschurch_dev (primary)        lc-feat-a          lc-feat-b    ← docker-compose.yml
```

## Quick start

Run `mkcert -install` once per machine first (see the README's development
setup). Then create a worktree and its stack with worktrunk (`wt`, also in `shell.nix`):

```sh
wt switch --create feat-a        # creates ../lets.church.feat-a; hooks run `just wt-up`
wt list                          # shows each worktree's URL
wt remove feat-a                 # hooks run `just wt-down` first
```

The first `wt` run asks you to approve the project hooks in `.config/wt.toml`.
`post-start` runs in the background; follow it with `wt config state logs`.

With plain `git worktree`, run the same steps yourself:

```sh
git worktree add -b feat-a ../lets.church.feat-a kyrios
cd ../lets.church.feat-a && direnv allow
just wt-up              # or `just wt-up fresh` to seed from empty databases
just wt-info            # URLs and resource names
just wt-down            # before `git worktree remove`
```

Then open `https://feat-a.lc.localhost`. Sign in with the usual seed accounts
(see `docs/seed-data.md`).

## What each checkout gets

`.envrc` derives everything from `LC_WT`, the worktree name. For worktrunk's
`lets.church.<branch>` directories that's the branch name, lowercased and
DNS-safe. The primary checkout is always `main` and keeps the names it had
before worktrees existed, so existing data and URLs keep working. Set `LC_WT`
(or any variable below) in a worktree's `.envrc.local` to override it.

| | Primary checkout (`main`) | Worktree `feat-a` |
| --- | --- | --- |
| Compose project | `letschurch_dev` | `lc-feat-a` |
| URLs | https://main.lc.localhost / https://main.lb.localhost | https://feat-a.lc.localhost / https://feat-a.lb.localhost |
| Postgres DBs | `letschurch`, `letsbible` | `letschurch_feat_a`, `letsbible_feat_a` |
| OpenSearch (`OPENSEARCH_INDEX_PREFIX`) | none: `lc_media_v1`, … | `feat-a__lc_media_v1`, …, and pipelines |
| Temporal (`TEMPORAL_NAMESPACE`) | `default` | `lc-feat-a` |
| Valkey (`LC_VALKEY_DB`) | DB 0 | DB 1–255, hashed from the name |
| Compose profiles | `storybook,webhooks,transcribe` | none |

A worktree also inherits the primary checkout's `.envrc.local` (API keys,
storage credentials) before applying its own. Object storage buckets are
shared, which is fine because upload keys are UUIDs.

### Profiles

Worktrees skip the heavy or singleton services by default. Turn them on in the
worktree's `.envrc.local`, e.g. `export COMPOSE_PROFILES=transcribe`:

- `transcribe`: the Whisper worker (several GB of models). Without it, uploads
  stop at transcription.
- `webhooks`: the Mux and Stripe forwarders. Every listener receives every
  event for the account, so run them in one checkout at a time.
- `storybook`: https://feat-a.storybook.localhost and
  https://feat-a.storybook-lb.localhost.

### HTTPS and hostnames

Traefik listens on `127.0.0.1:80/443`, redirects HTTP to HTTPS, and routes by
Docker labels. `just wt-cert` (run by `start`, `infra-up` and `wt-up`) issues mkcert
certificates into `$LC_DEV_HOME/traefik` (default
`~/.local/share/letschurch-dev/traefik`), which Traefik picks up without a
restart. A wildcard only covers one label, so each worktree has its own
certificate for `feat-a.lc.localhost`, `*.feat-a.lc.localhost` (church websites),
`feat-a.lb.localhost` and the storybook hosts.

Shared hosts:

- https://temporal.infra.localhost (switch namespaces in the UI)
- https://mail.infra.localhost
- https://listmonk.infra.localhost
- https://imgproxy.infra.localhost, https://download.infra.localhost
- https://traefik.infra.localhost (router dashboard)

Every checkout, the primary one included, uses HTTPS routing by default
(`LC_ROUTING=https`), and `WEB_URL`, OIDC, cookies and links all follow its
hostname. For plain http://localhost:4000 (web) and :4001 (lets.bible) instead,
set `export LC_ROUTING=ports` in that checkout's `.envrc.local` and run `just
start`. Only one checkout can use the ports at a time.

HTTPS makes session cookies `Secure` (they follow `WEB_URL`'s scheme), as in
production. Containers never call the public `https://` URLs; back-channel
calls use the internal aliases below, so containers don't need to trust the CA.

## How it works

- **`docker-compose.infra.yml`** is the `lc-infra` project. `just infra …`
  (`scripts/dev-env.sh infra`) always runs it from the primary checkout's
  directory, so its bind mounts never point into a worktree that gets deleted.
  Its data volumes keep the pre-split names (`letschurch_dev_pg-data`,
  `letschurch_dev_os-data`). Compose warns that another project created them;
  that's expected.
- **`docker-compose.yml`** holds only this checkout's app services, and its
  default network is the external `lc-infra` network. Because every stack
  shares that network, **bare service names aren't unique across stacks**:
  `web` could resolve to any checkout's web container. Address another app
  container by its per-checkout alias, `http://web.${LC_WT}.internal:3000`
  (Vite allows `.internal` hosts). Infrastructure names (`postgres`,
  `opensearch`, `temporal`, `valkey`, `mailpit`) are unique and fine.
- **`docker-compose.ports.yml`** adds the host ports, for the opt-in `ports` routing only
  (`.envrc` puts it in `COMPOSE_FILE`).
- **Index names** come from `packages/opensearch/src/indices.ts` and
  `packages/lets.bible/src/search/client.ts`. Use those constants, never a
  `'lc_*'` literal: a literal would read the primary checkout's index from
  inside a worktree.
- **Temporal** clients and workers read `TEMPORAL_NAMESPACE` (default
  `default`). The per-checkout `temporal-namespace-setup` service creates the
  namespace and its search attributes, and `just temporal …` runs the CLI in
  it.

### `just wt-up` (`clone`, the default)

1. Starts `lc-infra` if needed. It refuses to start while a container from
   another project still mounts the Postgres volume, because two Postgres
   servers on one data directory corrupt it.
2. Issues certificates.
3. Copies `letschurch` and `letsbible` into the worktree's databases with
   `CREATE DATABASE … TEMPLATE`. That needs the source to have no connections,
   so the primary checkout's app is cut off for the seconds the copy takes. It
   reconnects on its own.
4. Clones every primary index (`lc_*`, `lets_bible_*`) with OpenSearch's
   `_clone` API. Segments are hard-linked, so this is fast and cheap on disk,
   but the source is write-blocked for that moment.
5. Builds and starts the app containers, then runs `just init` (migrations,
   mappings and pipelines, schedules), `lb-migrate`, `lb-es-push` and `lb-flex`.

`fresh` mode creates empty databases, skips the index clones, and runs
`seed-db` and `lb-up` instead. It reuses the shared buckets, so it doesn't
re-upload S3 seed data.

### `just wt-down`

Removes the worktree's containers and anonymous volumes, drops its two
databases (`WITH (FORCE)`), deletes every `<LC_WT>__*` index and its two
pipelines, deletes the Temporal namespace, flushes its Valkey DB, and removes
its certificate. It refuses to run in the primary checkout, and refuses an index
prefix that doesn't end in `__`.

## Recipes

| Recipe | What it does |
| --- | --- |
| `just infra-up` / `infra-stop` | Start (and wait for) / stop the shared infrastructure |
| `just infra <compose args>` | e.g. `just infra logs -f postgres`, `just infra ps` |
| `just infra-prune` | Delete the shared data volumes: **every** checkout's data |
| `just wt-up [clone\|fresh]` / `wt-down` / `wt-info` / `wt-cert` | Per-worktree lifecycle, above |
| `just start` / `stop` | This checkout's app containers (`start` runs `infra-up` first) |
| `just up` | Primary checkout: start, migrate, seed everything |
| `just reset` | Worktree: `wt-down` + `wt-up fresh`. Primary: wipes the shared infrastructure |
| `just temporal …` | Temporal CLI in this checkout's namespace |

Host tools connect to the shared infra ports as before (`HOST_DATABASE_URL`
points at this checkout's database).

## Moving an existing single-stack setup over

The old layout ran Postgres and friends inside the `letschurch_dev` project.
Once the primary checkout is on a branch that has this layout:

```sh
docker compose down        # in the primary checkout, with the OLD compose file; volumes are kept
git pull                   # or check out the branch with docker-compose.infra.yml
direnv allow
just start                 # starts lc-infra on the same pg/os volumes, then the app
```

The app moves from http://localhost:4000 to https://main.lc.localhost (lets.bible:
https://main.lb.localhost); `LC_ROUTING=ports` keeps the old URLs.

`OPENSEARCH_JAVA_OPTS` now configures the shared OpenSearch heap (default
`-Xms512m -Xmx512m`). Set it in `.envrc.local` rather than overriding the
`opensearch` service in `docker-compose.override.yml`. Because `.envrc` sets
`COMPOSE_FILE`, Compose no longer auto-loads that override file at all; add it
to `COMPOSE_FILE` in `.envrc.local` if you still need app-service overrides.

## Agent instructions in worktrees

`AGENTS.md` is the committed instruction file, which Claude Code and Codex
both read. Don't add a `CLAUDE.md` or `CLAUDE.local.md`: Claude Code reads
`AGENTS.md` only when neither exists. Personal notes go in a gitignored
`AGENTS.local.md` at the repo root, which `AGENTS.md` imports. The `pre-start`
hook copies it from the primary checkout into each new worktree
(`.worktreeinclude`), and Claude Code's own worktrees read the same list. Keep it a regular file: Claude Code treats a symlink that
points outside the repo as an external import, which loads only after you
approve it interactively and never in headless runs or subagents. Edits to the
primary copy don't reach existing worktrees.

## Caveats

- Nested worktrees (`.claude/worktrees/*`) work, but are named after their
  directory (`agent-…`). Give them `just wt-up` only when they need a running
  app; type checks and tests don't.
- `just wt-down` needs the infrastructure up and starts it if it isn't. If a
  worktree directory is deleted without it, its databases
  (`letschurch_<name>`, `letsbible_<name>`), `<name>__*` indices, and
  `lc-<name>` namespace stay behind. Recreate the worktree at the same path
  and run `just wt-down`, or remove them by hand.
- The `.internal` alias rule applies to new code too. A new `http://web:3000`
  in compose or config will hit a random checkout's web container.
