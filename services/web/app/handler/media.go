package handler

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/data"
	"lets.church/web/app/pages"
	"lets.church/web/app/util"
)

func (h *Handler) Media(c echo.Context) (err error) {
	id := c.Param("id")

	if id == "" {
		return errors.New("missing id")
	}

	upload_record, err := h.Queries.UploadData(c.Request().Context(), data.UploadDataParams{UploadID: util.ParseUuid58(id)})
	if err != nil {
		fmt.Println("%v", err)
		return err
	}

	return Render(c, http.StatusOK, pages.Media(pages.MediaProps{
		UploadId:      id,
		UploadDataRow: &upload_record,
	}))
}
