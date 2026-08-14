import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { isDeepStrictEqual } from 'node:util';

import { eq, is } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import * as schema from './schema';

const DB_PACKAGE_FOLDER = join(import.meta.dirname, '..');
const DRIZZLE_CONFIG_PATH = join(DB_PACKAGE_FOLDER, 'drizzle.config.ts');
const DRIZZLE_KIT_PATH = join(
  DB_PACKAGE_FOLDER,
  'node_modules',
  '.bin',
  'drizzle-kit',
);
const DRIZZLE_MIGRATIONS_FOLDER = join(DB_PACKAGE_FOLDER, 'drizzle');
const PRISMA_MIGRATIONS_FOLDER = join(
  DB_PACKAGE_FOLDER,
  'prisma',
  'migrations',
);
const DATABASE_NAME_PATTERN =
  /^lc_schema_parity_(?:fresh|upgraded|reference)_[0-9a-f]{32}$/;
const ANSI_COLOR_PATTERN = new RegExp(
  `${String.fromCodePoint(0x1b)}\\[[0-9;]*m`,
  'g',
);

type CatalogScalar = boolean | number | string | null;
type CatalogValue =
  | CatalogScalar
  | CatalogValue[]
  | { readonly [key: string]: CatalogValue };
type CatalogSnapshot = Readonly<Record<string, CatalogValue>>;
type MutableCatalogSnapshot = Record<string, CatalogValue>;

type CatalogDiff = {
  path: string;
  expected: CatalogValue | undefined;
  actual: CatalogValue | undefined;
};

type ComparisonDirection =
  | 'reference-to-fresh'
  | 'reference-to-upgraded'
  | 'fresh-to-upgraded';

type CatalogException = {
  path: string;
  direction: ComparisonDirection;
  reason: string;
  owner: string;
  removalCondition: string;
};

// Intentional physical-name differences inherited from Prisma are isolated to
// exact schema-defined unique indexes. Remove these when a catalog migration
// renames the upgraded-history indexes.
const LEGACY_UNIQUE_INDEX_NAMES = [
  [
    'organization_invitation',
    'OrganizationInvitation_organizationId_email_key',
  ],
  ['channel_invitation', 'ChannelInvitation_channelId_email_key'],
  ['saved_media', 'SavedMedia_appUserId_uploadRecordId_key'],
  ['upload_list', 'UploadList_createdAt_id_key'],
] as const;

const FRESH_COLUMN_ORDER_EXCEPTIONS = [
  'import_history',
  'llm_call',
  'upload_record',
] as const;

const UPGRADED_COLUMN_ORDER_EXCEPTIONS = [
  'channel',
  'channel_membership',
  'import_history',
  'llm_call',
  'organization',
  'organization_address',
  'organization_channel_association',
  'search_log_entry',
  'upload_record',
] as const;

const FRESH_TO_UPGRADED_COLUMN_ORDER_EXCEPTIONS = [
  'channel',
  'channel_membership',
  'organization',
  'organization_address',
  'organization_channel_association',
  'search_log_entry',
  'upload_record',
] as const;

const CATALOG_EXCEPTIONS: readonly CatalogException[] = [
  ...LEGACY_UNIQUE_INDEX_NAMES.flatMap(([table, name]) =>
    (['reference-to-upgraded', 'fresh-to-upgraded'] as const).map(
      (direction) => ({
        path: catalogPath('indexes', table, name),
        direction,
        reason:
          'The immutable Prisma history created the same unique index under its legacy physical name.',
        owner: 'database maintainers',
        removalCondition:
          'Remove after a catalog migration renames this upgraded-history index to the canonical Drizzle name.',
      }),
    ),
  ),
  ...FRESH_COLUMN_ORDER_EXCEPTIONS.map((table) => ({
    path: catalogPath('columnOrder', table),
    direction: 'reference-to-fresh' as const,
    reason:
      'Incremental migrations appended columns in a different physical order than the canonical declaration.',
    owner: 'database maintainers',
    removalCondition:
      'Remove after the table is rebuilt in canonical declaration order.',
  })),
  ...UPGRADED_COLUMN_ORDER_EXCEPTIONS.map((table) => ({
    path: catalogPath('columnOrder', table),
    direction: 'reference-to-upgraded' as const,
    reason:
      'The immutable Prisma history created columns in a different physical order than the canonical declaration.',
    owner: 'database maintainers',
    removalCondition:
      'Remove after the table is rebuilt in canonical declaration order.',
  })),
  ...FRESH_TO_UPGRADED_COLUMN_ORDER_EXCEPTIONS.map((table) => ({
    path: catalogPath('columnOrder', table),
    direction: 'fresh-to-upgraded' as const,
    reason:
      'The immutable Prisma history created columns in a different physical order than fresh Drizzle migrations.',
    owner: 'database maintainers',
    removalCondition:
      'Remove after the table is rebuilt in canonical declaration order.',
  })),
  {
    path: catalogPath('columns', 'upload_record', 'variants'),
    direction: 'reference-to-upgraded',
    reason:
      'The immutable Prisma history left this array nullable while Drizzle migrations and the canonical schema require it.',
    owner: 'database maintainers',
    removalCondition:
      'Remove after an upgraded-history migration validates and applies NOT NULL.',
  },
  {
    path: catalogPath(
      'indexSemantics',
      'featured_upload',
      '1bd5063afcb6331a99aee3582a30cca1ca2e10fb4596fb3d5d980d76192cadd4',
    ),
    direction: 'reference-to-upgraded',
    reason:
      'The immutable Prisma history retains a redundant unique index over the featured upload primary key.',
    owner: 'database maintainers',
    removalCondition:
      'Remove after an upgraded-history migration drops the redundant unique index.',
  },
  {
    path: catalogPath('columns', 'upload_record', 'variants'),
    direction: 'fresh-to-upgraded',
    reason:
      'The immutable Prisma history left this array nullable while fresh Drizzle migrations require it.',
    owner: 'database maintainers',
    removalCondition:
      'Remove after an upgraded-history migration validates and applies NOT NULL.',
  },
  {
    path: catalogPath(
      'indexSemantics',
      'featured_upload',
      '1bd5063afcb6331a99aee3582a30cca1ca2e10fb4596fb3d5d980d76192cadd4',
    ),
    direction: 'fresh-to-upgraded',
    reason:
      'The immutable Prisma history retains a redundant unique index over the featured upload primary key.',
    owner: 'database maintainers',
    removalCondition:
      'Remove after an upgraded-history migration drops the redundant unique index.',
  },
];

