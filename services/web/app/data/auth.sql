-- name: CreateUser :one
INSERT INTO app_user (username, password, full_name, updated_at)
VALUES (sqlc.arg(username), sqlc.arg(password), sqlc.narg(full_name), NOW())
RETURNING id;

-- name: UserExists :one
SELECT EXISTS (SELECT 1 FROM app_user WHERE username = sqlc.arg(username));

-- name: CreateUserEmail :one
INSERT INTO app_user_email (app_user_id, email)
VALUES (sqlc.arg(app_user_id), sqlc.arg(email))
RETURNING id, key;

-- name: VerifyEmail :one
WITH updated_rows AS (
    UPDATE app_user_email SET "verifiedAt"=NOW()
    WHERE id=sqlc.arg(email_id)
    AND app_user_id = sqlc.arg(app_user_id)
    AND key=sqlc.arg(key)
    AND "verifiedAt" IS NULL
    RETURNING *
)
SELECT COUNT(*) FROM updated_rows;

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

-- name: SubscribeToNewsletter :exec
INSERT INTO newsletter_subscription (email) VALUES (sqlc.arg(email));
