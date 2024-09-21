-- name: GetTrackingSalt :one
SELECT salt FROM tracking_salt ORDER BY id DESC LIMIT 1;
