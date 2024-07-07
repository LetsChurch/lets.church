package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/pages"
)

func (h *Handler) Churches(c echo.Context) error {
	return Render(c, http.StatusOK, pages.Churches())
}

func (h *Handler) ChurchesAdd(c echo.Context) error {
	return Render(c, http.StatusOK, pages.ChurchesAdd())
}