type ExactObjectNames = {
  constraints: ReadonlySet<string>;
  indexes: ReadonlySet<string>;
};

function catalogPath(category: string, ...segments: string[]) {
  return `${category}${segments
    .map((segment) => `[${JSON.stringify(segment)}]`)
    .join('')}`;
}

function exactObjectKey(table: string, name: string) {
  return `${table}\0${name}`;
}

function deriveExactObjectNames(): ExactObjectNames {
  const constraints = new Set<string>();
  const indexes = new Set<string>();

  for (const candidate of Object.values(schema)) {
    if (!is(candidate, PgTable)) continue;
    const table = getTableConfig(candidate);

    // Index declarations and checks always carry intentional physical names.
    // Column unique/primary constraints and FK names remain semantic because
    // PostgreSQL/Prisma generated their legacy physical names differently.
    for (const indexDefinition of table.indexes) {
      if (indexDefinition.config.name) {
        indexes.add(exactObjectKey(table.name, indexDefinition.config.name));
      }
    }
    for (const checkDefinition of table.checks) {
      constraints.add(exactObjectKey(table.name, checkDefinition.name));
    }
  }

  return { constraints, indexes };
}

const EXACT_OBJECT_NAMES = deriveExactObjectNames();

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replaceAll(ANSI_COLOR_PATTERN, '')
    .replaceAll(
      /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,
      '$1[credentials-redacted]@',
    )
    .slice(0, 2_000);
}

function getAdminDatabaseUrl() {
  const adminDatabaseUrl = process.env.PARITY_ADMIN_DATABASE_URL;
  assert.ok(
    adminDatabaseUrl,
    'PostgreSQL prerequisite unavailable: PARITY_ADMIN_DATABASE_URL must point to a disposable-test server admin database',
  );
  const parsed = new URL(adminDatabaseUrl);
  assert.ok(
    parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:',
    'PostgreSQL prerequisite unavailable: PARITY_ADMIN_DATABASE_URL must use postgres:// or postgresql://',
  );
  return adminDatabaseUrl;
}

function makeDatabaseName(kind: 'fresh' | 'reference' | 'upgraded') {
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

function assertDisposableDatabaseUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assertDisposableDatabaseName(databaseName);
  return databaseName;
}

function databaseUrlFor(adminDatabaseUrl: string, databaseName: string) {
  assertDisposableDatabaseName(databaseName);
  const databaseUrl = new URL(adminDatabaseUrl);
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}

async function assertPostgresAvailable(adminPool: Pool) {
  try {
    await adminPool.query('SELECT 1');
  } catch (error) {
    throw new Error(
      `PostgreSQL prerequisite unavailable: ${safeErrorMessage(error)}`,
    );
  }
}

async function createDatabase(adminPool: Pool, databaseName: string) {
  assertDisposableDatabaseName(databaseName);
  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    throw new Error(
      `PostgreSQL prerequisite unavailable or cannot create disposable databases: ${safeErrorMessage(error)}`,
    );
  }
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
  assertDisposableDatabaseUrl(databaseUrl);
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
  assertDisposableDatabaseUrl(databaseUrl);
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

function normalizeExportedPrimaryKeys(exportedSql: string) {
  return exportedSql.replaceAll(
    /CREATE TABLE[\s\S]*?\n\);\n/g,
    (tableDefinition) => {
      const namedSingleColumnPrimaryKeys = new Set(
        [
          ...tableDefinition.matchAll(
            /CONSTRAINT "[^"]+" PRIMARY KEY\("([^"]+)"\)/g,
          ),
        ].map((match) => match[1]),
      );
      if (namedSingleColumnPrimaryKeys.size === 0) return tableDefinition;

      return tableDefinition
        .split('\n')
        .map((line) => {
          const columnName = /^\s*"([^"]+)"\s/.exec(line)?.[1];
          return columnName && namedSingleColumnPrimaryKeys.has(columnName)
            ? line.replace(' PRIMARY KEY', '')
            : line;
        })
        .join('\n');
    },
  );
}

async function exportCanonicalSchema(databaseUrl: string) {
  assertDisposableDatabaseUrl(databaseUrl);
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(
      DRIZZLE_KIT_PATH,
      ['export', '--config', DRIZZLE_CONFIG_PATH],
      {
        cwd: DB_PACKAGE_FOLDER,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-16_000);
    });
    child.once('error', (error) => {
      settled = true;
      reject(
        new Error(
          `failed to start pinned local drizzle-kit: ${safeErrorMessage(error)}`,
        ),
      );
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      if (
        code === 0 &&
        !/(?:^|\n)error:/i.test(stderr) &&
        stdout.includes('CREATE TABLE')
      ) {
        resolve(normalizeExportedPrimaryKeys(stdout));
        return;
      }
      const diagnostics = safeErrorMessage(stderr || stdout || 'no output');
      reject(
        new Error(
          `drizzle-kit could not export the canonical schema (exit ${code ?? signal}): ${diagnostics}`,
        ),
      );
    });
  });
}

