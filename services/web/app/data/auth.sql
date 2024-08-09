-- name: GetUser :one
SELECT u.*
FROM app_user u
LEFT JOIN app_user_email e ON u.id = e.app_user_id
WHERE u.username = sqlc.arg(identifier) OR e.email = sqlc.arg(identifier)
LIMIT 1;
