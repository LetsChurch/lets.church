# Plan 001: Restore intentional Prisma-to-Drizzle schema parity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update this plan's status row in
> `plans/README.md`, unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 0f7479e5..HEAD -- \
>   packages/db \
>   packages/web/src/trpc/procedures/dashboard/channels.ts \
>   .github/workflows/ci.yml
> git diff --stat -- \
>   packages/db \
>   packages/web/src/trpc/procedures/dashboard/channels.ts \
>   .github/workflows/ci.yml
> ```
>
> This plan was written while the squashed donation/auth/CITEXT migration
> `0022` and its schema changes were uncommitted. Before implementation, those changes must
> have been committed or otherwise stabilized. If the live code differs from
> the "Current state" below, reconcile the plan against the live schema before
> editing anything. Missing CITEXT work, renumbered migrations, or overlapping
> schema changes are STOP conditions.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: donation/auth/CITEXT migration `0022` being committed
  and reviewed
- **Category**: migration, correctness, performance, tests
- **Planned at**: commit `0f7479e5`, 2026-07-29

## Why this matters

The legacy Prisma schema and current Drizzle schema agree on most tables,
columns, enums, keys, and database-specific types after the CITEXT repair.
However, the original conversion systematically omitted all 27 falsy database
defaults, all 32 non-unique legacy indexes, and ten `varchar(n)` bounds. Three
optional foreign keys also changed from `ON DELETE SET NULL` to `CASCADE`
without a forward migration, so a database upgraded from Prisma can behave
differently from a database created from the Drizzle baseline.

This plan makes the intended legacy behavior explicit in `schema.ts`, repairs
both fresh and upgraded databases with a new forward migration, restores
Prisma's `@updatedAt` runtime behavior in Drizzle, corrects one relation
cardinality, and adds a permanent parity test that constructs both database
histories.

## Current state

### Repository and migration conventions

- `packages/db/prisma/schema.prisma` is the frozen legacy source of truth used
  for this parity audit. It contains 35 models and 20 enums.
- `packages/db/src/schema.ts` is the active Drizzle schema.
- `packages/db/drizzle/0000_baseline.sql` creates fresh databases.
- Existing Prisma-managed databases historically skipped the baseline and then
  applied Drizzle forward migrations. Consequently, an object omitted from
  `0000_baseline.sql` may still exist in an upgraded database.
- `packages/db/drizzle/0022_donations_auth_participation.sql` is the
  current, uncommitted precedent for catalog-aware repair across differently
  shaped databases.
- `CLAUDE.md` requires migrations to be generated with:

  ```sh
  just db-generate <name>
  ```

  Never hand-edit `_journal.json` or snapshot JSON. This parity repair cannot
  safely use Drizzle Kit's raw generated SQL unchanged because some target
  indexes and constraints already exist in Prisma-upgraded databases under
  legacy names. Generate the migration and metadata first. Harden only the
  generated SQL file as described below, preserving the generated snapshot and
  journal. The maintainer's requirement that this be a safe forward migration
  is the narrow justification for that exception. If the maintainer does not
  approve that exception at execution time, stop before generating the
  migration.

- The installed `drizzle-orm` PostgreSQL migrator wraps pending migrations in a
  transaction. Do not use `.concurrently()` in `schema.ts`: PostgreSQL rejects
  `CREATE INDEX CONCURRENTLY` inside a transaction.

### Parity already established and not to be undone

The following differences are intentional or already reconciled:

- The custom `citext` type and all restored CITEXT identity columns in
  `packages/db/src/schema.ts:24-30` and migration `0022`.
- `app_user.password` is nullable for passwordless email sign-in.
- `channel_invitation.invited_by_id`,
  `organization_invitation.invited_by_id`, and
  `channel_import_source.created_by_id` are nullable with `ON DELETE SET NULL`.
- Cascades deliberately introduced by
  `packages/db/drizzle/0001_fix_upload_view_second_fk.sql`.
- `organization_tag.slug` is now a primary key.
- `upload_record_download_size` was deliberately removed by migration `0016`.
- New auth, donations, OIDC, streaming, transcript, annotation, speaker,
  storage-audit, site-config, and LLM tables and columns.
- The 20 shared PostgreSQL enum names and values already match exactly.

Do not revert any of these while restoring the targets below.

### Target A: restore 27 database defaults

The legacy schema declares all of these defaults. The active Drizzle schema
currently has `.notNull()` without `.default(...)`.

| Table                                   | Columns                                                          | Required default |
| --------------------------------------- | ---------------------------------------------------------------- | ---------------- |
| `organization`                          | `automatically_approve_organization_associations`                | `false`          |
| `organization_membership`               | `is_admin`, `can_edit`                                           | `false`          |
| `organization_invitation`               | `is_admin`, `can_edit`                                           | `false`          |
| `organization_organization_association` | `upstream_approved`, `downstream_approved`                       | `false`          |
| `organization_channel_association`      | `official_channel`                                               | `false`          |
| `channel_membership`                    | `is_admin`, `can_edit`, `can_download`                           | `false`          |
| `channel_invitation`                    | `is_admin`, `can_edit`, `can_download`                           | `false`          |
| `upload_record`                         | `upload_finalized`                                               | `false`          |
| `upload_record`                         | `transcoding_progress`, `score`                                  | `0`              |
| `upload_user_comment`                   | `score`                                                          | `0`              |
| `search_log_entry`                      | `media_count`, `transcript_count`, `channel_count`               | `0`              |
| `newsletter_mailing_list`               | `subscribe_on_registration`                                      | `false`          |
| `channel_import_source`                 | `deduplication_enabled`                                          | `false`          |
| `channel_import_run`                    | `items_found`, `items_imported`, `items_skipped`, `items_failed` | `0`              |

Examples of the omission:

```ts
// packages/db/src/schema.ts:813-815
automaticallyApproveOrganizationAssociations: boolean(
  'automatically_approve_organization_associations',
).notNull(),

