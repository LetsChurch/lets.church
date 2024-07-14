// Code generated by sqlc. DO NOT EDIT.
// versions:
//   sqlc v1.26.0
// source: uploads.sql

package data

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
)

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
  ur.user_comments_enabled
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
	PublishedAt                 interface{}
	TotalViews                  pgtype.Int8
	ChannelID                   pgtype.UUID
	ChannelSlug                 string
	ChannelName                 string
	ChannelAvatarPath           pgtype.Text
	ChannelDefaultThumbnailPath pgtype.Text
	ChannelUserSubscribed       pgtype.Bool
	DefaultThumbnailPath        pgtype.Text
	OverrideThumbnailPath       pgtype.Text
	DownloadsEnabled            bool
	UserCommentsEnabled         bool
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
	)
	return i, err
}
