// Code generated by sqlc. DO NOT EDIT.
// versions:
//   sqlc v1.26.0
// source: uploads.sql

package data

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
)

const getUploadUserComments = `-- name: GetUploadUserComments :many
SELECT
  c.id, c.created_at, c.replying_to_id, a.username, c.text, c.score
FROM upload_user_comment c
LEFT JOIN app_user a ON c.author_id = a.id
WHERE c.upload_id = $1
ORDER BY c.score DESC
`

type GetUploadUserCommentsRow struct {
	ID           pgtype.UUID
	CreatedAt    pgtype.Timestamp
	ReplyingToID pgtype.UUID
	Username     pgtype.Text
	Text         string
	Score        float64
}

func (q *Queries) GetUploadUserComments(ctx context.Context, uploadID pgtype.UUID) ([]GetUploadUserCommentsRow, error) {
	rows, err := q.db.Query(ctx, getUploadUserComments, uploadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []GetUploadUserCommentsRow
	for rows.Next() {
		var i GetUploadUserCommentsRow
		if err := rows.Scan(
			&i.ID,
			&i.CreatedAt,
			&i.ReplyingToID,
			&i.Username,
			&i.Text,
			&i.Score,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const recordViewRanges = `-- name: RecordViewRanges :one
INSERT INTO upload_view_ranges (upload_record_id, viewer_hash, app_user_id, ranges, total_time)
VALUES ($1, $2, $3, $4, $5)
RETURNING id
`

type RecordViewRangesParams struct {
	UploadRecordID pgtype.UUID
	ViewerHash     int64
	AppUserID      pgtype.UUID
	Ranges         []byte
	TotalTime      float64
}

func (q *Queries) RecordViewRanges(ctx context.Context, arg RecordViewRangesParams) (pgtype.UUID, error) {
	row := q.db.QueryRow(ctx, recordViewRanges,
		arg.UploadRecordID,
		arg.ViewerHash,
		arg.AppUserID,
		arg.Ranges,
		arg.TotalTime,
	)
	var id pgtype.UUID
	err := row.Scan(&id)
	return id, err
}

const trendingUploads = `-- name: TrendingUploads :many
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
  score DESC
`

type TrendingUploadsRow struct {
	ID            pgtype.UUID
	Title         pgtype.Text
	LengthSeconds pgtype.Float8
	ChannelName   string
}

func (q *Queries) TrendingUploads(ctx context.Context) ([]TrendingUploadsRow, error) {
	rows, err := q.db.Query(ctx, trendingUploads)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []TrendingUploadsRow
	for rows.Next() {
		var i TrendingUploadsRow
		if err := rows.Scan(
			&i.ID,
			&i.Title,
			&i.LengthSeconds,
			&i.ChannelName,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const updateViewRanges = `-- name: UpdateViewRanges :exec
UPDATE upload_view_ranges SET ranges = $1, total_time = $2
WHERE id = $3
`

type UpdateViewRangesParams struct {
	Ranges    []byte
	TotalTime float64
	ID        pgtype.UUID
}

func (q *Queries) UpdateViewRanges(ctx context.Context, arg UpdateViewRangesParams) error {
	_, err := q.db.Exec(ctx, updateViewRanges, arg.Ranges, arg.TotalTime, arg.ID)
	return err
}

const uploadData = `-- name: UploadData :one
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
LEFT JOIN channel_subscription cs ON ur.channel_id = cs.channel_id AND cs.app_user_id = $1
WHERE ur.id = $2
`

type UploadDataParams struct {
	UserID   pgtype.UUID
	UploadID pgtype.UUID
}

type UploadDataRow struct {
	ID                          pgtype.UUID
	Title                       pgtype.Text
	LengthSeconds               pgtype.Float8
	Description                 pgtype.Text
	PublishedAt                 pgtype.Timestamp
	TotalViews                  int64
	ChannelID                   pgtype.UUID
	ChannelSlug                 pgtype.Text
	ChannelName                 pgtype.Text
	ChannelAvatarPath           pgtype.Text
	ChannelDefaultThumbnailPath pgtype.Text
	ChannelUserSubscribed       bool
	DefaultThumbnailPath        pgtype.Text
	OverrideThumbnailPath       pgtype.Text
	DownloadsEnabled            bool
	UserCommentsEnabled         bool
	Variants                    []UploadVariant
	AudioOnly                   bool
}

func (q *Queries) UploadData(ctx context.Context, arg UploadDataParams) (UploadDataRow, error) {
	row := q.db.QueryRow(ctx, uploadData, arg.UserID, arg.UploadID)
	var i UploadDataRow
	err := row.Scan(
		&i.ID,
		&i.Title,
		&i.LengthSeconds,
		&i.Description,
		&i.PublishedAt,
		&i.TotalViews,
		&i.ChannelID,
		&i.ChannelSlug,
		&i.ChannelName,
		&i.ChannelAvatarPath,
		&i.ChannelDefaultThumbnailPath,
		&i.ChannelUserSubscribed,
		&i.DefaultThumbnailPath,
		&i.OverrideThumbnailPath,
		&i.DownloadsEnabled,
		&i.UserCommentsEnabled,
		&i.Variants,
		&i.AudioOnly,
	)
	return i, err
}
