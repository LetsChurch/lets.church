-- name: TrendingUploads :many
SELECT
  upload_record.id,
  title,
  length_seconds,
  channel.name as channel_name
FROM
  upload_record
  JOIN channel ON upload_record.channel_id = channel.id
WHERE
  transcribing_finished_at IS NOT NULL
  AND transcoding_finished_at IS NOT NULL
  AND upload_record.visibility = 'PUBLIC'
  AND channel.visibility = 'PUBLIC'
ORDER BY
  score DESC;

-- name: UploadData :one
SELECT
  ur.id,
  title,
  length_seconds,
  ur.description,
  published_at,
  (SELECT COUNT(*) FROM upload_view WHERE upload_record_id = ur.id) AS total_views,
  (SELECT COUNT(*) FROM upload_user_rating WHERE rating = 'LIKE' AND upload_id = ur.id) AS total_likes,
  (SELECT COUNT(*) FROM upload_user_rating WHERE rating = 'DISLIKE' AND upload_id = ur.id) AS total_dislikes,
  uur.rating as user_rating,
  c.id as channel_id,
  c.slug as channel_slug,
  c.name as channel_name,
  c.avatar_path as channel_avatar_path,
  c.default_thumbnail_path as channel_default_thumbnail_path,
  CASE
    WHEN cs.app_user_id IS NOT NULL THEN TRUE
    ELSE FALSE
  END AS channel_user_subscribed,
  ur.default_thumbnail_path,
  ur.override_thumbnail_path,
  ur.downloads_enabled,
  ur.user_comments_enabled,
  ur.variants,
  NOT EXISTS (
    SELECT 1 
    FROM unnest(ur.variants) AS variant 
    WHERE variant NOT IN ('AUDIO', 'AUDIO_DOWNLOAD')
  ) as audio_only
FROM
  upload_record ur
LEFT JOIN channel c ON ur.channel_id = c.id
LEFT JOIN channel_subscription cs ON ur.channel_id = cs.channel_id AND cs.app_user_id = sqlc.arg(user_id)
LEFT JOIN upload_user_rating uur ON uur.upload_id = ur.id AND uur.app_user_id = sqlc.arg(user_id)
WHERE ur.id = sqlc.arg(upload_id);

-- name: GetUploadUserRating :one
SELECT rating FROM upload_user_rating WHERE upload_id = sqlc.arg(upload_id) AND app_user_id = sqlc.arg(user_id);

-- name: DeleteUploadUserRating :exec
DELETE FROM upload_user_rating WHERE upload_id = sqlc.arg(upload_id) AND app_user_id = sqlc.arg(user_id);

-- name: RecordUploadUserRating :exec
INSERT INTO upload_user_rating (upload_id, app_user_id, rating) VALUES (sqlc.arg(upload_id), sqlc.arg(user_id), sqlc.arg(rating));

-- name: GetUploadUserComments :many
SELECT
  c.id, c.created_at, c.replying_to_id, a.username, c.text, c.score
FROM upload_user_comment c
LEFT JOIN app_user a ON c.author_id = a.id
WHERE c.upload_id = sqlc.arg(upload_id)
ORDER BY c.score DESC;

-- name: RecordViewRanges :one
INSERT INTO upload_view_ranges (upload_record_id, viewer_hash, app_user_id, ranges, total_time)
VALUES (sqlc.arg(upload_record_id), sqlc.arg(viewer_hash), sqlc.narg(app_user_id), sqlc.arg(ranges), sqlc.arg(total_time))
RETURNING id;

-- name: UpdateViewRanges :exec
UPDATE upload_view_ranges SET ranges = sqlc.arg(ranges), total_time = sqlc.arg(total_time)
WHERE id = sqlc.arg(id);