async function materializeReference(databaseUrl: string) {
  assertDisposableDatabaseUrl(databaseUrl);
  const exportedSql = await exportCanonicalSchema(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    // citext is a schema dependency rather than a schema-owned object.
    // Catalog snapshots exclude extension-owned objects by pg_depend.deptype.
    await pool.query('CREATE EXTENSION IF NOT EXISTS citext');
    await pool.query('BEGIN');
    try {
      await pool.query(exportedSql);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw new Error('failed to materialize exported canonical schema', {
        cause: error,
      });
    }
  } finally {
    await pool.end();
  }
}

function normalizeExpression(value: string | null) {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized === 'CURRENT_TIMESTAMP' ? 'now()' : normalized;
}

function addCatalogEntry(
  snapshot: MutableCatalogSnapshot,
  path: string,
  value: CatalogValue,
) {
  assert.equal(snapshot[path], undefined, `duplicate catalog path ${path}`);
  snapshot[path] = value;
}

function addSemanticEntry(
  snapshot: MutableCatalogSnapshot,
  category: string,
  table: string,
  definition: CatalogValue,
) {
  const hash = createHash('sha256')
    .update(JSON.stringify(definition))
    .digest('hex');
  const path = catalogPath(category, table, hash);
  const previous = snapshot[path] as
    | { count: number; definition: CatalogValue }
    | undefined;
  snapshot[path] = {
    count: (previous?.count ?? 0) + 1,
    definition,
  };
}

