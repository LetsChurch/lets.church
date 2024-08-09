package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/pages"
)

func (h *Handler) About(c echo.Context) (err error) {
	return Render(c, http.StatusOK, pages.About(pages.AboutProps{Html: "About"}))
}

func (h *Handler) AboutPage(c echo.Context) (err error) {
	session, err := h.getSession(c)
	if err != nil {
		return err
	}

	switch page := c.Param("page"); page {
	case "dmca":
		return Render(c, http.StatusOK, pages.About(pages.AboutProps{Session: session, Html: "About DMCA"}))
	case "dorean":
		return Render(c, http.StatusOK, pages.About(pages.AboutProps{Session: session, Html: "About Dorean"}))
	case "privacy":
		return Render(c, http.StatusOK, pages.About(pages.AboutProps{Session: session, Html: "About Privacy"}))
	case "terms":
		return Render(c, http.StatusOK, pages.About(pages.AboutProps{Session: session, Html: "About Terms"}))
	case "theology":
		return Render(c, http.StatusOK, pages.About(pages.AboutProps{Session: session, Html: "About Theology"}))
	}

	return echo.ErrNotFound
}
