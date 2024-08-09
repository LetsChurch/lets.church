package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"lets.church/web/app/pages"
)

func (h *Handler) Channels(c echo.Context) error {
	session, err := h.getSession(c)
	if err != nil {
		return err
	}

	return Render(c, http.StatusOK, pages.Channels(pages.ChannelsProps{Session: session}))
}
