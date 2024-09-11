package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/internal/pages"
)

func (h *Handler) About(c echo.Context) (err error) {
	ac, err := h.getAppContext(c)
	return Render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: "About"}))
}

func (h *Handler) AboutPage(c echo.Context) (err error) {
	ac, err := h.getAppContext(c)
	if err != nil {
		return err
	}

	switch page := c.Param("page"); page {
	case "dmca":
		return Render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: "About DMCA"}))
	case "dorean":
		return Render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: "About Dorean"}))
	case "privacy":
		return Render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: "About Privacy"}))
	case "terms":
		return Render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: "About Terms"}))
	case "theology":
		return Render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: "About Theology"}))
	}

	return echo.ErrNotFound
}
