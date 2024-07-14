package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/pages"
)

func (h *Handler) Home(c echo.Context) (err error) {
	upload_records, err := h.Queries.TrendingUploads(c.Request().Context())
	if err != nil {
		return err
	}

	return Render(c, http.StatusOK, pages.Home(pages.HomeProps{
		Uploads: &upload_records,
	}))
}