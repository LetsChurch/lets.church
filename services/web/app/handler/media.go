package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/data"
	"lets.church/web/app/pages"
)

func (h *Handler) Media(c echo.Context) (err error) {
	// TODO: should this be inlined? Or should this write into a reference? Or leave it as is?
	upload_records, err := data.TrendingUploads(h.Db)
	if err != nil {
		return err
	}

	return Render(c, http.StatusOK, pages.Media(pages.MediaProps{
		Uploads: &upload_records,
	}))
}
