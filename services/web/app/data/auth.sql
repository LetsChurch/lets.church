-- name: GetUser :one
SELECT u.*
FROM app_user u
LEFT JOIN app_user_email e ON e.app_user_id = u.id
WHERE u.username = sqlc.arg(identifier) OR e.email = sqlc.arg(identifier)
LIMIT 1;

-- name: GetUserByEmail :one
SELECT u.*
FROM app_user u
LEFT JOIN app_user_email e ON e.app_user_id = u.id
WHERE e.email = sqlc.arg(identifier)
LIMIT 1;

-- name: ChangePassword :exec
UPDATE app_user SET password=sqlc.arg(password) WHERE id=sqlc.arg(id);
