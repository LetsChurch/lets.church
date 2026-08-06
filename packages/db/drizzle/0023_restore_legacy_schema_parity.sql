DO $$
DECLARE
	target record;
	existing_fk record;
	existing_index record;
	existing_enum_values text[];
	overlong_count bigint;
	known_constraint_count integer;
	unexpected_enum_columns integer;
BEGIN
	-- Fail before mutating anything if a bounded column contains data that
	-- PostgreSQL would reject. Never include values in the error message.
	FOR target IN
		SELECT *
		FROM (
			VALUES
				('app_user', 'full_name', 100),
				('app_user', 'avatar_path', 255),
				('app_user', 'avatar_blurhash', 255),
				('channel', 'avatar_path', 255),
				('channel', 'avatar_blurhash', 255),
				('channel', 'cover_path', 255),
				('channel', 'cover_blurhash', 255),
				('channel', 'default_thumbnail_path', 255),
				('channel', 'default_thumbnail_blurhash', 255),
				('channel_import_source', 'workflow_id', 255)
		) AS bounded_columns(table_name, column_name, max_length)
	LOOP
		EXECUTE format(
			'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND length(%I) > $1',
			target.table_name,
			target.column_name,
			target.column_name
		)
		INTO overlong_count
		USING target.max_length;

		IF overlong_count > 0 THEN
			RAISE EXCEPTION 'Cannot bound %.%: % rows exceed % characters',
				target.table_name,
				target.column_name,
				overlong_count,
				target.max_length;
		END IF;
	END LOOP;

	-- Prisma appended UploadStateType values over time, while the Drizzle
	-- baseline creates the current declaration order. Accept only those two
	-- known histories before normalizing them below.
	SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder)
	INTO existing_enum_values
	FROM pg_type AS enum_type
	JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
	JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
	WHERE
		namespace.nspname = 'public'
		AND enum_type.typname = 'upload_state_type';

	IF existing_enum_values IS DISTINCT FROM ARRAY[
		'MEDIA',
		'THUMBNAIL',
		'PROFILE_AVATAR',
		'CHANNEL_AVATAR',
		'CHANNEL_COVER',
		'ORGANIZATION_AVATAR',
		'ORGANIZATION_COVER',
		'CHANNEL_DEFAULT_THUMBNAIL'
	]::text[] AND existing_enum_values IS DISTINCT FROM ARRAY[
		'MEDIA',
		'THUMBNAIL',
		'PROFILE_AVATAR',
		'CHANNEL_AVATAR',
		'ORGANIZATION_AVATAR',
		'CHANNEL_DEFAULT_THUMBNAIL',
		'CHANNEL_COVER',
		'ORGANIZATION_COVER'
	]::text[] THEN
		RAISE EXCEPTION 'Unexpected upload_state_type value order';
	END IF;

	IF existing_enum_values[5] = 'ORGANIZATION_AVATAR' THEN
		SELECT count(*)
		INTO unexpected_enum_columns
		FROM pg_attribute AS attribute
		JOIN pg_class AS table_relation ON table_relation.oid = attribute.attrelid
		JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
		JOIN pg_type AS enum_type ON enum_type.oid = attribute.atttypid
		WHERE
			namespace.nspname = 'public'
			AND enum_type.typname = 'upload_state_type'
			AND table_relation.relkind IN ('r', 'p')
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped
			AND NOT (
				table_relation.relname = 'upload_state'
				AND attribute.attname = 'upload_type'
			);

		IF unexpected_enum_columns > 0 THEN
			RAISE EXCEPTION 'upload_state_type has unexpected column dependencies: %',
				unexpected_enum_columns;
		END IF;
	END IF;

	-- Accept either the legacy Prisma or Drizzle constraint name, but reject a
	-- known name whose columns, target, or update action do not match.
	FOR target IN
		SELECT *
		FROM (
			VALUES
				(
					'upload_user_comment',
					ARRAY['replying_to_id']::text[],
					'upload_user_comment',
					ARRAY['id']::text[],
					'upload_user_comment_replying_to_id_fkey',
					'upload_user_comment_replyingTo_fkey'
				),
				(
					'upload_view',
					ARRAY['app_user_id']::text[],
					'app_user',
					ARRAY['id']::text[],
					'upload_view_app_user_id_fkey',
					'upload_view_user_fkey'
				),
				(
					'upload_list',
					ARRAY['channel_id']::text[],
					'channel',
					ARRAY['id']::text[],
					'upload_list_channel_id_fkey',
					'upload_list_channel_fkey'
				)
		) AS foreign_keys(
			table_name,
			columns,
			referenced_table,
			referenced_columns,
			legacy_name,
			drizzle_name
		)
	LOOP
		known_constraint_count := 0;

		FOR existing_fk IN
			SELECT
				constraint_definition.conname,
				constraint_definition.contype,
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
				constraint_definition.confupdtype AS update_action
			FROM pg_constraint AS constraint_definition
			JOIN pg_class AS source_table
				ON source_table.oid = constraint_definition.conrelid
			JOIN pg_namespace AS source_namespace
				ON source_namespace.oid = source_table.relnamespace
			LEFT JOIN pg_class AS referenced_table
				ON referenced_table.oid = constraint_definition.confrelid
			WHERE
				source_namespace.nspname = 'public'
				AND source_table.relname = target.table_name
				AND constraint_definition.conname IN (
					target.legacy_name,
					target.drizzle_name
				)
		LOOP
			known_constraint_count := known_constraint_count + 1;

			IF
				existing_fk.contype <> 'f'
				OR existing_fk.table_name <> target.table_name
				OR existing_fk.columns IS DISTINCT FROM target.columns
				OR existing_fk.referenced_table <> target.referenced_table
				OR existing_fk.referenced_columns IS DISTINCT FROM target.referenced_columns
				OR existing_fk.update_action <> 'c'
			THEN
				RAISE EXCEPTION 'Conflicting foreign key definition: %.%',
					target.table_name,
					existing_fk.conname;
			END IF;
		END LOOP;

		IF known_constraint_count = 0 THEN
			RAISE EXCEPTION 'No known foreign key exists for %.%',
				target.table_name,
				target.columns[1];
		END IF;
	END LOOP;

	-- Existing Prisma indexes already use the desired physical names. Validate
	-- them exactly enough to reject name collisions before using IF NOT EXISTS.
	FOR target IN
		SELECT
			index_name,
			table_name,
			columns,
			descending,
			descending AS nulls_first
		FROM (
			VALUES
				('organization_invitation_email_idx', 'organization_invitation', ARRAY['email']::text[], ARRAY[false]::boolean[]),
				('organization_invitation_status_expires_at_idx', 'organization_invitation', ARRAY['status', 'expires_at']::text[], ARRAY[false, false]::boolean[]),
				('channel_invitation_email_idx', 'channel_invitation', ARRAY['email']::text[], ARRAY[false]::boolean[]),
				('channel_invitation_status_expires_at_idx', 'channel_invitation', ARRAY['status', 'expires_at']::text[], ARRAY[false, false]::boolean[]),
				('upload_state_backup_status_idx', 'upload_state', ARRAY['backup_status']::text[], ARRAY[false]::boolean[]),
				('upload_state_upload_type_idx', 'upload_state', ARRAY['upload_type']::text[], ARRAY[false]::boolean[]),
				('upload_record_created_at_id_idx', 'upload_record', ARRAY['created_at', 'id']::text[], ARRAY[false, false]::boolean[]),
				('upload_record_score_idx', 'upload_record', ARRAY['score']::text[], ARRAY[false]::boolean[]),
				('upload_record_score_stale_at_idx', 'upload_record', ARRAY['score_stale_at']::text[], ARRAY[false]::boolean[]),
				('upload_user_rating_upload_id_rating_idx', 'upload_user_rating', ARRAY['upload_id', 'rating']::text[], ARRAY[false, false]::boolean[]),
				('upload_user_rating_app_user_id_rating_idx', 'upload_user_rating', ARRAY['app_user_id', 'rating']::text[], ARRAY[false, false]::boolean[]),
				('upload_user_comment_replying_to_id_idx', 'upload_user_comment', ARRAY['replying_to_id']::text[], ARRAY[false]::boolean[]),
				('upload_user_comment_score_idx', 'upload_user_comment', ARRAY['score']::text[], ARRAY[false]::boolean[]),
				('upload_user_comment_score_stale_at_idx', 'upload_user_comment', ARRAY['score_stale_at']::text[], ARRAY[false]::boolean[]),
				('upload_user_comment_rating_upload_user_comment_id_rating_idx', 'upload_user_comment_rating', ARRAY['upload_user_comment_id', 'rating']::text[], ARRAY[false, false]::boolean[]),
				('upload_user_comment_rating_app_user_id_rating_idx', 'upload_user_comment_rating', ARRAY['app_user_id', 'rating']::text[], ARRAY[false, false]::boolean[]),
				('upload_view_app_user_id_upload_record_id_idx', 'upload_view', ARRAY['app_user_id', 'upload_record_id']::text[], ARRAY[false, false]::boolean[]),
				('upload_view_created_at_idx', 'upload_view', ARRAY['created_at']::text[], ARRAY[false]::boolean[]),
				('upload_view_second_upload_record_id_second_idx', 'upload_view_second', ARRAY['upload_record_id', 'second']::text[], ARRAY[false, false]::boolean[]),
				('upload_list_entry_upload_list_id_rank_created_at_idx', 'upload_list_entry', ARRAY['upload_list_id', 'rank', 'created_at']::text[], ARRAY[false, false, false]::boolean[]),
				('search_log_entry_app_user_id_user_deleted_at_created_at_idx', 'search_log_entry', ARRAY['app_user_id', 'user_deleted_at', 'created_at']::text[], ARRAY[false, false, true]::boolean[]),
				('search_log_entry_created_at_idx', 'search_log_entry', ARRAY['created_at']::text[], ARRAY[true]::boolean[]),
				('saved_media_app_user_id_created_at_idx', 'saved_media', ARRAY['app_user_id', 'created_at']::text[], ARRAY[false, false]::boolean[]),
				('featured_upload_rank_idx', 'featured_upload', ARRAY['rank']::text[], ARRAY[false]::boolean[]),
				('channel_import_source_channel_id_idx', 'channel_import_source', ARRAY['channel_id']::text[], ARRAY[false]::boolean[]),
				('channel_import_source_enabled_idx', 'channel_import_source', ARRAY['enabled']::text[], ARRAY[false]::boolean[]),
				('channel_import_source_workflow_status_idx', 'channel_import_source', ARRAY['workflow_status']::text[], ARRAY[false]::boolean[]),
				('channel_import_run_import_source_id_started_at_idx', 'channel_import_run', ARRAY['import_source_id', 'started_at']::text[], ARRAY[false, false]::boolean[]),
				('channel_import_run_status_idx', 'channel_import_run', ARRAY['status']::text[], ARRAY[false]::boolean[]),
				('import_history_import_source_id_published_at_idx', 'import_history', ARRAY['import_source_id', 'published_at']::text[], ARRAY[false, false]::boolean[]),
				('import_history_import_source_id_title_idx', 'import_history', ARRAY['import_source_id', 'title']::text[], ARRAY[false, false]::boolean[]),
				('import_history_import_source_id_url_idx', 'import_history', ARRAY['import_source_id', 'url']::text[], ARRAY[false, false]::boolean[])
		) AS indexes(index_name, table_name, columns, descending)
	LOOP
		SELECT
			index_relation.relkind,
			table_relation.relname AS table_name,
			index_definition.indisunique AS is_unique,
			index_definition.indpred IS NULL AS has_no_predicate,
			access_method.amname AS access_method,
			ARRAY(
				SELECT attribute.attname::text
				FROM unnest(index_definition.indkey::smallint[])
					WITH ORDINALITY AS key(attnum, ordinality)
				LEFT JOIN pg_attribute AS attribute
					ON attribute.attrelid = table_relation.oid
					AND attribute.attnum = key.attnum
				WHERE key.ordinality <= index_definition.indnkeyatts
				ORDER BY key.ordinality
			) AS columns,
			ARRAY(
				SELECT (option.value & 1) = 1
				FROM unnest(index_definition.indoption::smallint[])
					WITH ORDINALITY AS option(value, ordinality)
				WHERE option.ordinality <= index_definition.indnkeyatts
				ORDER BY option.ordinality
			) AS descending,
			ARRAY(
				SELECT (option.value & 2) = 2
				FROM unnest(index_definition.indoption::smallint[])
					WITH ORDINALITY AS option(value, ordinality)
				WHERE option.ordinality <= index_definition.indnkeyatts
				ORDER BY option.ordinality
			) AS nulls_first
		INTO existing_index
		FROM pg_class AS index_relation
		JOIN pg_namespace AS namespace
			ON namespace.oid = index_relation.relnamespace
		LEFT JOIN pg_index AS index_definition
			ON index_definition.indexrelid = index_relation.oid
		LEFT JOIN pg_class AS table_relation
			ON table_relation.oid = index_definition.indrelid
		LEFT JOIN pg_am AS access_method
			ON access_method.oid = index_relation.relam
		WHERE
			namespace.nspname = 'public'
			AND index_relation.relname = target.index_name;

		IF FOUND AND (
			existing_index.relkind NOT IN ('i', 'I')
			OR existing_index.table_name <> target.table_name
			OR existing_index.is_unique
			OR NOT existing_index.has_no_predicate
			OR existing_index.access_method <> 'btree'
			OR existing_index.columns IS DISTINCT FROM target.columns
			OR existing_index.descending IS DISTINCT FROM target.descending
			OR existing_index.nulls_first IS DISTINCT FROM target.nulls_first
		) THEN
			RAISE EXCEPTION 'Conflicting index definition: %', target.index_name;
		END IF;
	END LOOP;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
	existing_enum_values text[];
