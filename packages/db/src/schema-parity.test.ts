import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { eq } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from './schema';

const DRIZZLE_MIGRATIONS_FOLDER = join(import.meta.dirname, '../drizzle');
const PRISMA_MIGRATIONS_FOLDER = join(
  import.meta.dirname,
  '../prisma/migrations',
);
const DATABASE_NAME_PATTERN =
  /^lc_schema_parity_(?:fresh|upgraded)_[0-9a-f]{32}$/;

type IndexManifestEntry = {
  name: string;
  table: string;
  columns: string[];
  descending?: boolean[];
  nullsFirst?: boolean[];
};

const INDEX_MANIFEST: IndexManifestEntry[] = [
  {
    name: 'organization_invitation_email_idx',
    table: 'organization_invitation',
    columns: ['email'],
  },
  {
    name: 'organization_invitation_status_expires_at_idx',
    table: 'organization_invitation',
    columns: ['status', 'expires_at'],
  },
  {
    name: 'channel_invitation_email_idx',
    table: 'channel_invitation',
    columns: ['email'],
  },
  {
    name: 'channel_invitation_status_expires_at_idx',
    table: 'channel_invitation',
    columns: ['status', 'expires_at'],
  },
  {
    name: 'upload_state_backup_status_idx',
    table: 'upload_state',
    columns: ['backup_status'],
  },
  {
    name: 'upload_state_upload_type_idx',
    table: 'upload_state',
    columns: ['upload_type'],
  },
  {
    name: 'upload_record_created_at_id_idx',
    table: 'upload_record',
    columns: ['created_at', 'id'],
  },
  {
    name: 'upload_record_score_idx',
    table: 'upload_record',
    columns: ['score'],
  },
  {
    name: 'upload_record_score_stale_at_idx',
    table: 'upload_record',
    columns: ['score_stale_at'],
  },
  {
    name: 'upload_user_rating_upload_id_rating_idx',
    table: 'upload_user_rating',
    columns: ['upload_id', 'rating'],
  },
  {
    name: 'upload_user_rating_app_user_id_rating_idx',
    table: 'upload_user_rating',
    columns: ['app_user_id', 'rating'],
  },
  {
    name: 'upload_user_comment_replying_to_id_idx',
    table: 'upload_user_comment',
    columns: ['replying_to_id'],
  },
  {
    name: 'upload_user_comment_score_idx',
    table: 'upload_user_comment',
    columns: ['score'],
  },
  {
    name: 'upload_user_comment_score_stale_at_idx',
    table: 'upload_user_comment',
    columns: ['score_stale_at'],
  },
  {
    name: 'upload_user_comment_rating_upload_user_comment_id_rating_idx',
    table: 'upload_user_comment_rating',
    columns: ['upload_user_comment_id', 'rating'],
  },
  {
    name: 'upload_user_comment_rating_app_user_id_rating_idx',
    table: 'upload_user_comment_rating',
    columns: ['app_user_id', 'rating'],
  },
  {
    name: 'upload_view_app_user_id_upload_record_id_idx',
    table: 'upload_view',
    columns: ['app_user_id', 'upload_record_id'],
  },
  {
    name: 'upload_view_created_at_idx',
    table: 'upload_view',
    columns: ['created_at'],
  },
  {
    name: 'upload_view_second_upload_record_id_second_idx',
    table: 'upload_view_second',
    columns: ['upload_record_id', 'second'],
  },
  {
    name: 'upload_list_entry_upload_list_id_rank_created_at_idx',
    table: 'upload_list_entry',
    columns: ['upload_list_id', 'rank', 'created_at'],
  },
  {
    name: 'search_log_entry_app_user_id_user_deleted_at_created_at_idx',
    table: 'search_log_entry',
    columns: ['app_user_id', 'user_deleted_at', 'created_at'],
    descending: [false, false, true],
    nullsFirst: [false, false, true],
  },
  {
    name: 'search_log_entry_created_at_idx',
    table: 'search_log_entry',
    columns: ['created_at'],
    descending: [true],
    nullsFirst: [true],
  },
  {
    name: 'saved_media_app_user_id_created_at_idx',
    table: 'saved_media',
    columns: ['app_user_id', 'created_at'],
  },
  {
    name: 'featured_upload_rank_idx',
    table: 'featured_upload',
    columns: ['rank'],
  },
  {
    name: 'channel_import_source_channel_id_idx',
    table: 'channel_import_source',
    columns: ['channel_id'],
  },
  {
    name: 'channel_import_source_enabled_idx',
    table: 'channel_import_source',
    columns: ['enabled'],
  },
  {
    name: 'channel_import_source_workflow_status_idx',
    table: 'channel_import_source',
    columns: ['workflow_status'],
  },
  {
    name: 'channel_import_run_import_source_id_started_at_idx',
    table: 'channel_import_run',
    columns: ['import_source_id', 'started_at'],
  },
  {
    name: 'channel_import_run_status_idx',
    table: 'channel_import_run',
    columns: ['status'],
  },
  {
    name: 'import_history_import_source_id_published_at_idx',
    table: 'import_history',
    columns: ['import_source_id', 'published_at'],
  },
  {
    name: 'import_history_import_source_id_title_idx',
    table: 'import_history',
    columns: ['import_source_id', 'title'],
  },
  {
    name: 'import_history_import_source_id_url_idx',
    table: 'import_history',
    columns: ['import_source_id', 'url'],
  },
];

