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
WHERE ur.id = sqlc.arg(upload_id);

-- name: GetUploadUserComments :many
SELECT
  c.id, c.created_at, c.replying_to_id, a.username, c.text, c.score
FROM upload_user_comment c
LEFT JOIN app_user a ON c.author_id = a.id
WHERE c.upload_id = sqlc.arg(upload_id)
ORDER BY c.score DESC;
