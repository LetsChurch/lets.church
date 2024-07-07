package data

import "github.com/jmoiron/sqlx"

type UploadGridRecord struct {
	Id            string
	Title         string
	ChannelName   string  `db:"channel_name"`
	LengthSeconds float32 `db:"length_seconds"`
}

func TrendingUploads(db *sqlx.DB) ([]UploadGridRecord, error) {
	upload_records := []UploadGridRecord{}
	err := db.Select(&upload_records, `
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
    ORDER BY
      score DESC
  `)
	if err != nil {
		return nil, err
	}

	return upload_records, nil
}