BEGIN
	SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder)
	INTO existing_enum_values
	FROM pg_type AS enum_type
	JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
	JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
	WHERE
		namespace.nspname = 'public'
		AND enum_type.typname = 'upload_state_type';

	IF existing_enum_values[5] = 'ORGANIZATION_AVATAR' THEN
		ALTER TYPE "public"."upload_state_type" RENAME TO "upload_state_type_prisma_order";
		CREATE TYPE "public"."upload_state_type" AS ENUM(
			'MEDIA',
			'THUMBNAIL',
			'PROFILE_AVATAR',
			'CHANNEL_AVATAR',
			'CHANNEL_COVER',
			'ORGANIZATION_AVATAR',
			'ORGANIZATION_COVER',
			'CHANNEL_DEFAULT_THUMBNAIL'
		);
		ALTER TABLE "public"."upload_state"
			ALTER COLUMN "upload_type" TYPE "public"."upload_state_type"
			USING "upload_type"::text::"public"."upload_state_type";
		DROP TYPE "public"."upload_state_type_prisma_order";
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "full_name" TYPE varchar(100) USING "full_name"::varchar(100);--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "avatar_path" TYPE varchar(255) USING "avatar_path"::varchar(255);--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "avatar_blurhash" TYPE varchar(255) USING "avatar_blurhash"::varchar(255);--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "avatar_path" TYPE varchar(255) USING "avatar_path"::varchar(255);--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "avatar_blurhash" TYPE varchar(255) USING "avatar_blurhash"::varchar(255);--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "cover_path" TYPE varchar(255) USING "cover_path"::varchar(255);--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "cover_blurhash" TYPE varchar(255) USING "cover_blurhash"::varchar(255);--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "default_thumbnail_path" TYPE varchar(255) USING "default_thumbnail_path"::varchar(255);--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "default_thumbnail_blurhash" TYPE varchar(255) USING "default_thumbnail_blurhash"::varchar(255);--> statement-breakpoint
ALTER TABLE "channel_import_source" ALTER COLUMN "workflow_id" TYPE varchar(255) USING "workflow_id"::varchar(255);--> statement-breakpoint
ALTER TABLE "channel_import_run" ALTER COLUMN "items_found" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "channel_import_run" ALTER COLUMN "items_imported" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "channel_import_run" ALTER COLUMN "items_skipped" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "channel_import_run" ALTER COLUMN "items_failed" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "channel_import_source" ALTER COLUMN "deduplication_enabled" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "channel_invitation" ALTER COLUMN "is_admin" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "channel_invitation" ALTER COLUMN "can_edit" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "channel_invitation" ALTER COLUMN "can_download" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "channel_membership" ALTER COLUMN "is_admin" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "channel_membership" ALTER COLUMN "can_edit" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "channel_membership" ALTER COLUMN "can_download" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "newsletter_mailing_list" ALTER COLUMN "subscribe_on_registration" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "automatically_approve_organization_associations" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization_channel_association" ALTER COLUMN "official_channel" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization_invitation" ALTER COLUMN "is_admin" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization_invitation" ALTER COLUMN "can_edit" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization_membership" ALTER COLUMN "is_admin" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization_membership" ALTER COLUMN "can_edit" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization_organization_association" ALTER COLUMN "upstream_approved" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization_organization_association" ALTER COLUMN "downstream_approved" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "search_log_entry" ALTER COLUMN "media_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "search_log_entry" ALTER COLUMN "transcript_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "search_log_entry" ALTER COLUMN "channel_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "upload_record" ALTER COLUMN "upload_finalized" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "upload_record" ALTER COLUMN "transcoding_progress" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "upload_record" ALTER COLUMN "score" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "upload_user_comment" ALTER COLUMN "score" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "upload_list" DROP CONSTRAINT IF EXISTS "upload_list_channel_id_fkey";--> statement-breakpoint
ALTER TABLE "upload_list" DROP CONSTRAINT IF EXISTS "upload_list_channel_fkey";--> statement-breakpoint
ALTER TABLE "upload_list" ADD CONSTRAINT "upload_list_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_user_comment" DROP CONSTRAINT IF EXISTS "upload_user_comment_replying_to_id_fkey";--> statement-breakpoint
ALTER TABLE "upload_user_comment" DROP CONSTRAINT IF EXISTS "upload_user_comment_replyingTo_fkey";--> statement-breakpoint
ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_replyingTo_fkey" FOREIGN KEY ("replying_to_id") REFERENCES "public"."upload_user_comment"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "upload_view" DROP CONSTRAINT IF EXISTS "upload_view_app_user_id_fkey";--> statement-breakpoint
ALTER TABLE "upload_view" DROP CONSTRAINT IF EXISTS "upload_view_user_fkey";--> statement-breakpoint
ALTER TABLE "upload_view" ADD CONSTRAINT "upload_view_user_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_import_run_import_source_id_started_at_idx" ON "channel_import_run" USING btree ("import_source_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_import_run_status_idx" ON "channel_import_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_import_source_channel_id_idx" ON "channel_import_source" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_import_source_enabled_idx" ON "channel_import_source" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_import_source_workflow_status_idx" ON "channel_import_source" USING btree ("workflow_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_invitation_email_idx" ON "channel_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_invitation_status_expires_at_idx" ON "channel_invitation" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "featured_upload_rank_idx" ON "featured_upload" USING btree ("rank");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_history_import_source_id_published_at_idx" ON "import_history" USING btree ("import_source_id","published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_history_import_source_id_title_idx" ON "import_history" USING btree ("import_source_id","title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_history_import_source_id_url_idx" ON "import_history" USING btree ("import_source_id","url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_invitation_email_idx" ON "organization_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_invitation_status_expires_at_idx" ON "organization_invitation" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_media_app_user_id_created_at_idx" ON "saved_media" USING btree ("app_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_log_entry_app_user_id_user_deleted_at_created_at_idx" ON "search_log_entry" USING btree ("app_user_id","user_deleted_at","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_log_entry_created_at_idx" ON "search_log_entry" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_list_entry_upload_list_id_rank_created_at_idx" ON "upload_list_entry" USING btree ("upload_list_id","rank","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_record_created_at_id_idx" ON "upload_record" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_record_score_idx" ON "upload_record" USING btree ("score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_record_score_stale_at_idx" ON "upload_record" USING btree ("score_stale_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_state_backup_status_idx" ON "upload_state" USING btree ("backup_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_state_upload_type_idx" ON "upload_state" USING btree ("upload_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_replying_to_id_idx" ON "upload_user_comment" USING btree ("replying_to_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_score_idx" ON "upload_user_comment" USING btree ("score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_score_stale_at_idx" ON "upload_user_comment" USING btree ("score_stale_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_rating_upload_user_comment_id_rating_idx" ON "upload_user_comment_rating" USING btree ("upload_user_comment_id","rating");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_comment_rating_app_user_id_rating_idx" ON "upload_user_comment_rating" USING btree ("app_user_id","rating");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_rating_upload_id_rating_idx" ON "upload_user_rating" USING btree ("upload_id","rating");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_user_rating_app_user_id_rating_idx" ON "upload_user_rating" USING btree ("app_user_id","rating");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_view_app_user_id_upload_record_id_idx" ON "upload_view" USING btree ("app_user_id","upload_record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_view_created_at_idx" ON "upload_view" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_view_second_upload_record_id_second_idx" ON "upload_view_second" USING btree ("upload_record_id","second");