// packages/db/src/schema.ts:1321
uploadFinalized: boolean('upload_finalized').notNull(),

// packages/db/src/schema.ts:2204-2207
itemsFound: integer('items_found').notNull(),
itemsImported: integer('items_imported').notNull(),
itemsSkipped: integer('items_skipped').notNull(),
itemsFailed: integer('items_failed').notNull(),
```

Restore these with `.default(false)` or `.default(0)` as appropriate.

### Target B: restore ten bounded strings

Import `varchar` from `drizzle-orm/pg-core` and restore:

| Drizzle table/field                | Database column              | Type           |
| ---------------------------------- | ---------------------------- | -------------- |
| `AppUser.fullName`                 | `full_name`                  | `varchar(100)` |
| `AppUser.avatarPath`               | `avatar_path`                | `varchar(255)` |
| `AppUser.avatarBlurhash`           | `avatar_blurhash`            | `varchar(255)` |
| `Channel.avatarPath`               | `avatar_path`                | `varchar(255)` |
| `Channel.avatarBlurhash`           | `avatar_blurhash`            | `varchar(255)` |
| `Channel.coverPath`                | `cover_path`                 | `varchar(255)` |
| `Channel.coverBlurhash`            | `cover_blurhash`             | `varchar(255)` |
| `Channel.defaultThumbnailPath`     | `default_thumbnail_path`     | `varchar(255)` |
| `Channel.defaultThumbnailBlurhash` | `default_thumbnail_blurhash` | `varchar(255)` |
| `ChannelImportSource.workflowId`   | `workflow_id`                | `varchar(255)` |

For example, replace `text('full_name')` with
`varchar('full_name', { length: 100 })`. Do not change other text columns.

Before applying the migration anywhere with real data, query
`length(column)` for all ten columns and confirm no non-null value exceeds its
target length. PostgreSQL must reject over-length data; the migration must never
truncate it.

### Target C: restore 32 secondary indexes

Add these exact physical index names and column orders to the relevant
`pgTable` extra-config callbacks. Reusing the Prisma physical names is
intentional: upgraded databases already have them, and fresh databases should
converge on the same catalog.

| Table                        | Index name                                                     | Columns                                             |
| ---------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| `organization_invitation`    | `organization_invitation_email_idx`                            | `email`                                             |
| `organization_invitation`    | `organization_invitation_status_expires_at_idx`                | `status`, `expires_at`                              |
| `channel_invitation`         | `channel_invitation_email_idx`                                 | `email`                                             |
| `channel_invitation`         | `channel_invitation_status_expires_at_idx`                     | `status`, `expires_at`                              |
| `upload_state`               | `upload_state_backup_status_idx`                               | `backup_status`                                     |
| `upload_state`               | `upload_state_upload_type_idx`                                 | `upload_type`                                       |
| `upload_record`              | `upload_record_created_at_id_idx`                              | `created_at`, `id`                                  |
| `upload_record`              | `upload_record_score_idx`                                      | `score`                                             |
| `upload_record`              | `upload_record_score_stale_at_idx`                             | `score_stale_at`                                    |
| `upload_user_rating`         | `upload_user_rating_upload_id_rating_idx`                      | `upload_id`, `rating`                               |
| `upload_user_rating`         | `upload_user_rating_app_user_id_rating_idx`                    | `app_user_id`, `rating`                             |
| `upload_user_comment`        | `upload_user_comment_replying_to_id_idx`                       | `replying_to_id`                                    |
| `upload_user_comment`        | `upload_user_comment_score_idx`                                | `score`                                             |
| `upload_user_comment`        | `upload_user_comment_score_stale_at_idx`                       | `score_stale_at`                                    |
| `upload_user_comment_rating` | `upload_user_comment_rating_upload_user_comment_id_rating_idx` | `upload_user_comment_id`, `rating`                  |
| `upload_user_comment_rating` | `upload_user_comment_rating_app_user_id_rating_idx`            | `app_user_id`, `rating`                             |
| `upload_view`                | `upload_view_app_user_id_upload_record_id_idx`                 | `app_user_id`, `upload_record_id`                   |
| `upload_view`                | `upload_view_created_at_idx`                                   | `created_at`                                        |
| `upload_view_second`         | `upload_view_second_upload_record_id_second_idx`               | `upload_record_id`, `second`                        |
| `upload_list_entry`          | `upload_list_entry_upload_list_id_rank_created_at_idx`         | `upload_list_id`, `rank`, `created_at`              |
| `search_log_entry`           | `search_log_entry_app_user_id_user_deleted_at_created_at_idx`  | `app_user_id`, `user_deleted_at`, `created_at DESC` |
| `search_log_entry`           | `search_log_entry_created_at_idx`                              | `created_at DESC`                                   |
| `saved_media`                | `saved_media_app_user_id_created_at_idx`                       | `app_user_id`, `created_at`                         |
| `featured_upload`            | `featured_upload_rank_idx`                                     | `rank`                                              |
| `channel_import_source`      | `channel_import_source_channel_id_idx`                         | `channel_id`                                        |
| `channel_import_source`      | `channel_import_source_enabled_idx`                            | `enabled`                                           |
| `channel_import_source`      | `channel_import_source_workflow_status_idx`                    | `workflow_status`                                   |
| `channel_import_run`         | `channel_import_run_import_source_id_started_at_idx`           | `import_source_id`, `started_at`                    |
| `channel_import_run`         | `channel_import_run_status_idx`                                | `status`                                            |
| `import_history`             | `import_history_import_source_id_published_at_idx`             | `import_source_id`, `published_at`                  |
| `import_history`             | `import_history_import_source_id_title_idx`                    | `import_source_id`, `title`                         |
| `import_history`             | `import_history_import_source_id_url_idx`                      | `import_source_id`, `url`                           |

Use `index('<physical_name>').on(...)`. For the two descending indexes, use
the Drizzle column expression's `.desc()` method. Do not add
`.concurrently()` for the reason stated above.

### Target D: restore three optional-relation delete actions

The frozen Prisma schema and its migrations use `ON DELETE SET NULL` for these
optional relations. The Drizzle baseline and active schema use `CASCADE`:

| Foreign key                                                     | Legacy name on upgraded DB                | Drizzle name on fresh DB              | Desired action |
| --------------------------------------------------------------- | ----------------------------------------- | ------------------------------------- | -------------- |
| `upload_user_comment.replying_to_id` → `upload_user_comment.id` | `upload_user_comment_replying_to_id_fkey` | `upload_user_comment_replyingTo_fkey` | `SET NULL`     |
| `upload_view.app_user_id` → `app_user.id`                       | `upload_view_app_user_id_fkey`            | `upload_view_user_fkey`               | `SET NULL`     |
| `upload_list.channel_id` → `channel.id`                         | `upload_list_channel_id_fkey`             | `upload_list_channel_fkey`            | `SET NULL`     |

Change only these three Drizzle declarations to `.onDelete('set null')`.
Do not broadly replace the cascades intentionally introduced by migrations
`0001`, `0004`, or `0005`.

### Target E: restore Prisma `@updatedAt` runtime behavior

Prisma updated 15 fields automatically. Drizzle currently requires every
caller to set them manually. Add:

```ts
.$onUpdate(() => new Date())
```

to the existing `updatedAt` column declarations on these legacy tables:

- `AppUser`
- `AppSession`
- `Organization`
- `OrganizationMembership`
- `OrganizationOrganizationAssociation`
- `OrganizationChannelAssociation`
- `Channel`
- `ChannelMembership`
- `UploadState`
- `UploadRecord`
- `UploadUserComment`
- `UploadList`
- `FeaturedUpload`
- `NewsletterMailingList`
- `ChannelImportSource`

This is a Drizzle runtime behavior and should not produce DDL. Existing
explicit `updatedAt: new Date()` writes may remain; removing them is out of
scope. Do not add this behavior to post-Prisma tables as part of this plan.

### Target F: correct featured-upload relation cardinality

The database enforces at most one `featured_upload` row per upload record, and
Prisma exposed `UploadRecord.featuredUpload` as a nullable one-to-one relation.
Drizzle currently declares:

```ts
// packages/db/src/schema.ts:2836-2838
featuredUpload: many(FeaturedUpload, {
  relationName: 'FeaturedUploadToUploadRecord',
}),
```

Change the inverse relation to `one(FeaturedUpload, { relationName: ... })`.
Because the foreign key is on `FeaturedUpload`, omit `fields` and `references`
on this inverse side.

Update the sole known array-dependent caller:

```ts
// packages/web/src/trpc/procedures/dashboard/channels.ts:2695
isFeatured: featuredUpload.length > 0,
```

to a nullable-object check such as `featuredUpload !== null`.

### Environment split that the forward migration must handle

The executor must preserve both paths:

1. **Fresh Drizzle database**: baseline `0000` created text columns, omitted the
   27 defaults and 32 indexes, and created the three foreign keys with
   `CASCADE`.
2. **Upgraded Prisma database**: legacy `varchar` types, defaults, indexes, and
   `SET NULL` foreign keys may already exist, generally under Prisma-generated
   names. Baseline `0000` was marked applied rather than executed.

A migration that blindly creates indexes or drops only Drizzle-named
constraints is not acceptable.

## Commands you will need

| Purpose                     | Command                                                                                                                                | Expected on success                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Generate migration          | `just db-generate restore_legacy_schema_parity`                                                                                        | one new SQL migration, snapshot, and journal entry |
| Apply migrations            | `just db-migrate`                                                                                                                      | exit 0; `Migrations applied successfully.`         |
| DB checks                   | `pnpm --filter @letschurch/db run check`                                                                                               | format, lint, and TypeScript all exit 0            |
| Web checks                  | `pnpm --filter @letschurch/web run check`                                                                                              | format, lint, and TypeScript all exit 0            |
| Focused auth/donation tests | `pnpm --filter @letschurch/web exec vitest run --project unit src/donations src/schemas/auth.test.ts src/util/normalize-email.test.ts` | all selected tests pass                            |
| Full JS/TS checks           | `pnpm -r run check`                                                                                                                    | all workspace checks exit 0                        |
| Full JS/TS tests            | `pnpm -r run test`                                                                                                                     | all workspace tests pass                           |
| Diff hygiene                | `git diff --check`                                                                                                                     | no output, exit 0                                  |

The parity test command added by this plan is:

```sh
docker compose exec web sh -c \
  'cd /usr/src/app && PARITY_ADMIN_DATABASE_URL="$DATABASE_URL" pnpm --filter @letschurch/db run test:schema-parity'
