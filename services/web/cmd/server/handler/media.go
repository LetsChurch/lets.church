package handler

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
	"github.com/samber/oops"
	"lets.church/cmd/server/pages"
	"lets.church/internal/data"
	"lets.church/internal/util"

	"github.com/asticode/go-astisub"
)

func (h *Handler) Media(c echo.Context) (err error) {
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

	uploadRecord, err := h.Queries.UploadData(c.Request().Context(), data.UploadDataParams{UploadID: pgUuid})
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

	return render(c, http.StatusOK, pages.Media(ac, pages.MediaProps{
		UploadId:      id,
		UploadDataRow: &uploadRecord,
		Comments:      groupedComments,
		Transcript:    transcript,
	}))
}
