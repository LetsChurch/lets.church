package handler

import (
	"net/http"
	"net/mail"

	"github.com/labstack/echo/v4"
	"github.com/samber/oops"
	"lets.church/internal/util"
)

func (h *Handler) PostNewsletterSubscribe(c echo.Context) error {
	eb := oops.In("PostNewsletter")
	err := h.checkCsrf(c)

	if err != nil {
		return eb.Wrap(err)
	}

	email := c.FormValue("email")

	_, err = mail.ParseAddress(email)

	if err != nil {
		return eb.Public("Invalid email address.").Wrap(err)
	}

	err = util.SubscribeToDefaultNewsletters(email)

	if err != nil {
		return eb.Wrap(err)
	}

	h.addFlash(c, util.Flash{
		Level:   "success",
		Title:   "Subscribed",
		Message: "Check your email to confirm your subscription.",
	})

	return c.Redirect(http.StatusFound, "/")
}