const DEFAULT_MANIFEST = [
  ['organization', 'automatically_approve_organization_associations', 'false'],
  ['organization_membership', 'is_admin', 'false'],
  ['organization_membership', 'can_edit', 'false'],
  ['organization_invitation', 'is_admin', 'false'],
  ['organization_invitation', 'can_edit', 'false'],
  ['organization_organization_association', 'upstream_approved', 'false'],
  ['organization_organization_association', 'downstream_approved', 'false'],
  ['organization_channel_association', 'official_channel', 'false'],
  ['channel_membership', 'is_admin', 'false'],
  ['channel_membership', 'can_edit', 'false'],
  ['channel_membership', 'can_download', 'false'],
  ['channel_invitation', 'is_admin', 'false'],
  ['channel_invitation', 'can_edit', 'false'],
  ['channel_invitation', 'can_download', 'false'],
  ['upload_record', 'upload_finalized', 'false'],
  ['upload_record', 'transcoding_progress', '0'],
  ['upload_record', 'score', '0'],
  ['upload_user_comment', 'score', '0'],
  ['search_log_entry', 'media_count', '0'],
  ['search_log_entry', 'transcript_count', '0'],
  ['search_log_entry', 'channel_count', '0'],
  ['newsletter_mailing_list', 'subscribe_on_registration', 'false'],
  ['channel_import_source', 'deduplication_enabled', 'false'],
  ['channel_import_run', 'items_found', '0'],
  ['channel_import_run', 'items_imported', '0'],
  ['channel_import_run', 'items_skipped', '0'],
  ['channel_import_run', 'items_failed', '0'],
] as const;

const VARCHAR_MANIFEST = [
  ['app_user', 'full_name', 100],
  ['app_user', 'avatar_path', 255],
  ['app_user', 'avatar_blurhash', 255],
  ['channel', 'avatar_path', 255],
  ['channel', 'avatar_blurhash', 255],
  ['channel', 'cover_path', 255],
  ['channel', 'cover_blurhash', 255],
  ['channel', 'default_thumbnail_path', 255],
  ['channel', 'default_thumbnail_blurhash', 255],
  ['channel_import_source', 'workflow_id', 255],
] as const;

const FOREIGN_KEY_MANIFEST = [
  {
    table: 'upload_user_comment',
    columns: ['replying_to_id'],
    referencedTable: 'upload_user_comment',
    referencedColumns: ['id'],
  },
  {
    table: 'upload_view',
    columns: ['app_user_id'],
    referencedTable: 'app_user',
    referencedColumns: ['id'],
  },
  {
    table: 'upload_list',
    columns: ['channel_id'],
    referencedTable: 'channel',
    referencedColumns: ['id'],
  },
] as const;

