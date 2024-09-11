-- name: GetSession :one
SELECT s.*, u.id as user_id, u.username as username
FROM app_session s, app_user u
WHERE s.id = sqlc.arg(id)
AND s.app_user_id = u.id
AND expires_at > CURRENT_TIMESTAMP
AND u.deleted_at IS NULL
AND s.deleted_at IS NULL
LIMIT 1;

-- name: CreateSession :one
INSERT INTO app_session (
    app_user_id, updated_at
) VALUES (
    sqlc.arg(user_id), CURRENT_TIMESTAMP
) RETURNING id;

-- name: DeleteSession :exec
UPDATE app_session SET deleted_at = CURRENT_TIMESTAMP WHERE id = sqlc.arg(id);
