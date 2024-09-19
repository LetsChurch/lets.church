package handler

import (
	_ "embed"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/samber/oops"
	"lets.church/cmd/server/pages"
	"lets.church/cmd/server/util"
)

//go:embed "about.md"
var mdAbout []byte
var htmlAbout = util.OnceUnsafeMdTmpl("about", mdAbout)

func (h *Handler) About(c echo.Context) (err error) {
	eb := oops.In("Handler::About")
	ac, err := h.getAppContext(c)

	if err != nil {
		return eb.Wrap(err)
	}

	var buf strings.Builder
	err = htmlAbout().Execute(&buf, map[string]string{"Hello": "World"})

	if err != nil {
		return eb.Wrap(err)
	}

	return eb.Wrap(render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: buf.String()})))
}

//go:embed "dmca.md"
var mdDmca []byte
var htmlDmca = util.OnceUnsafeMd(mdDmca)

//go:embed "dorean.md"
var mdDorean []byte
var htmlDorean = util.OnceUnsafeMd(mdDorean)

//go:embed "privacy.md"
var mdPrivacy []byte
var htmlPrivacy = util.OnceUnsafeMd(mdPrivacy)

//go:embed "terms.md"
var mdTerms []byte
var htmlTerms = util.OnceUnsafeMd(mdTerms)

//go:embed "theology.md"
var mdTheology []byte
var htmlTheology = util.OnceUnsafeMd(mdTheology)

func (h *Handler) AboutPage(c echo.Context) (err error) {
	eb := oops.In("Handler::AboutPage")

	ac, err := h.getAppContext(c)
	if err != nil {
		return eb.Wrap(err)
	}

	switch page := c.Param("page"); page {
	case "dmca":
		return eb.Wrap(render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: htmlDmca()})))
	case "dorean":
		return eb.Wrap(render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: htmlDorean()})))
	case "privacy":
		return eb.Wrap(render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: htmlPrivacy()})))
	case "terms":
		return eb.Wrap(render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: htmlTerms()})))
	case "theology":
		return eb.Wrap(render(c, http.StatusOK, pages.About(ac, pages.AboutProps{Html: htmlTheology()})))
	}

	return echo.ErrNotFound
}
