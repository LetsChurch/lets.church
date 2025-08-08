-- name: SubscribeToChannelBySlug :exec
WITH channel AS (
  SELECT id AS channel_id 
  FROM channel c 
  WHERE c.slug = sqlc.arg(slug)
)
INSERT INTO channel_subscription (app_user_id, channel_id)
SELECT sqlc.arg(user_id), channel_id FROM channel
ON CONFLICT (app_user_id, channel_id) 
DO NOTHING;

-- name: UnsubscribeFromChannelBySlug :exec
WITH channel AS (
  SELECT id AS channel_id 
  FROM channel c
  WHERE c.slug = sqlc.arg(slug)
)
DELETE FROM channel_subscription
WHERE app_user_id = sqlc.arg(user_id) AND channel_id = (SELECT channel_id FROM channel);