```

It must create and destroy only uniquely named disposable databases. It must
never modify the database named in `PARITY_ADMIN_DATABASE_URL`.

## Scope

**In scope**:

- `packages/db/src/schema.ts`
- `packages/db/src/schema-parity.test.ts` (create)
- `packages/db/package.json`
- The one newly generated forward migration under `packages/db/drizzle/`
- Its generated snapshot under `packages/db/drizzle/meta/`
- `packages/db/drizzle/meta/_journal.json`, changed only by Drizzle Kit
- `packages/web/src/trpc/procedures/dashboard/channels.ts`
- `.github/workflows/ci.yml`
- `plans/README.md`, status update only

**Out of scope**:

- Editing migrations `0000` through `0022`.
- Reverting CITEXT, passwordless auth, donations, imports, or account linking.
- Restoring the removed `upload_record_download_size` table.
- Changing intentionally migrated cascade behavior other than the three
  optional relations listed in Target D.
- Removing existing explicit `updatedAt` assignments.
- Adding defaults, indexes, or `$onUpdate` behavior to post-Prisma tables.
- Renaming unrelated constraints or indexes solely for cosmetic consistency.
- Installing `uuid-ossp`; the active schema does not use it.
- General query optimization or changing the indexed column order from the
  frozen Prisma schema.
- Pushing, committing, or opening a pull request unless separately instructed.

## Git workflow

- Suggested branch: `fix/drizzle-prisma-schema-parity`
- Use logical commits if the operator wants commits:
  1. `test(db): add schema parity harness`
  2. `fix(db): restore prisma schema parity`
  3. `ci(db): verify fresh and upgraded schemas`
- Recent repository commits use scoped conventional messages such as
  `fix(web): ...` and `feat(web): ...`.
- Do not push or open a pull request unless the operator explicitly asks.

## Steps

### Step 1: Stabilize the migration base and record the live target

1. Confirm migration `0022`, its snapshot, the journal, and the matching
   `schema.ts` changes are committed together or otherwise fixed as the
   execution base.
2. Confirm `0022` still installs CITEXT, safely converts the twelve current
   CITEXT columns, and preserves trimming.
3. Record the actual next migration number. Do not assume it remains `0023`.
4. Rerun the static counts:

   ```sh
   rg -c '@@index' packages/db/prisma/schema.prisma
   rg -c '@default\((false|0)\)' packages/db/prisma/schema.prisma
   rg -c '@db\.VarChar' packages/db/prisma/schema.prisma
   rg -c '@updatedAt' packages/db/prisma/schema.prisma
   ```

   Expected output, in order: `32`, `27`, `10`, `15`.

5. Confirm no already-landed change has restored any of these targets under
   another name. If it has, update this plan before proceeding rather than
   duplicating it.

**Verify**:

```sh
git status --short -- packages/db
```

Expected: no unexplained or partially generated migration artifacts. The
donation/auth/CITEXT work may be present only if it is the explicitly accepted
execution base.

### Step 2: Add a permanent fresh-versus-upgraded database parity harness

Create `packages/db/src/schema-parity.test.ts` using Node's built-in
`node:test`, `node:assert/strict`, `pg`, and existing migration utilities. Do
not add a test framework dependency.

The harness must:

1. Require `PARITY_ADMIN_DATABASE_URL`. If absent, fail with a clear setup
   message rather than silently skip.
2. Generate two database names with a fixed safe prefix and a random UUID,
   validate the names against a strict allow-list regex, and create them from
   the admin connection:
   - one fresh Drizzle database;
   - one upgraded-Prisma database.
3. In a `finally` block:
   - terminate only connections to those exact disposable database names;
   - drop only those exact databases;
   - close every pool/client.
4. Build the fresh fixture by running the complete Drizzle migration chain.
5. Build the upgraded fixture by:
   - applying every SQL file under `packages/db/prisma/migrations/` in lexical
     order to an empty database;
   - creating the Drizzle migrations schema/table;
   - marking only `0000_baseline.sql` as applied using the same hash and
     `created_at` semantics expected by the current migrator;
   - running the remaining Drizzle migrations.
6. Run the same catalog assertions against both fixtures:
   - all 32 indexes exist with the exact name, table, ordered columns, and DESC
     flags listed in Target C;
   - all 27 defaults normalize to the expected `false` or `0`;
   - all ten bounded columns have the expected data type and maximum length;
   - the three foreign keys have `confdeltype = 'n'` (`SET NULL`) and reference
     the expected table/column;
   - the twelve current CITEXT columns remain CITEXT;
   - the 20 shared enums retain their exact ordered values;
   - no `lower(trim(email))` expression uniqueness indexes have reappeared.
7. Add behavior assertions in each fixture:
   - inserting representative rows while omitting restored false/zero fields
     receives database defaults;
   - deleting a parent comment sets a reply's `replying_to_id` to null;
   - deleting a user sets `upload_view.app_user_id` to null without deleting
     the view;
   - deleting a channel sets `upload_list.channel_id` to null without deleting
     the list;
   - over-length `varchar` inserts fail rather than truncate;
   - Drizzle insert/update operations demonstrate `$onUpdate` on at least one
     representative legacy table;
   - `UploadRecord.featuredUpload` is `null` when absent and an object, not an
     array, when present.
8. Keep fixture data minimal. Use unique values and explicit cleanup through
   database disposal rather than deleting from shared development tables.

Add this script to `packages/db/package.json`:

```json
"test:schema-parity": "tsx --test src/schema-parity.test.ts"
```

Do not name it `test`; the existing general CI test job has no PostgreSQL
service.

Before implementing the repair, running the harness against the current schema
should fail on the documented parity targets. The fixture setup itself must
complete successfully; a setup failure is not a valid red test.

**Verify**:

```sh
pnpm --filter @letschurch/db run check
```

Expected: exit 0. Then run the parity command. Expected before the fix: tests
reach catalog assertions and fail for the documented missing defaults, indexes,
types, or foreign-key actions.

### Step 3: Restore schema declarations without touching intentional changes

Edit `packages/db/src/schema.ts`:

1. Import `varchar`.
2. Apply all 27 `.default(false)` / `.default(0)` declarations from Target A.
3. Convert exactly the ten fields in Target B to bounded `varchar`.
4. Add exactly the 32 named indexes in Target C.
5. Change exactly the three foreign keys in Target D to
   `.onDelete('set null')`.
6. Add `$onUpdate(() => new Date())` to exactly the 15 legacy `updatedAt`
   declarations in Target E.
7. Change `UploadRecordRelations.featuredUpload` from `many` to `one`.
8. Change the dashboard channel caller's `featuredUpload.length > 0` to a
   nullable-object check.

Do not use broad automated replacement for `.notNull()` or `.onDelete()`.
Review each edited table against the target manifests above.

**Verify**:

```sh
pnpm --filter @letschurch/db run check
pnpm --filter @letschurch/web run check
rg -n 'featuredUpload\.length' packages/web/src
```

Expected: both checks exit 0; the final `rg` returns no matches.

### Step 4: Preflight live data and index-build risk

Before generating or applying DDL:

1. Query maximum lengths for all ten bounded columns in every deployment
   database.
2. Query `pg_total_relation_size` and estimated row counts for all tables in
   Target C.
3. Query `pg_indexes` for the 32 target names and capture
   `pg_get_indexdef(indexrelid)` for each existing index.
4. Query `pg_constraint` for both legacy and Drizzle names of the three target
   foreign keys and capture `pg_get_constraintdef`.
5. Save the non-sensitive results in the execution/review notes, not in source
   code.

Stop if:

- any string exceeds its intended bound;
- an existing target index name has a different table, expression, ordering,
  predicate, or uniqueness;
- neither known foreign-key name exists on an upgraded database;
- both names exist simultaneously with conflicting definitions;
- normal transactional index creation cannot fit an approved maintenance
  window.

If index builds are too large for blocking `CREATE INDEX`, split concurrent
index deployment into a separately designed operational plan. Do not add
`.concurrently()` to this migration while the current migrator wraps migrations
in a transaction.

**Verify**: all preflight queries return either the expected existing
definition or "missing"; no over-length values or conflicting catalog objects
exist.

### Step 5: Generate one new forward migration

Run:

```sh
just db-generate restore_legacy_schema_parity
```

Inspect the generated SQL, snapshot, and journal entry.

The generated migration should contain only:

- the ten bounded-string type changes;
- the 27 default changes;
- recreation of the three foreign keys with `SET NULL`;
- creation of the 32 indexes.

`$onUpdate` and relation-cardinality changes are runtime metadata and must not
produce DDL.

Do not edit the generated snapshot or journal. Do not edit migrations
`0000`–`0022`.

**Verify**:

```sh
git status --short -- packages/db/drizzle packages/db/src/schema.ts
rg -n 'donation_|app_auth_token|lower\(|btrim\(|TYPE citext' \
  packages/db/drizzle/<new-migration>.sql
