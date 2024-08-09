package handler

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/data"
	"lets.church/web/app/pages"
	"lets.church/web/app/util"

	"github.com/asticode/go-astisub"
)

func (h *Handler) Media(c echo.Context) (err error) {
	session, err := h.getSession(c)
	if err != nil {
		return err
	}

	id := c.Param("id")

	if id == "" {
		return errors.New("missing id")
	}

	uploadUuid, err := util.Parse(id)
	if err != nil {
		fmt.Println(err)
		return err
	}

	uploadRecord, err := h.Queries.UploadData(c.Request().Context(), data.UploadDataParams{UploadID: uploadUuid.Pg()})
	if err != nil {
		fmt.Println(err)
		return err
	}

	transcriptUrl := util.GetPublicMediaUrl(uploadUuid.Canonical() + "/transcript.vtt")
	transcriptBytes, err := util.DownloadFileToReader(transcriptUrl)
	if err != nil {
		fmt.Println(err)
		return err
	}

	transcript, err := astisub.ReadFromWebVTT(transcriptBytes)
	if err != nil {
		fmt.Println(err)
		return err
	}

	return Render(c, http.StatusOK, pages.Media(pages.MediaProps{
		Session:       session,
		UploadId:      id,
		UploadDataRow: &uploadRecord,
		Transcript:    transcript,
	}))
}
