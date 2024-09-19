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

	return render(c, http.StatusOK, pages.Churches(ac))
}

func (h *Handler) ChurchesAdd(c echo.Context) error {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	return render(c, http.StatusOK, pages.ChurchesAdd(ac))
}
