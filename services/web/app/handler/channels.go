package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/pages"
)

func (h *Handler) Channels(c echo.Context) error {
	return Render(c, http.StatusOK, pages.Channels())
}