```

Expected: one new SQL file, one new snapshot, one journal modification, and the
intended schema edit. The `rg` command returns no matches. Any unrelated
donation/auth/CITEXT DDL is a STOP condition.

### Step 6: Harden the generated SQL for both database histories

Keep the generated snapshot and journal unchanged. Modify only the newly
generated SQL so it is safe on both fixture shapes:

1. **Defaults**: `ALTER COLUMN ... SET DEFAULT` is safe when the same default
   already exists. Keep the generated statements, but ensure the SQL values are
   database booleans/numbers, not quoted text.
2. **Bounded strings**:
   - add a precondition block that raises an exception naming only the
     table/column/count if any value exceeds its bound;
   - use `ALTER COLUMN ... TYPE varchar(n) USING column::varchar(n)`;
   - never use `substring`, `left`, or any truncating expression.
3. **Foreign keys**:
   - validate that any existing legacy or Drizzle-named constraint has the
     expected local and referenced columns;
   - drop both known names with `IF EXISTS`;
   - add one Drizzle-named constraint with `ON DELETE SET NULL ON UPDATE
CASCADE`.
4. **Indexes**:
   - before each create, if the target name exists, compare its table,
     uniqueness, predicate, ordered columns, and direction to the manifest;
   - raise on a mismatch instead of silently accepting the name;
   - create missing indexes with `CREATE INDEX IF NOT EXISTS`;
   - do not create a duplicate equivalent index under a second name;
   - do not use `CONCURRENTLY` with the current migrator.
5. Preserve statement breakpoints as required by the generated file.

Follow the catalog-aware, fail-before-mutation style in migration `0022`.
Dynamic identifiers must be quoted with PostgreSQL `format('%I', ...)`; do not
concatenate raw identifier strings.

This step is intentionally narrow: generated migration metadata remains owned
by Drizzle Kit, while the SQL becomes compatible with catalogs that predate the
baseline.

**Verify**:

```sh
git diff --check
pnpm --filter @letschurch/db run check
```

Expected: no whitespace errors; DB checks pass.

### Step 7: Prove fresh and upgraded migration paths converge

Run the parity harness:

```sh
docker compose exec web sh -c \
  'cd /usr/src/app && PARITY_ADMIN_DATABASE_URL="$DATABASE_URL" pnpm --filter @letschurch/db run test:schema-parity'