async function snapshotCatalog(
  pool: Pool,
  exactNames: ExactObjectNames = EXACT_OBJECT_NAMES,
): Promise<CatalogSnapshot> {
  const snapshot: MutableCatalogSnapshot = {};

  // public is the application schema. The Drizzle journal is outside public;
  // the Prisma journal is excluded only by its exact `_prisma_migrations`
  // table name. Extension-owned objects require an exact pg_depend edge.
  const tables = await pool.query<{
    table_name: string;
    persistence: string;
    relation_kind: string;
    is_partition: boolean;
  }>(`
    SELECT
      table_relation.relname AS table_name,
      table_relation.relpersistence AS persistence,
      table_relation.relkind AS relation_kind,
      table_relation.relispartition AS is_partition
    FROM pg_class AS table_relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = table_relation.relnamespace
    WHERE
      namespace.nspname = 'public'
      AND table_relation.relname <> '_prisma_migrations'
      AND table_relation.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE
          dependency.classid = 'pg_class'::regclass
          AND dependency.objid = table_relation.oid
          AND dependency.deptype = 'e'
      )
    ORDER BY table_relation.relname
  `);
  for (const table of tables.rows) {
    addCatalogEntry(snapshot, catalogPath('tables', table.table_name), {
      persistence: table.persistence,
      relationKind: table.relation_kind,
      isPartition: table.is_partition,
    });
  }

  const columns = await pool.query<{
    table_name: string;
    column_name: string;
    ordinal_position: number;
    formatted_type: string;
    type_schema: string;
    type_name: string;
    type_kind: string;
    element_type_schema: string | null;
    element_type_name: string | null;
    domain_base_type: string | null;
    enum_name: string | null;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    datetime_precision: number | null;
    nullable: boolean;
    identity_kind: string;
    generated_kind: string;
    collation_schema: string | null;
    collation_name: string | null;
    expression: string | null;
  }>(`
    SELECT
      table_relation.relname AS table_name,
      attribute.attname AS column_name,
      attribute.attnum AS ordinal_position,
      format_type(attribute.atttypid, attribute.atttypmod) AS formatted_type,
      type_namespace.nspname AS type_schema,
      column_type.typname AS type_name,
      column_type.typtype AS type_kind,
      element_namespace.nspname AS element_type_schema,
      element_type.typname AS element_type_name,
      CASE
        WHEN column_type.typtype = 'd'
        THEN format_type(column_type.typbasetype, column_type.typtypmod)
      END AS domain_base_type,
      CASE
        WHEN column_type.typtype = 'e' THEN column_type.typname
        WHEN element_type.typtype = 'e' THEN element_type.typname
      END AS enum_name,
      information_column.character_maximum_length,
      information_column.numeric_precision,
      information_column.numeric_scale,
      information_column.datetime_precision,
      NOT attribute.attnotnull AS nullable,
      attribute.attidentity AS identity_kind,
      attribute.attgenerated AS generated_kind,
      collation_namespace.nspname AS collation_schema,
      column_collation.collname AS collation_name,
      pg_get_expr(column_default.adbin, column_default.adrelid) AS expression
    FROM pg_attribute AS attribute
    JOIN pg_class AS table_relation
      ON table_relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = table_relation.relnamespace
    JOIN pg_type AS column_type
      ON column_type.oid = attribute.atttypid
    JOIN pg_namespace AS type_namespace
      ON type_namespace.oid = column_type.typnamespace
    LEFT JOIN pg_type AS element_type
      ON element_type.oid = column_type.typelem
      AND column_type.typelem <> 0
    LEFT JOIN pg_namespace AS element_namespace
      ON element_namespace.oid = element_type.typnamespace
    LEFT JOIN pg_attrdef AS column_default
      ON column_default.adrelid = attribute.attrelid
      AND column_default.adnum = attribute.attnum
    LEFT JOIN pg_collation AS column_collation
      ON column_collation.oid = attribute.attcollation
      AND attribute.attcollation <> 0
    LEFT JOIN pg_namespace AS collation_namespace
      ON collation_namespace.oid = column_collation.collnamespace
    LEFT JOIN information_schema.columns AS information_column
      ON information_column.table_schema = 'public'
      AND information_column.table_name = table_relation.relname
      AND information_column.column_name = attribute.attname
    WHERE
      namespace.nspname = 'public'
      AND table_relation.relname <> '_prisma_migrations'
      AND table_relation.relkind IN ('r', 'p')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE
          dependency.classid = 'pg_class'::regclass
          AND dependency.objid = table_relation.oid
          AND dependency.deptype = 'e'
      )
    ORDER BY table_relation.relname, attribute.attnum
  `);
  const columnOrderByTable = new Map<string, string[]>();
  for (const column of columns.rows) {
    addCatalogEntry(
      snapshot,
      catalogPath('columns', column.table_name, column.column_name),
      {
        type: column.formatted_type,
        typeSchema: column.type_schema,
        typeName: column.type_name,
        typeKind: column.type_kind,
        elementType:
          column.element_type_name === null
            ? null
            : `${column.element_type_schema}.${column.element_type_name}`,
        domainBaseType: column.domain_base_type,
        enum: column.enum_name,
        characterLength: column.character_maximum_length,
        numericPrecision: column.numeric_precision,
        numericScale: column.numeric_scale,
        datetimePrecision: column.datetime_precision,
        nullable: column.nullable,
        identity: column.identity_kind || null,
        generated: column.generated_kind || null,
        collation:
          column.collation_name === null
            ? null
            : `${column.collation_schema}.${column.collation_name}`,
        expression: normalizeExpression(column.expression),
      },
    );
    const columnOrder = columnOrderByTable.get(column.table_name) ?? [];
    columnOrder.push(column.column_name);
    columnOrderByTable.set(column.table_name, columnOrder);
  }
  for (const [tableName, columnOrder] of columnOrderByTable) {
    addCatalogEntry(
      snapshot,
      catalogPath('columnOrder', tableName),
      columnOrder,
    );
  }

  const constraints = await pool.query<{
    constraint_name: string;
    constraint_type: string;
    table_name: string;
    columns: string[];
    referenced_table: string | null;
    referenced_columns: string[];
    definition: string;
    update_action: string;
    delete_action: string;
    match_type: string;
    validated: boolean;
    deferrable: boolean;
    initially_deferred: boolean;
    no_inherit: boolean;
  }>(`
    SELECT
      constraint_definition.conname AS constraint_name,
      constraint_definition.contype AS constraint_type,
      source_table.relname AS table_name,
      ARRAY(
        SELECT source_attribute.attname::text
        FROM unnest(constraint_definition.conkey)
          WITH ORDINALITY AS source_key(attnum, ordinality)
        JOIN pg_attribute AS source_attribute
          ON source_attribute.attrelid = source_table.oid
          AND source_attribute.attnum = source_key.attnum
        ORDER BY source_key.ordinality
      ) AS columns,
      referenced_table.relname AS referenced_table,
      ARRAY(
        SELECT referenced_attribute.attname::text
        FROM unnest(constraint_definition.confkey)
          WITH ORDINALITY AS referenced_key(attnum, ordinality)
        JOIN pg_attribute AS referenced_attribute
          ON referenced_attribute.attrelid = referenced_table.oid
          AND referenced_attribute.attnum = referenced_key.attnum
        ORDER BY referenced_key.ordinality
      ) AS referenced_columns,
      pg_get_constraintdef(constraint_definition.oid, true) AS definition,
      constraint_definition.confupdtype AS update_action,
      constraint_definition.confdeltype AS delete_action,
      constraint_definition.confmatchtype AS match_type,
      constraint_definition.convalidated AS validated,
      constraint_definition.condeferrable AS deferrable,
      constraint_definition.condeferred AS initially_deferred,
      constraint_definition.connoinherit AS no_inherit
    FROM pg_constraint AS constraint_definition
    JOIN pg_class AS source_table
      ON source_table.oid = constraint_definition.conrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = source_table.relnamespace
    LEFT JOIN pg_class AS referenced_table
      ON referenced_table.oid = constraint_definition.confrelid
    WHERE
      namespace.nspname = 'public'
      AND source_table.relname <> '_prisma_migrations'
      AND constraint_definition.contype IN ('p', 'u', 'c', 'f')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE
          dependency.classid = 'pg_constraint'::regclass
          AND dependency.objid = constraint_definition.oid
          AND dependency.deptype = 'e'
      )
    ORDER BY source_table.relname, constraint_definition.contype, constraint_definition.conname
  `);
  for (const constraint of constraints.rows) {
    const definition: CatalogValue = {
      type: constraint.constraint_type,
      columns: constraint.columns,
      referencedTable: constraint.referenced_table,
      referencedColumns: constraint.referenced_columns,
      expression: normalizeExpression(constraint.definition),
      updateAction: constraint.update_action,
      deleteAction: constraint.delete_action,
      matchType: constraint.match_type,
      validated: constraint.validated,
      deferrable: constraint.deferrable,
      initiallyDeferred: constraint.initially_deferred,
      noInherit: constraint.no_inherit,
    };
    if (constraint.constraint_type !== 'u') {
      addSemanticEntry(
        snapshot,
        'constraintSemantics',
        constraint.table_name,
        definition,
      );
    }
    if (
      exactNames.constraints.has(
        exactObjectKey(constraint.table_name, constraint.constraint_name),
      )
    ) {
      addCatalogEntry(
        snapshot,
        catalogPath(
          'constraints',
          constraint.table_name,
          constraint.constraint_name,
        ),
        definition,
      );
    }
  }

  const indexes = await pool.query<{
    index_name: string;
    table_name: string;
    unique: boolean;
    primary: boolean;
    exclusion: boolean;
    valid: boolean;
    ready: boolean;
    live: boolean;
    nulls_not_distinct: boolean;
    access_method: string;
    key_parts: CatalogValue[];
    include_columns: string[];
    predicate: string | null;
    unique_deferrable: boolean;
    unique_initially_deferred: boolean;
    unique_validated: boolean;
  }>(`
    SELECT
      index_relation.relname AS index_name,
      table_relation.relname AS table_name,
      index_definition.indisunique AS unique,
      index_definition.indisprimary AS primary,
      index_definition.indisexclusion AS exclusion,
      index_definition.indisvalid AS valid,
      index_definition.indisready AS ready,
      index_definition.indislive AS live,
      index_definition.indnullsnotdistinct AS nulls_not_distinct,
      access_method.amname AS access_method,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'expression', pg_get_indexdef(index_relation.oid, key.ordinality::integer, true),
              'opclass', opclass_namespace.nspname || '.' || opclass.opcname,
              'collation', CASE
                WHEN key.collation_oid = 0 THEN NULL
                ELSE collation_namespace.nspname || '.' || index_collation.collname
              END,
              'descending', (key.options & 1) = 1,
              'nullsFirst', (key.options & 2) = 2
            )
            ORDER BY key.ordinality
          )
          FROM unnest(
            index_definition.indclass::oid[],
            index_definition.indcollation::oid[],
            index_definition.indoption::smallint[]
          ) WITH ORDINALITY AS key(
            opclass_oid,
            collation_oid,
            options,
            ordinality
          )
          JOIN pg_opclass AS opclass
            ON opclass.oid = key.opclass_oid
          JOIN pg_namespace AS opclass_namespace
            ON opclass_namespace.oid = opclass.opcnamespace
          LEFT JOIN pg_collation AS index_collation
            ON index_collation.oid = key.collation_oid
            AND key.collation_oid <> 0
          LEFT JOIN pg_namespace AS collation_namespace
            ON collation_namespace.oid = index_collation.collnamespace
          WHERE key.ordinality <= index_definition.indnkeyatts
        ),
        '[]'::jsonb
      ) AS key_parts,
      ARRAY(
        SELECT included_attribute.attname::text
        FROM unnest(index_definition.indkey::smallint[])
          WITH ORDINALITY AS included_key(attnum, ordinality)
        JOIN pg_attribute AS included_attribute
          ON included_attribute.attrelid = table_relation.oid
          AND included_attribute.attnum = included_key.attnum
        WHERE included_key.ordinality > index_definition.indnkeyatts
        ORDER BY included_key.ordinality
      ) AS include_columns,
      pg_get_expr(index_definition.indpred, index_definition.indrelid) AS predicate,
      COALESCE(unique_constraint.condeferrable, false) AS unique_deferrable,
      COALESCE(unique_constraint.condeferred, false) AS unique_initially_deferred,
      COALESCE(unique_constraint.convalidated, true) AS unique_validated
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_definition.indrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = table_relation.relnamespace
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    LEFT JOIN pg_constraint AS unique_constraint
      ON unique_constraint.conindid = index_relation.oid
      AND unique_constraint.contype = 'u'
    WHERE
      namespace.nspname = 'public'
      AND table_relation.relname <> '_prisma_migrations'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE
          dependency.classid = 'pg_class'::regclass
          AND dependency.objid = index_relation.oid
          AND dependency.deptype = 'e'
      )
    ORDER BY table_relation.relname, index_relation.relname
  `);
  for (const indexDefinition of indexes.rows) {
    const definition: CatalogValue = {
      unique: indexDefinition.unique,
      primary: indexDefinition.primary,
      exclusion: indexDefinition.exclusion,
      valid: indexDefinition.valid,
      ready: indexDefinition.ready,
      live: indexDefinition.live,
      nullsNotDistinct: indexDefinition.nulls_not_distinct,
      uniqueDeferrable: indexDefinition.unique_deferrable,
      uniqueInitiallyDeferred: indexDefinition.unique_initially_deferred,
      uniqueValidated: indexDefinition.unique_validated,
      accessMethod: indexDefinition.access_method,
      keyParts: indexDefinition.key_parts.map((keyPart) => {
        const value = keyPart as Record<string, CatalogValue>;
        return {
          ...value,
          expression: normalizeExpression(value.expression as string),
        };
      }),
      includeColumns: indexDefinition.include_columns,
      predicate: normalizeExpression(indexDefinition.predicate),
    };
    addSemanticEntry(
      snapshot,
      'indexSemantics',
      indexDefinition.table_name,
      definition,
    );
    if (
      exactNames.indexes.has(
        exactObjectKey(indexDefinition.table_name, indexDefinition.index_name),
      )
    ) {
      addCatalogEntry(
        snapshot,
        catalogPath(
          'indexes',
          indexDefinition.table_name,
          indexDefinition.index_name,
        ),
        definition,
      );
    }
  }

  const enums = await pool.query<{
    enum_name: string;
    values: string[];
  }>(`
    SELECT
      enum_type.typname AS enum_name,
      array_agg(
        enum_value.enumlabel::text
        ORDER BY enum_value.enumsortorder
      ) AS values
    FROM pg_type AS enum_type
    JOIN pg_enum AS enum_value
      ON enum_value.enumtypid = enum_type.oid
    JOIN pg_namespace AS namespace
      ON namespace.oid = enum_type.typnamespace
    WHERE
      namespace.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE
          dependency.classid = 'pg_type'::regclass
          AND dependency.objid = enum_type.oid
          AND dependency.deptype = 'e'
      )
    GROUP BY enum_type.oid, enum_type.typname
    ORDER BY enum_type.typname
  `);
  for (const enumDefinition of enums.rows) {
    addCatalogEntry(
      snapshot,
      catalogPath('enums', enumDefinition.enum_name),
      enumDefinition.values,
    );
  }

  const sequences = await pool.query<{
    sequence_name: string;
    persistence: string;
    data_type: string;
    start_value: string;
    increment_by: string;
    minimum_value: string;
    maximum_value: string;
    cache_size: string;
    cycles: boolean;
    owned_table: string | null;
    owned_column: string | null;
  }>(`
    SELECT
      sequence_relation.relname AS sequence_name,
      sequence_relation.relpersistence AS persistence,
      format_type(sequence_definition.seqtypid, NULL) AS data_type,
      sequence_definition.seqstart::text AS start_value,
      sequence_definition.seqincrement::text AS increment_by,
      sequence_definition.seqmin::text AS minimum_value,
      sequence_definition.seqmax::text AS maximum_value,
      sequence_definition.seqcache::text AS cache_size,
      sequence_definition.seqcycle AS cycles,
      owned_table.relname AS owned_table,
      owned_attribute.attname AS owned_column
    FROM pg_class AS sequence_relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = sequence_relation.relnamespace
    JOIN pg_sequence AS sequence_definition
      ON sequence_definition.seqrelid = sequence_relation.oid
    LEFT JOIN pg_depend AS ownership
      ON ownership.classid = 'pg_class'::regclass
      AND ownership.objid = sequence_relation.oid
      AND ownership.refclassid = 'pg_class'::regclass
      AND ownership.deptype IN ('a', 'i')
    LEFT JOIN pg_class AS owned_table
      ON owned_table.oid = ownership.refobjid
    LEFT JOIN pg_attribute AS owned_attribute
      ON owned_attribute.attrelid = ownership.refobjid
      AND owned_attribute.attnum = ownership.refobjsubid
    WHERE
      namespace.nspname = 'public'
      AND sequence_relation.relkind = 'S'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE
          dependency.classid = 'pg_class'::regclass
          AND dependency.objid = sequence_relation.oid
          AND dependency.deptype = 'e'
      )
    ORDER BY sequence_relation.relname
  `);
  for (const sequence of sequences.rows) {
    addCatalogEntry(
      snapshot,
      catalogPath('sequences', sequence.sequence_name),
      {
        persistence: sequence.persistence,
        dataType: sequence.data_type,
        start: sequence.start_value,
        increment: sequence.increment_by,
        minimum: sequence.minimum_value,
        maximum: sequence.maximum_value,
        cache: sequence.cache_size,
        cycles: sequence.cycles,
        ownedBy:
          sequence.owned_table === null
            ? null
            : `${sequence.owned_table}.${sequence.owned_column}`,
      },
    );
  }

  return Object.fromEntries(
    Object.entries(snapshot).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function diffCatalogs(
  expected: CatalogSnapshot,
  actual: CatalogSnapshot,
): CatalogDiff[] {
  const paths = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .filter((path) => !isDeepStrictEqual(expected[path], actual[path]))
    .map((path) => ({
      path,
      expected: expected[path],
      actual: actual[path],
    }));
}

function formatCatalogValue(value: CatalogValue | undefined) {
  if (value === undefined) return '<missing>';
  const serialized = JSON.stringify(value);
  return serialized.length <= 600
    ? serialized
    : `${serialized.slice(0, 597)}...`;
}

function formatCatalogDiffs(diffs: readonly CatalogDiff[]) {
  return diffs
    .slice(0, 40)
    .map(
      (diff) =>
        `${diff.path}\n  expected: ${formatCatalogValue(diff.expected)}\n  actual:   ${formatCatalogValue(diff.actual)}`,
    )
    .concat(
      diffs.length > 40
        ? [`... ${diffs.length - 40} additional catalog differences`]
        : [],
    )
    .join('\n');
}

function assertCatalogParity(
  direction: ComparisonDirection,
  expected: CatalogSnapshot,
  actual: CatalogSnapshot,
) {
  const differences = diffCatalogs(expected, actual);
  const exceptions = CATALOG_EXCEPTIONS.filter(
    (exception) => exception.direction === direction,
  );
  const exceptedPaths = new Set<string>();

  for (const exception of exceptions) {
    assert.ok(
      !exception.path.includes('*'),
      `catalog exception cannot wildcard a path: ${exception.path}`,
    );
    assert.ok(exception.reason.trim(), `${exception.path} needs a reason`);
    assert.ok(exception.owner.trim(), `${exception.path} needs an owner`);
    assert.ok(
      exception.removalCondition.trim(),
      `${exception.path} needs a removal condition`,
    );
    const matches = differences.filter(
      (difference) => difference.path === exception.path,
    );
    assert.equal(
      matches.length,
      1,
      `catalog exception ${direction}:${exception.path} must match exactly one current difference`,
    );
    exceptedPaths.add(exception.path);
  }

  const unexpected = differences.filter(
    (difference) => !exceptedPaths.has(difference.path),
  );
  assert.equal(
    unexpected.length,
    0,
    `${direction} schema parity mismatch:\n${formatCatalogDiffs(unexpected)}`,
  );
}

type OmissionCanary = {
  name: string;
  sql: string;
  expectedPath: string;
  allowedPrefixes?: readonly string[];
  exactConstraint?: { table: string; name: string };
  exactIndex?: { table: string; name: string };
};

const TRACKING_SALT_CONSTRAINT_SEMANTICS = catalogPath(
  'constraintSemantics',
  'tracking_salt',
);
const TRACKING_SALT_INDEX_SEMANTICS = catalogPath(
  'indexSemantics',
  'tracking_salt',
);

const OMISSION_CANARIES: readonly OmissionCanary[] = [
  {
    name: 'extra table',
    sql: 'CREATE TABLE public.parity_canary_table (id integer)',
    expectedPath: catalogPath('tables', 'parity_canary_table'),
    allowedPrefixes: [
      catalogPath('columns', 'parity_canary_table'),
      catalogPath('columnOrder', 'parity_canary_table'),
    ],
  },
  {
    name: 'extra column',
    sql: 'ALTER TABLE tracking_salt ADD COLUMN parity_canary_column text',
    expectedPath: catalogPath(
      'columns',
      'tracking_salt',
      'parity_canary_column',
    ),
    allowedPrefixes: [catalogPath('columnOrder', 'tracking_salt')],
  },
  {
    name: 'extra index',
    sql: 'CREATE INDEX parity_canary_index ON tracking_salt (salt)',
    expectedPath: catalogPath(
      'indexes',
      'tracking_salt',
      'parity_canary_index',
    ),
    allowedPrefixes: [TRACKING_SALT_INDEX_SEMANTICS],
    exactIndex: { table: 'tracking_salt', name: 'parity_canary_index' },
  },
  {
    name: 'extra unique constraint',
    sql: 'ALTER TABLE tracking_salt ADD CONSTRAINT parity_canary_unique UNIQUE (salt)',
    expectedPath: catalogPath(
      'constraints',
      'tracking_salt',
      'parity_canary_unique',
    ),
    allowedPrefixes: [
      TRACKING_SALT_CONSTRAINT_SEMANTICS,
      TRACKING_SALT_INDEX_SEMANTICS,
    ],
    exactConstraint: {
      table: 'tracking_salt',
      name: 'parity_canary_unique',
    },
  },
  {
    name: 'extra check constraint',
    sql: 'ALTER TABLE tracking_salt ADD CONSTRAINT parity_canary_check CHECK (salt > 0)',
    expectedPath: catalogPath(
      'constraints',
      'tracking_salt',
      'parity_canary_check',
    ),
    allowedPrefixes: [TRACKING_SALT_CONSTRAINT_SEMANTICS],
    exactConstraint: {
      table: 'tracking_salt',
      name: 'parity_canary_check',
    },
  },
  {
    name: 'extra composite foreign key with actions',
    sql: `ALTER TABLE upload_view_second
      ADD CONSTRAINT parity_canary_foreign_key
      FOREIGN KEY (upload_record_id, view_hash)
      REFERENCES upload_view (upload_record_id, view_hash)
      MATCH FULL ON UPDATE RESTRICT ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED`,
    expectedPath: catalogPath(
      'constraints',
      'upload_view_second',
      'parity_canary_foreign_key',
    ),
    allowedPrefixes: [catalogPath('constraintSemantics', 'upload_view_second')],
    exactConstraint: {
      table: 'upload_view_second',
      name: 'parity_canary_foreign_key',
    },
  },
  {
    name: 'extra enum',
    sql: "CREATE TYPE parity_canary_enum AS ENUM ('one', 'two')",
    expectedPath: catalogPath('enums', 'parity_canary_enum'),
  },
  {
    name: 'extra ordered enum value',
    sql: "ALTER TYPE address_type ADD VALUE 'PARITY_CANARY' BEFORE 'OTHER'",
    expectedPath: catalogPath('enums', 'address_type'),
  },
  {
    name: 'changed default',
    sql: 'ALTER TABLE tracking_salt ALTER COLUMN salt SET DEFAULT 42',
    expectedPath: catalogPath('columns', 'tracking_salt', 'salt'),
  },
  {
    name: 'changed nullability',
    sql: 'ALTER TABLE tracking_salt ALTER COLUMN salt DROP NOT NULL',
    expectedPath: catalogPath('columns', 'tracking_salt', 'salt'),
  },
  {
    name: 'changed type',
    sql: 'ALTER TABLE tracking_salt ALTER COLUMN salt TYPE bigint',
    expectedPath: catalogPath('columns', 'tracking_salt', 'salt'),
  },
  {
    name: 'partial index',
    sql: 'CREATE INDEX parity_canary_partial_index ON tracking_salt (salt) WHERE salt > 0',
    expectedPath: catalogPath(
      'indexes',
      'tracking_salt',
      'parity_canary_partial_index',
    ),
    allowedPrefixes: [TRACKING_SALT_INDEX_SEMANTICS],
    exactIndex: {
      table: 'tracking_salt',
      name: 'parity_canary_partial_index',
    },
  },
  {
    name: 'expression index',
    sql: 'CREATE INDEX parity_canary_expression_index ON tracking_salt ((salt + 1))',
    expectedPath: catalogPath(
      'indexes',
      'tracking_salt',
      'parity_canary_expression_index',
    ),
    allowedPrefixes: [TRACKING_SALT_INDEX_SEMANTICS],
    exactIndex: {
      table: 'tracking_salt',
      name: 'parity_canary_expression_index',
    },
  },
  {
    name: 'include index',
    sql: 'CREATE INDEX parity_canary_include_index ON tracking_salt (salt) INCLUDE (created_at)',
    expectedPath: catalogPath(
      'indexes',
      'tracking_salt',
      'parity_canary_include_index',
    ),
    allowedPrefixes: [TRACKING_SALT_INDEX_SEMANTICS],
    exactIndex: {
      table: 'tracking_salt',
      name: 'parity_canary_include_index',
    },
  },
  {
    name: 'deleted expected object',
    sql: 'DROP INDEX organization_invitation_email_idx',
    expectedPath: catalogPath(
      'indexes',
      'organization_invitation',
      'organization_invitation_email_idx',
    ),
    allowedPrefixes: [catalogPath('indexSemantics', 'organization_invitation')],
  },
];

function exactNamesForCanary(canary: OmissionCanary): ExactObjectNames {
  const constraints = new Set(EXACT_OBJECT_NAMES.constraints);
  const indexes = new Set(EXACT_OBJECT_NAMES.indexes);
  if (canary.exactConstraint) {
    constraints.add(
      exactObjectKey(canary.exactConstraint.table, canary.exactConstraint.name),
    );
  }
  if (canary.exactIndex) {
    indexes.add(
      exactObjectKey(canary.exactIndex.table, canary.exactIndex.name),
    );
  }
  return { constraints, indexes };
}

async function assertOmissionCanaries(
  databaseUrl: string,
  baseline: CatalogSnapshot,
  parent: TestContext,
) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    for (const canary of OMISSION_CANARIES) {
      await parent.test(canary.name, async () => {
        await pool.query('BEGIN');
        try {
          await pool.query(canary.sql);
          const mutated = await snapshotCatalog(
            pool,
            exactNamesForCanary(canary),
          );
          const differences = diffCatalogs(baseline, mutated);
          assert.ok(
            differences.some(
              (difference) => difference.path === canary.expectedPath,
            ),
            `${canary.name} did not report ${canary.expectedPath}:\n${formatCatalogDiffs(differences)}`,
          );
          const allowedPrefixes = [
            canary.expectedPath,
            ...(canary.allowedPrefixes ?? []),
          ];
          const unrelated = differences.filter(
            (difference) =>
              !allowedPrefixes.some((prefix) =>
                difference.path.startsWith(prefix),
              ),
          );
          assert.deepEqual(
            unrelated,
            [],
            `${canary.name} produced unfocused catalog differences:\n${formatCatalogDiffs(unrelated)}`,
          );
        } finally {
          await pool.query('ROLLBACK');
        }
      });
    }
  } finally {
    await pool.end();
  }
}