const CITEXT_MANIFEST = [
  ['app_auth_token', 'email'],
  ['app_user', 'username'],
  ['app_user_email', 'email'],
  ['channel', 'slug'],
  ['channel_invitation', 'email'],
  ['donation_donor', 'email'],
  ['organization', 'slug'],
  ['organization_invitation', 'email'],
  ['organization_tag', 'slug'],
  ['organization_tag_instance', 'tag_slug'],
  ['organization_tag_suggestion', 'parent_slug'],
  ['organization_tag_suggestion', 'recommended_slug'],
] as const;

const ENUM_MANIFEST = {
  address_type: ['MAILING', 'MEETING', 'OFFICE', 'OTHER'],
  app_user_role: ['USER', 'ADMIN'],
  backup_status: ['NOT_BACKED_UP', 'BACKING_UP', 'BACKED_UP', 'BACKUP_FAILED'],
  channel_import_run_status: ['IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL'],
  channel_import_source_workflow_status: [
    'NOT_STARTED',
    'RUNNING',
    'PAUSED',
    'FAILED',
  ],
  channel_visibility: ['PUBLIC', 'PRIVATE', 'UNLISTED'],
  invitation_status: [
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED',
    'CANCELLED',
  ],
  newsletter_list_optin: ['single', 'double'],
  newsletter_list_type: ['public', 'private'],
  organization_leader_type: ['ELDER', 'DEACON', 'OTHER'],
  organization_tag_category: [
    'DENOMINATION',
    'DOCTRINE',
    'ESCHATOLOGY',
    'WORSHIP',
    'CONFESSION',
    'GOVERNMENT',
    'OTHER',
  ],
  organization_type: ['CHURCH', 'MINISTRY'],
  rating: ['LIKE', 'DISLIKE'],
  TagColor: [
    'GRAY',
    'RED',
    'YELLOW',
    'GREEN',
    'BLUE',
    'INDIGO',
    'PURPLE',
    'PINK',
  ],
  upload_license: [
    'STANDARD',
    'PUBLIC_DOMAIN',
    'CC_BY',
    'CC_BY_SA',
    'CC_BY_NC',
    'CC_BY_NC_SA',
    'CC_BY_ND',
    'CC_BY_NC_ND',
    'CC0',
  ],
  upload_list_type: ['SERIES', 'PLAYLIST'],
  upload_state_type: [
    'MEDIA',
    'THUMBNAIL',
    'PROFILE_AVATAR',
    'CHANNEL_AVATAR',
    'CHANNEL_COVER',
    'ORGANIZATION_AVATAR',
    'ORGANIZATION_COVER',
    'CHANNEL_DEFAULT_THUMBNAIL',
  ],
  upload_variant: [
    'VIDEO_4K',
    'VIDEO_4K_DOWNLOAD',
    'VIDEO_1080P',
    'VIDEO_1080P_DOWNLOAD',
    'VIDEO_720P',
    'VIDEO_720P_DOWNLOAD',
    'VIDEO_480P',
    'VIDEO_480P_DOWNLOAD',
    'VIDEO_360P',
    'VIDEO_360P_DOWNLOAD',
    'AUDIO',
    'AUDIO_DOWNLOAD',
  ],
  upload_view_source: ['WEBSITE', 'EMBED'],
  upload_visibility: ['PUBLIC', 'PRIVATE', 'UNLISTED'],
} as const;

function getAdminDatabaseUrl() {
  const adminDatabaseUrl = process.env.PARITY_ADMIN_DATABASE_URL;
  assert.ok(
    adminDatabaseUrl,
    'PARITY_ADMIN_DATABASE_URL is required and must point to a disposable-test PostgreSQL server admin database',
  );
  return adminDatabaseUrl;
}

function makeDatabaseName(kind: 'fresh' | 'upgraded') {
  const name = `lc_schema_parity_${kind}_${randomUUID().replaceAll('-', '')}`;
  assert.match(name, DATABASE_NAME_PATTERN);
  return name;
}

function assertDisposableDatabaseName(name: string) {
  assert.match(
    name,
    DATABASE_NAME_PATTERN,
    `refusing to manage unsafe parity database name: ${name}`,
  );
}