```

Expected:

- both disposable databases are created;
- all Prisma and Drizzle migrations apply in the upgraded fixture;
- all Drizzle migrations apply in the fresh fixture;
- all catalog and behavior assertions pass in both;
- both disposable databases are dropped even if an assertion fails.

Run it a second time to prove cleanup and unique database naming are reliable.
Both runs must pass.

Then apply the migration to the ordinary local development database:

```sh
just db-migrate
```

Expected: `Migrations applied successfully.`

Run `just db-migrate` again. Expected: success with no migration reapplication
or catalog errors.

### Step 8: Add a dedicated CI database-parity job

Update `.github/workflows/ci.yml` with a job that:

1. uses the same Node setup and frozen `pnpm install` pattern as existing JS
   jobs;
2. starts PostgreSQL `18.3-alpine3.23` as a service;
3. waits for PostgreSQL health;
4. sets `PARITY_ADMIN_DATABASE_URL` through job environment configuration;
5. runs:

   ```sh
   pnpm --filter @letschurch/db run test:schema-parity
   ```

Do not add a PostgreSQL dependency to the existing generic unit-test job. Keep
the parity job isolated so ordinary unit tests remain database-free.

Do not place real production credentials or connection strings in the
workflow. Use only the ephemeral CI service credentials defined in that job.

**Verify**:

```sh
pnpm --filter @letschurch/db run check
pnpm --filter @letschurch/web run check
```

Expected: both exit 0. Validate the workflow syntax with the repository's
available workflow checker if one is already installed; do not add a new tool
solely for this plan.

### Step 9: Run focused and full regression gates

Run:

```sh
pnpm --filter @letschurch/web exec vitest run --project unit \
  src/donations \
  src/schemas/auth.test.ts \
  src/util/normalize-email.test.ts
