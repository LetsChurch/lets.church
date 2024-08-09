package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/pages"
)

func (h *Handler) Churches(c echo.Context) error {
	session, err := h.getSession(c)
	if err != nil {
		return err
	}

	return Render(c, http.StatusOK, pages.Churches(pages.ChurchesProps{Session: session}))
}

func (h *Handler) ChurchesAdd(c echo.Context) error {
	session, err := h.getSession(c)
	if err != nil {
		return err
	}

	return Render(c, http.StatusOK, pages.ChurchesAdd(pages.ChurchesAddProps{Session: session}))
}
