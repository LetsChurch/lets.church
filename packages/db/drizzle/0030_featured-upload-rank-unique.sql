DO $$
DECLARE
  featured_count bigint;
  distinct_rank_count bigint;
  minimum_rank integer;
  maximum_rank integer;
BEGIN
  SELECT
    count(*),
    count(DISTINCT "rank"),
    min("rank"),
    max("rank")
  INTO
    featured_count,
    distinct_rank_count,
    minimum_rank,
    maximum_rank
  FROM "featured_upload";

  IF featured_count > 0 AND (
    distinct_rank_count <> featured_count
    OR minimum_rank <> 0
    OR maximum_rank <> featured_count - 1
  ) THEN
    RAISE EXCEPTION
      'featured_upload ranks must be unique and contiguous from 0 before migration (rows %, distinct ranks %, min %, max %)',
      featured_count,
      distinct_rank_count,
      minimum_rank,
      maximum_rank;
  END IF;
END
$$;--> statement-breakpoint
DROP INDEX "featured_upload_rank_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "featured_upload_rank_idx" ON "featured_upload" USING btree ("rank");