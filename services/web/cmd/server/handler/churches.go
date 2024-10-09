package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/cmd/server/pages"
)

func (h *Handler) Churches(c echo.Context) error {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	c.Response().WriteHeader(http.StatusOK)
	return pages.Churches{Ac: ac}.Render(c.Response())
}

func (h *Handler) ChurchesAdd(c echo.Context) error {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	c.Response().WriteHeader(http.StatusOK)
	return pages.ChurchesAdd{Ac: ac}.Render(c.Response())
}
