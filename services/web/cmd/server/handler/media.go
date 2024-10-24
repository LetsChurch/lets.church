package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"github.com/samber/oops"
	"lets.church/cmd/server/pages"
	"lets.church/internal/data"
	"lets.church/internal/util"

	"github.com/asticode/go-astisub"
	"github.com/cespare/xxhash/v2"
)

type Range struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

type MediaRecordRequest struct {
	ViewId string  `json:"viewId"`
	Ranges []Range `json:"ranges"`
}

type MediaRecordResponse struct {
	ViewId string `json:"viewId"`
}

func (h *Handler) MediaRoutes(app *echo.Echo) {
	g := app.Group("/media")

	g.GET("/:id", func(c echo.Context) (err error) {
		eb := oops.In("handler::Media")
		ac, err := h.getAppContext(c)
		if err != nil {
			return eb.Hint("Could not get app context").Wrap(err)
		}

		id := c.Param("id")

		if id == "" {
			return eb.Errorf("missing id")
		}

		uploadUuid, err := util.ParseUuid(id)
		if err != nil {
			return eb.Hint("Invalid upload ID").Public("Invalid ID").Wrap(err)
		}

		pgUuid := uploadUuid.Pg()
		userId := pgtype.UUID{}

		if ac.Authenticated {
			userId = ac.User.ID
		}

		uploadRecord, err := h.Queries.UploadData(c.Request().Context(), data.UploadDataParams{UploadID: pgUuid, UserID: userId})
		if err != nil {
			return eb.Hint("Could not fetch upload data").Wrap(err)
		}

		transcriptUrl := util.GetPublicMediaUrl(uploadUuid.Canonical() + "/transcript.vtt")
		transcriptBytes, err := util.DownloadFileToReader(transcriptUrl)
		if err != nil {
			return eb.Hint("Could not fetch transcript").Wrap(err)
		}

		transcript, err := astisub.ReadFromWebVTT(transcriptBytes)
		if err != nil {
			return eb.Hint("Could not parse transcript").Wrap(err)
		}

		comments, err := h.Queries.GetUploadUserComments(c.Request().Context(), pgUuid)
		if err != nil {
			return eb.Hint("Could not fetch comments").Wrap(err)
		}

		groupedComments := lo.GroupBy(comments, func(comment data.GetUploadUserCommentsRow) string {
			if comment.ReplyingToID.Valid {
				return util.Uuid(comment.ReplyingToID.Bytes).Base58()
			}

			return ""
		})

		_ = groupedComments
		fmt.Printf("%#v\n", len(groupedComments))

		c.Response().WriteHeader(http.StatusOK)

		return pages.Media{
			Ac:            ac,
			UploadId:      id,
			UploadDataRow: &uploadRecord,
			Comments:      groupedComments,
			Transcript:    transcript,
		}.Render(c.Response())
	})

	g.POST("/:id/record", func(c echo.Context) (err error) {
		eb := oops.In("handler::Media")

		ac, err := h.getAppContext(c)

		if err != nil {
			return eb.Hint("Could not get app context").Wrap(err)
		}

		id := c.Param("id")

		if id == "" {
			return eb.Errorf("missing id")
		}

		var req MediaRecordRequest
		if err := c.Bind(&req); err != nil {
			return eb.Hint("Could not parse json body").Wrap(err)
		}

		salt, err := h.Queries.GetTrackingSalt(c.Request().Context())
		if err != nil {
			return eb.Hint("Could not fetch tracking salt").Wrap(err)
		}

		hasher := xxhash.NewWithSeed(uint64(salt))
		hasher.Write([]byte("foo"))
		viewerHash := hasher.Sum64()

		// Serialize ranges as []byte
		jsonRanges, err := json.Marshal(req.Ranges)

		totalTime := lo.Reduce(req.Ranges, func(acc float64, r Range, _ int) float64 {
			return acc + (r.End - r.Start)
		}, 0)

		if req.ViewId == "" {
			uploadId, err := util.ParseUuid(id)
			if err != nil {
				return eb.Hint("Invalid upload ID").Wrap(err)
			}

			opts := data.RecordViewRangesParams{
				UploadRecordID: uploadId.Pg(),
				ViewerHash:     int64(viewerHash),
				Ranges:         jsonRanges,
				TotalTime:      totalTime,
			}

			if ac.Authenticated {
				opts.AppUserID = ac.User.ID
			}

			viewId, err := h.Queries.RecordViewRanges(c.Request().Context(), opts)
			if err != nil {
				return eb.Hint("Could not record view ranges").Wrap(err)
			}

			res := MediaRecordResponse{ViewId: util.Uuid(viewId.Bytes).Canonical()}
			c.JSON(http.StatusOK, res)
		} else {
			viewId, err := util.ParseUuid(req.ViewId)
			if err != nil {
				return eb.Hint("Invalid view ID").Wrap(err)
			}

			// Refreshing can cause duplicate views, but as long as viewing time is not overridden then that's okay
			// TODO: this comment was in the old code but I don't know why I was okay with this...
			err = h.Queries.UpdateViewRanges(c.Request().Context(), data.UpdateViewRangesParams{
				ID:        viewId.Pg(),
				Ranges:    jsonRanges,
				TotalTime: totalTime,
			})

			if err != nil {
				return eb.Hint("Could not update view ranges").Wrap(err)
			}

			res := MediaRecordResponse{ViewId: viewId.Canonical()}
			c.JSON(http.StatusOK, res)
		}

		return nil
	})
}