pnpm -r run check
pnpm -r run test
git diff --check
```

Expected: all commands exit 0.

Review the final migration diff manually and confirm:

- no existing migration was edited;
- no intentional donation/auth/CITEXT behavior changed;
- only the 27 defaults, ten bounds, 32 indexes, and three foreign-key actions
  appear in DDL;
- all target index names match the manifest exactly;
- fresh and upgraded parity tests both passed;
- the featured-upload API still returns the same `isFeatured: boolean` public
  shape.

### Step 10: Repeat the requested code reviews

After every verification gate passes:

1. Run the repository review skill over the complete donation/auth/parity diff.
2. Run CodeRabbit over the same complete diff.
3. Fix every finding that is correct and worth fixing.
4. Rerun the affected checks and parity harness.
5. Repeat both reviews until no actionable findings remain.

Do not limit either review to the final migration file; relation metadata,
the dashboard caller, the database harness, and CI configuration are part of
the same change.

**Verify**: record both final review results and the commands rerun after the
last fix. Expected: no unresolved actionable findings.

## Test plan

### New tests

Create `packages/db/src/schema-parity.test.ts` and cover:

- fresh Drizzle migration path;
- upgraded Prisma-to-Drizzle migration path;
- the exact catalog manifests for defaults, bounded types, indexes, foreign
  keys, CITEXT, and shared enums;
- false/zero default behavior through omitted insert values;
- all three `SET NULL` delete behaviors;
- over-length string rejection;
- representative `$onUpdate` insert/update behavior;
- one-to-one featured-upload relation shape;
- cleanup on success and failure.

### Existing patterns

- Use `packages/db/src/migrate.ts` for how the repository invokes the Drizzle
  migrator and closes pools.
- Use `packages/db/src/pool.ts` for PostgreSQL connection conventions where
  appropriate.
- Use migration `0022_donations_auth_participation.sql` for catalog-aware
  validation and fail-before-mutation behavior.
- Use existing Vitest tests under `packages/web/src/donations/` only for the
  focused application regression gate; the new database harness should use
  Node's built-in test runner to avoid adding dependencies.

## Done criteria

All criteria must hold:

- [ ] Donation/auth/CITEXT migrations are stable and unchanged by this work.
- [ ] `schema.ts` contains exactly the 27 restored defaults.
- [ ] `schema.ts` contains exactly the ten restored `varchar` bounds.
- [ ] `schema.ts` declares all 32 legacy secondary indexes with exact names and
      ordering.
- [ ] Exactly the three target foreign keys use `ON DELETE SET NULL`.
- [ ] Exactly the 15 legacy `updatedAt` fields have `$onUpdate`.
- [ ] `UploadRecord.featuredUpload` is typed and returned as a nullable object,
      not an array.
- [ ] A new forward migration was generated after `0022`; no deployed migration
      was edited.
- [ ] The new migration fails safely on over-length or conflicting catalog
      state and converges fresh/upgraded catalogs.
- [ ] The parity harness passes twice locally for both fixture histories.
- [ ] `just db-migrate` succeeds twice on the normal development database.
- [ ] Dedicated CI coverage exists for the parity harness.
- [ ] DB and web format, lint, and TypeScript checks pass.
- [ ] Focused donation/auth tests pass.
- [ ] Full workspace JS/TS checks and tests pass.
- [ ] `git diff --check` passes.
- [ ] Final repository review and CodeRabbit review have no actionable findings.
- [ ] No files outside the in-scope list were modified by the executor.
- [ ] `plans/README.md` marks this plan `DONE`.

## STOP conditions

Stop and report rather than improvising if:

- Migration `0022` is missing, renumbered without reconciliation, or
  no longer match the active schema.
- The CITEXT migration or any intentional passwordless/donation behavior would
  need to be reverted.
- The static counts no longer equal 32 indexes, 27 falsy defaults, ten bounded
  strings, and 15 `@updatedAt` fields without an understood reason.
- A real value exceeds a target `varchar` length.
- A target index name exists with a different definition.
- An upgraded database has an unknown foreign-key name or contradictory
  constraints.
- Normal transactional index creation is too disruptive for the approved
  maintenance window.
- Drizzle Kit generates unrelated donation, auth, CITEXT, table-drop, or enum
  DDL.
- Safe upgraded/fresh convergence requires editing a deployed migration,
  snapshot JSON, or `_journal.json` by hand.
- The Prisma migration chain cannot initialize a disposable upgraded fixture.
- The parity harness would need permission to drop anything other than its
  strictly validated, uniquely named disposable databases.
- Any verification step fails twice after a reasonable correction.
- Correcting the relation cardinality changes the public API beyond preserving
  `isFeatured: boolean`.

## Maintenance notes

- Keep `schema-parity.test.ts` as a catalog contract even if the frozen Prisma
  schema is eventually deleted. The explicit manifests are the durable
  specification.
- When adding or removing indexes, defaults, bounded columns, or foreign-key
  actions later, update the manifest and migration in the same change.
- `$onUpdate` is a Drizzle runtime feature, not a PostgreSQL trigger. Raw SQL
  updates still need to set `updated_at` explicitly.
- The current migrator's transaction prevents concurrent index builds. If table
  growth makes normal index creation unacceptable, design a separate,
  idempotent operational migration path rather than quietly adding
  `.concurrently()`.
- Reviewers should scrutinize catalog-name handling and database cleanup more
  closely than ordinary application code: a typo here can create environment
  drift or target the wrong database.
