package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/cmd/server/pages"
)

func (h *Handler) Channels(c echo.Context) error {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	c.Response().WriteHeader(http.StatusOK)
	return pages.Channels{Ac: ac}.Render(c.Response())
}
