package handler

import (
	"net/http"
	"os"

	"strings"

	"github.com/labstack/echo/v4"
	"github.com/samber/oops"
	"lets.church/internal/util"
)

type Subscriber struct {
	Email                   string   `json:"email"`
	Lists                   []string `json:"lists"`
	Name                    string   `json:"name"`
	Status                  string   `json:"status"`
	PreconfirmSubscriptions bool     `json:"preconfirm_subscriptions"`
}

func (h *Handler) PostNewsletterSubscribe(c echo.Context) error {
	eb := oops.In("PostNewsletter")
	err := h.checkCsrf(c)

	if err != nil {
		return eb.Wrap(err)
	}

	params, err := c.FormParams()

	if err != nil {
		return eb.Wrap(err)
	}

	params.Del("_crsf")

	resp, err := http.Post(
		os.Getenv("LISTMONK_INTERNAL_URL")+"/subscription/form",
		"application/x-www-form-urlencoded",
		strings.NewReader(params.Encode()),
	)

	if err != nil {
		return eb.Public("Could not subscribe to newsletter.").Wrap(err)
	}

	defer resp.Body.Close()

	h.addFlash(c, util.Flash{
		Level:   "success",
		Title:   "Subscribed",
		Message: "Check your email to confirm your subscription.",
	})

	return c.Redirect(http.StatusFound, "/")
}
