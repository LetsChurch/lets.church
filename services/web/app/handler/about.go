package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/pages"
)

func (h *Handler) About(c echo.Context) (err error) {
	return Render(c, http.StatusOK, pages.About("About"))
}

func (h *Handler) AboutPage(c echo.Context) (err error) {
	switch page := c.Param("page"); page {
	case "dmca":
		return Render(c, http.StatusOK, pages.About("About DMCA"))
	case "dorean":
		return Render(c, http.StatusOK, pages.About("About Dorean"))
	case "privacy":
		return Render(c, http.StatusOK, pages.About("About Privacy"))
	case "terms":
		return Render(c, http.StatusOK, pages.About("About Terms"))
	case "theology":
		return Render(c, http.StatusOK, pages.About("About Theology"))
	}

	return echo.ErrNotFound
}