function databaseUrlFor(adminDatabaseUrl: string, databaseName: string) {
  assertDisposableDatabaseName(databaseName);
  const databaseUrl = new URL(adminDatabaseUrl);
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}

async function createDatabase(adminPool: Pool, databaseName: string) {
  assertDisposableDatabaseName(databaseName);
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
}

async function dropDatabase(adminPool: Pool, databaseName: string) {
  assertDisposableDatabaseName(databaseName);
  await adminPool.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
}

async function migrateFresh(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } finally {
    await pool.end();
  }
}

async function migrateUpgraded(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const migrationDirectories = (
      await readdir(PRISMA_MIGRATIONS_FOLDER, {
        withFileTypes: true,
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const migrationDirectory of migrationDirectories) {
      const path = join(
        PRISMA_MIGRATIONS_FOLDER,
        migrationDirectory,
        'migration.sql',
      );
      const migrationSql = await readFile(path, 'utf8');
      try {
        await pool.query(migrationSql);
      } catch (error) {
        throw new Error(
          `failed to apply Prisma migration ${migrationDirectory}`,
          {
            cause: error,
          },
        );
      }
    }

    // The Prisma history created this as a standalone unique index, while the
    // first Drizzle snapshot represented it as a named unique constraint.
    // Migration 0004 predates catalog-aware migrations and drops the latter
    // name unconditionally. Normalize only this transition-era catalog shape
    // in the disposable fixture so the immutable migration can be replayed.
    await pool.query(`
      ALTER TABLE organization_tag
      ADD CONSTRAINT organization_tag_slug_unique
      UNIQUE USING INDEX organization_tag_slug_key
    `);
    await pool.query(`
      ALTER TABLE channel_import_source
      RENAME CONSTRAINT channel_import_source_updated_by_id_fkey
      TO "channel_import_source_updatedBy_fkey"
    `);
    await pool.query(`
      ALTER TABLE channel_invitation
      RENAME CONSTRAINT channel_invitation_invited_by_id_fkey
      TO "channel_invitation_invitedBy_fkey"
    `);
    await pool.query(`
      ALTER TABLE organization_invitation
      RENAME CONSTRAINT organization_invitation_invited_by_id_fkey
      TO "organization_invitation_invitedBy_fkey"
    `);
    await pool.query(`
      ALTER INDEX upload_record_download_size_upload_record_id_variant_key
      RENAME TO "UploadRecordDownloadSize_uploadRecordId_variant_key"
    `);
    await pool.query(`
      ALTER TABLE upload_record
      RENAME CONSTRAINT upload_record_upload_finalized_by_id_fkey
      TO "upload_record_uploadFinalizedBy_fkey"
    `);

    const [baseline, ...remainingMigrations] = readMigrationFiles({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    });
    assert.ok(baseline, 'Drizzle baseline migration is missing');
    await pool.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await pool.query(`
      CREATE TABLE drizzle.__drizzle_migrations (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    await pool.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [baseline.hash, baseline.folderMillis],
    );

    // Replay journal order explicitly. Migration 0002 has an older historical
    // timestamp than 0000, so the current migrator's timestamp-only selection
    // would otherwise skip it even though it follows the baseline in the
    // journal. Recording each applied hash preserves the normal ledger shape.
    await pool.query('BEGIN');
    try {
      for (const migration of remainingMigrations) {
        for (const statement of migration.sql) {
          if (statement.trim()) await pool.query(statement);
        }
        await pool.query(
          'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
          [migration.hash, migration.folderMillis],
        );
      }
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } finally {
    await pool.end();
  }
}

function normalizeDefault(value: string | null) {
  if (value === null) return null;
  return value
    .toLowerCase()
    .replaceAll(/[()]/g, '')
    .replaceAll(/::(?:boolean|integer|double precision|numeric)/g, '')
    .trim();
}

async function assertCatalog(pool: Pool) {
  const indexResult = await pool.query<{
    index_name: string;
    table_name: string;
    is_unique: boolean;
    predicate: string | null;
    columns: string[];
    descending: boolean[];
    nulls_first: boolean[];
  }>(
    `
      SELECT
        index_relation.relname AS index_name,
        table_relation.relname AS table_name,
        index_definition.indisunique AS is_unique,
        pg_get_expr(index_definition.indpred, index_definition.indrelid) AS predicate,
        array_agg(attribute.attname::text ORDER BY key.ordinality) AS columns,
        array_agg((key.option & 1) = 1 ORDER BY key.ordinality) AS descending,
        array_agg((key.option & 2) = 2 ORDER BY key.ordinality) AS nulls_first
      FROM pg_index AS index_definition
      JOIN pg_class AS index_relation ON index_relation.oid = index_definition.indexrelid
      JOIN pg_class AS table_relation ON table_relation.oid = index_definition.indrelid
      JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
      CROSS JOIN LATERAL unnest(
        index_definition.indkey::smallint[],
        index_definition.indoption::smallint[]
      ) WITH ORDINALITY AS key(attnum, option, ordinality)
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = table_relation.oid
        AND attribute.attnum = key.attnum
      WHERE namespace.nspname = 'public' AND index_relation.relname = ANY($1)
      GROUP BY
        index_relation.relname,
        table_relation.relname,
        index_definition.indisunique,
        index_definition.indpred,
        index_definition.indrelid
    `,
    [INDEX_MANIFEST.map(({ name }) => name)],
  );
  const indexesByName = new Map(
    indexResult.rows.map((index) => [index.index_name, index]),
  );
  for (const expected of INDEX_MANIFEST) {
    const actual = indexesByName.get(expected.name);
    assert.ok(actual, `missing index ${expected.name}`);
    assert.equal(actual.table_name, expected.table, expected.name);
    assert.equal(actual.is_unique, false, expected.name);
    assert.equal(actual.predicate, null, expected.name);
    assert.deepEqual(actual.columns, expected.columns, expected.name);
    assert.deepEqual(
      actual.descending,
      expected.descending ?? expected.columns.map(() => false),
      expected.name,
    );
    assert.deepEqual(
      actual.nulls_first,
      expected.nullsFirst ?? expected.columns.map(() => false),
      expected.name,
    );
  }

  const defaultsResult = await pool.query<{
    table_name: string;
    column_name: string;
    column_default: string | null;
  }>(`
    SELECT table_name, column_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const defaultsByColumn = new Map(
    defaultsResult.rows.map((column) => [
      `${column.table_name}.${column.column_name}`,
      normalizeDefault(column.column_default),
    ]),
  );
  for (const [table, column, expectedDefault] of DEFAULT_MANIFEST) {
    assert.equal(
      defaultsByColumn.get(`${table}.${column}`),
      expectedDefault,
      `${table}.${column} default`,
    );
  }

  const varcharResult = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
  }>(`
    SELECT table_name, column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const varcharByColumn = new Map(
    varcharResult.rows.map((column) => [
      `${column.table_name}.${column.column_name}`,
      column,
    ]),
  );
  for (const [table, column, length] of VARCHAR_MANIFEST) {
    const actual = varcharByColumn.get(`${table}.${column}`);
    assert.ok(actual, `missing bounded column ${table}.${column}`);
    assert.equal(actual.data_type, 'character varying', `${table}.${column}`);
    assert.equal(actual.character_maximum_length, length, `${table}.${column}`);
  }

  const foreignKeyResult = await pool.query<{
    constraint_name: string;
    table_name: string;
    columns: string[];
    referenced_table: string;
    referenced_columns: string[];
    delete_action: string;
    update_action: string;
  }>(`
    SELECT
      constraint_definition.conname AS constraint_name,
      source_table.relname AS table_name,
      ARRAY(
        SELECT source_attribute.attname::text
        FROM unnest(constraint_definition.conkey) WITH ORDINALITY AS source_key(attnum, ordinality)
        JOIN pg_attribute AS source_attribute
          ON source_attribute.attrelid = source_table.oid
          AND source_attribute.attnum = source_key.attnum
        ORDER BY source_key.ordinality
      ) AS columns,
      referenced_table.relname AS referenced_table,
      ARRAY(
        SELECT referenced_attribute.attname::text
        FROM unnest(constraint_definition.confkey) WITH ORDINALITY AS referenced_key(attnum, ordinality)
        JOIN pg_attribute AS referenced_attribute
          ON referenced_attribute.attrelid = referenced_table.oid
          AND referenced_attribute.attnum = referenced_key.attnum
        ORDER BY referenced_key.ordinality
      ) AS referenced_columns,
      constraint_definition.confdeltype AS delete_action,
      constraint_definition.confupdtype AS update_action
    FROM pg_constraint AS constraint_definition
    JOIN pg_class AS source_table ON source_table.oid = constraint_definition.conrelid
    JOIN pg_class AS referenced_table ON referenced_table.oid = constraint_definition.confrelid
    JOIN pg_namespace AS namespace ON namespace.oid = source_table.relnamespace
    WHERE namespace.nspname = 'public' AND constraint_definition.contype = 'f'
  `);
  for (const expected of FOREIGN_KEY_MANIFEST) {
    const matches = foreignKeyResult.rows.filter(
      (foreignKey) =>
        foreignKey.table_name === expected.table &&
        foreignKey.referenced_table === expected.referencedTable &&
        JSON.stringify(foreignKey.columns) ===
          JSON.stringify(expected.columns) &&
        JSON.stringify(foreignKey.referenced_columns) ===
          JSON.stringify(expected.referencedColumns),
    );
    assert.equal(
      matches.length,
      1,
      `${expected.table}.${expected.columns.join(',')}`,
    );
    assert.equal(matches[0]?.delete_action, 'n', matches[0]?.constraint_name);
    assert.equal(matches[0]?.update_action, 'c', matches[0]?.constraint_name);
  }

  const citextResult = await pool.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
  }>(`
    SELECT table_name, column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const typeByColumn = new Map(
    citextResult.rows.map((column) => [
      `${column.table_name}.${column.column_name}`,
      column.udt_name,
    ]),
  );
  for (const [table, column] of CITEXT_MANIFEST) {
    assert.equal(typeByColumn.get(`${table}.${column}`), 'citext');
  }

  const enumResult = await pool.query<{
    enum_name: string;
    values: string[];
  }>(
    `
    SELECT enum_type.typname AS enum_name,
      array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder) AS values
    FROM pg_type AS enum_type
    JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
    JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
    WHERE namespace.nspname = 'public' AND enum_type.typname = ANY($1)
    GROUP BY enum_type.typname
  `,
    [Object.keys(ENUM_MANIFEST)],
  );
  const enumsByName = new Map(
    enumResult.rows.map((enumDefinition) => [
      enumDefinition.enum_name,
      enumDefinition.values,
    ]),
  );
  for (const [enumName, values] of Object.entries(ENUM_MANIFEST)) {
    assert.deepEqual(enumsByName.get(enumName), values, enumName);
  }

  const expressionIndexResult = await pool.query<{ index_definition: string }>(`
    SELECT pg_get_indexdef(index_relation.oid) AS index_definition
    FROM pg_class AS index_relation
    JOIN pg_index AS index_definition ON index_definition.indexrelid = index_relation.oid
    JOIN pg_class AS table_relation ON table_relation.oid = index_definition.indrelid
    JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
    WHERE
      namespace.nspname = 'public'
      AND lower(pg_get_indexdef(index_relation.oid)) LIKE '%lower(%'
      AND lower(pg_get_indexdef(index_relation.oid)) ~ '(btrim|trim)\\('
  `);
  assert.deepEqual(expressionIndexResult.rows, []);
}

async function assertBehavior(pool: Pool) {
  const sqlUser = await pool.query<{ id: string }>(`
    INSERT INTO app_user (username, updated_at)
    VALUES ('parity-sql-user', '2000-01-01T00:00:00Z')
    RETURNING id
  `);
  const creatorId = sqlUser.rows[0]?.id;
  assert.ok(creatorId);

  const viewer = await pool.query<{ id: string }>(`
    INSERT INTO app_user (username, updated_at)
    VALUES ('parity-viewer', '2000-01-01T00:00:00Z')
    RETURNING id
  `);
  const viewerId = viewer.rows[0]?.id;
  assert.ok(viewerId);

  const channel = await pool.query<{ id: string }>(`
    INSERT INTO channel (name, slug, updated_at)
    VALUES ('Parity channel', 'parity-channel', '2000-01-01T00:00:00Z')
    RETURNING id
  `);
  const channelId = channel.rows[0]?.id;
  assert.ok(channelId);

  const upload = await pool.query<{
    id: string;
    upload_finalized: boolean;
    transcoding_progress: number;
    score: number;
  }>(
    `
    INSERT INTO upload_record (
      title,
      app_user_id,
      license,
      channel_id,
      visibility,
      updated_at,
      variants
    ) VALUES (
      'Parity upload',
      $1,
      'STANDARD',
      $2,
      'PUBLIC',
      '2000-01-01T00:00:00Z',
      ARRAY[]::upload_variant[]
    )
    RETURNING id, upload_finalized, transcoding_progress, score
  `,
    [creatorId, channelId],
  );
  const uploadRow = upload.rows[0];
  assert.ok(uploadRow);
  assert.equal(uploadRow.upload_finalized, false);
  assert.equal(uploadRow.transcoding_progress, 0);
  assert.equal(uploadRow.score, 0);

  const search = await pool.query<{
    media_count: number;
    transcript_count: number;
    channel_count: number;
  }>(`
    INSERT INTO search_log_entry (query)
    VALUES ('schema parity')
    RETURNING media_count, transcript_count, channel_count
  `);
  assert.deepEqual(search.rows[0], {
    media_count: 0,
    transcript_count: 0,
    channel_count: 0,
  });

  const parentComment = await pool.query<{ id: string }>(
    `
    INSERT INTO upload_user_comment (updated_at, author_id, upload_id, text)
    VALUES ('2000-01-01T00:00:00Z', $1, $2, 'Parent')
    RETURNING id
  `,
    [creatorId, uploadRow.id],
  );
  const parentCommentId = parentComment.rows[0]?.id;
  assert.ok(parentCommentId);
  const childComment = await pool.query<{ id: string }>(
    `
    INSERT INTO upload_user_comment (
      updated_at,
      author_id,
      upload_id,
      replying_to_id,
      text
    ) VALUES ('2000-01-01T00:00:00Z', $1, $2, $3, 'Child')
    RETURNING id
  `,
    [creatorId, uploadRow.id, parentCommentId],
  );
  const childCommentId = childComment.rows[0]?.id;
  assert.ok(childCommentId);
  await pool.query('DELETE FROM upload_user_comment WHERE id = $1', [
    parentCommentId,
  ]);
  const childAfterDelete = await pool.query<{ replying_to_id: string | null }>(
    'SELECT replying_to_id FROM upload_user_comment WHERE id = $1',
    [childCommentId],
  );
  assert.deepEqual(childAfterDelete.rows, [{ replying_to_id: null }]);

  await pool.query(
    `
    INSERT INTO upload_view (upload_record_id, view_hash, app_user_id)
    VALUES ($1, 1, $2)
  `,
    [uploadRow.id, viewerId],
  );
  await pool.query('DELETE FROM app_user WHERE id = $1', [viewerId]);
  const viewAfterDelete = await pool.query<{ app_user_id: string | null }>(
    `
    SELECT app_user_id FROM upload_view
    WHERE upload_record_id = $1 AND view_hash = 1
  `,
    [uploadRow.id],
  );
  assert.deepEqual(viewAfterDelete.rows, [{ app_user_id: null }]);

  const list = await pool.query<{ id: string }>(
    `
    INSERT INTO upload_list (updated_at, title, author_id, channel_id, type)
    VALUES ('2000-01-01T00:00:00Z', 'Parity list', $1, $2, 'PLAYLIST')
    RETURNING id
  `,
    [creatorId, channelId],
  );
  const listId = list.rows[0]?.id;
  assert.ok(listId);
  await pool.query('DELETE FROM channel WHERE id = $1', [channelId]);
  const listAfterDelete = await pool.query<{ channel_id: string | null }>(
    'SELECT channel_id FROM upload_list WHERE id = $1',
    [listId],
  );
  assert.deepEqual(listAfterDelete.rows, [{ channel_id: null }]);

  await assert.rejects(
    pool.query(
      `
      INSERT INTO app_user (username, full_name, updated_at)
      VALUES ('parity-overlength', $1, now())
    `,
      ['x'.repeat(101)],
    ),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === '22001',
  );

  const orm = drizzle(pool, { schema });
  const [ormUser] = await orm
    .insert(schema.AppUser)
    .values({
      username: 'parity-orm-user',
      updatedAt: new Date('2000-01-01T00:00:00Z'),
    })
    .returning();
  assert.ok(ormUser);
  await orm
    .update(schema.AppUser)
    .set({ fullName: 'Updated by Drizzle' })
    .where(eq(schema.AppUser.id, ormUser.id));
  const updatedOrmUser = await orm.query.AppUser.findFirst({
    where: eq(schema.AppUser.id, ormUser.id),
  });
  assert.ok(updatedOrmUser);
  assert.ok(updatedOrmUser.updatedAt > ormUser.updatedAt);

  const relationChannel = await orm
    .insert(schema.Channel)
    .values({
      name: 'Relation channel',
      slug: 'relation-channel',
      updatedAt: new Date(),
    })
    .returning({ id: schema.Channel.id });
  const relationUpload = await orm
    .insert(schema.UploadRecord)
    .values({
      title: 'Relation upload',
      appUserId: ormUser.id,
      channelId: relationChannel[0]!.id,
      license: 'STANDARD',
      visibility: 'PUBLIC',
      variants: [],
      uploadFinalized: false,
      transcodingProgress: 0,
      score: 0,
      updatedAt: new Date(),
    })
    .returning({ id: schema.UploadRecord.id });
  const uploadWithoutFeatured = await orm.query.UploadRecord.findFirst({
    where: eq(schema.UploadRecord.id, relationUpload[0]!.id),
    with: { featuredUpload: true },
  });
  assert.equal(uploadWithoutFeatured?.featuredUpload, null);

  await orm.insert(schema.FeaturedUpload).values({
    uploadRecordId: relationUpload[0]!.id,
    rank: 1,
    updatedAt: new Date(),
  });
  const uploadWithFeatured = await orm.query.UploadRecord.findFirst({
    where: eq(schema.UploadRecord.id, relationUpload[0]!.id),
    with: { featuredUpload: true },
  });
  const featuredUpload = uploadWithFeatured?.featuredUpload as unknown;
  assert.ok(featuredUpload);
  assert.equal(Array.isArray(featuredUpload), false);
  assert.equal((featuredUpload as { rank: number }).rank, 1);
}

async function assertFixture(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await assertCatalog(pool);
    await assertBehavior(pool);
  } finally {
    await pool.end();
  }
}

test('fresh and upgraded databases converge on the legacy schema contract', async (t) => {
  const adminDatabaseUrl = getAdminDatabaseUrl();
  const freshDatabaseName = makeDatabaseName('fresh');
  const upgradedDatabaseName = makeDatabaseName('upgraded');
  const databaseNames = [freshDatabaseName, upgradedDatabaseName];
  const adminPool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  const cleanupErrors: unknown[] = [];

  try {
    await createDatabase(adminPool, freshDatabaseName);
    await createDatabase(adminPool, upgradedDatabaseName);

    const freshDatabaseUrl = databaseUrlFor(
      adminDatabaseUrl,
      freshDatabaseName,
    );
    const upgradedDatabaseUrl = databaseUrlFor(
      adminDatabaseUrl,
      upgradedDatabaseName,
    );
    await migrateFresh(freshDatabaseUrl);
    await migrateUpgraded(upgradedDatabaseUrl);

    await t.test('fresh Drizzle history', async () => {
      await assertFixture(freshDatabaseUrl);
    });
    await t.test('upgraded Prisma history', async () => {
      await assertFixture(upgradedDatabaseUrl);
    });
  } finally {
    for (const databaseName of databaseNames) {
      try {
        await dropDatabase(adminPool, databaseName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await adminPool.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'failed to fully clean up schema parity databases',
    );
  }
});