async function runWithCleanup(
  body: () => Promise<void>,
  cleanupTasks: readonly (() => Promise<void>)[],
) {
  const errors: unknown[] = [];
  try {
    await body();
  } catch (error) {
    errors.push(error);
  } finally {
    for (const cleanup of cleanupTasks) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(
      errors,
      'schema parity fixture failed or could not be fully cleaned up',
    );
  }
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

  const list = await pool.query<{ id: string; visibility: string }>(
    `
    INSERT INTO upload_list (updated_at, title, author_id, channel_id, type)
    VALUES ('2000-01-01T00:00:00Z', 'Parity list', $1, $2, 'PLAYLIST')
    RETURNING id, visibility
  `,
    [creatorId, channelId],
  );
  const listId = list.rows[0]?.id;
  assert.ok(listId);
  assert.equal(list.rows[0]?.visibility, 'PUBLIC');
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

async function snapshotDatabase(databaseUrl: string) {
  assertDisposableDatabaseUrl(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    return await snapshotCatalog(pool);
  } finally {
    await pool.end();
  }
}

async function assertBehaviorFixture(databaseUrl: string) {
  assertDisposableDatabaseUrl(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await assertBehavior(pool);
  } finally {
    await pool.end();
  }
}

test('cleanup attempts every disposable database after fixture failure', async () => {
  for (const failureStage of ['setup', 'assertion']) {
    const cleaned: string[] = [];
    await assert.rejects(
      runWithCleanup(
        async () => {
          throw new Error(`${failureStage} failure`);
        },
        ['fresh', 'upgraded', 'reference'].map((databaseName) => async () => {
          cleaned.push(databaseName);
          if (databaseName === 'fresh') {
            throw new Error('first cleanup failure');
          }
        }),
      ),
      (error: unknown) =>
        error instanceof AggregateError && error.errors.length === 2,
    );
    assert.deepEqual(cleaned, ['fresh', 'upgraded', 'reference']);
  }
});

test('fresh, upgraded, and schema-reference catalogs converge', async (t) => {
  const adminDatabaseUrl = getAdminDatabaseUrl();
  const freshDatabaseName = makeDatabaseName('fresh');
  const upgradedDatabaseName = makeDatabaseName('upgraded');
  const referenceDatabaseName = makeDatabaseName('reference');
  const adminPool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  const freshDatabaseUrl = databaseUrlFor(adminDatabaseUrl, freshDatabaseName);
  const upgradedDatabaseUrl = databaseUrlFor(
    adminDatabaseUrl,
    upgradedDatabaseName,
  );
  const referenceDatabaseUrl = databaseUrlFor(
    adminDatabaseUrl,
    referenceDatabaseName,
  );

  await runWithCleanup(async () => {
    await assertPostgresAvailable(adminPool);
    await createDatabase(adminPool, freshDatabaseName);
    await createDatabase(adminPool, upgradedDatabaseName);
    await createDatabase(adminPool, referenceDatabaseName);

    await migrateFresh(freshDatabaseUrl);
    await migrateUpgraded(upgradedDatabaseUrl);
    await materializeReference(referenceDatabaseUrl);

    const freshCatalog = await snapshotDatabase(freshDatabaseUrl);
    const upgradedCatalog = await snapshotDatabase(upgradedDatabaseUrl);
    const referenceCatalog = await snapshotDatabase(referenceDatabaseUrl);

    await t.test('complete catalog convergence', () => {
      assertCatalogParity('reference-to-fresh', referenceCatalog, freshCatalog);
      assertCatalogParity(
        'reference-to-upgraded',
        referenceCatalog,
        upgradedCatalog,
      );
      assertCatalogParity('fresh-to-upgraded', freshCatalog, upgradedCatalog);
    });

    await t.test('omission canaries', async (canaryTest) => {
      await assertOmissionCanaries(
        referenceDatabaseUrl,
        referenceCatalog,
        canaryTest,
      );
    });

    await t.test('fresh Drizzle behavior', async () => {
      await assertBehaviorFixture(freshDatabaseUrl);
    });
    await t.test('upgraded Prisma behavior', async () => {
      await assertBehaviorFixture(upgradedDatabaseUrl);
    });
    await t.test('schema-reference behavior', async () => {
      await assertBehaviorFixture(referenceDatabaseUrl);
    });
  }, [
    () => dropDatabase(adminPool, freshDatabaseName),
    () => dropDatabase(adminPool, upgradedDatabaseName),
    () => dropDatabase(adminPool, referenceDatabaseName),
    () => adminPool.end(),
  ]);
});
