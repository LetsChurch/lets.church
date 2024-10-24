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

func (h *Handler) AboutRoutes(app *echo.Echo) {
	g := app.Group("/about")

	g.GET("", func(c echo.Context) error {
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

		c.Response().WriteHeader(http.StatusOK)
		return pages.About{Ac: ac, Html: buf.String()}.Render(c.Response())
	})

	g.GET("/:page", func(c echo.Context) error {
		eb := oops.In("Handler::AboutPage")

		ac, err := h.getAppContext(c)
		if err != nil {
			return eb.Wrap(err)
		}

		switch page := c.Param("page"); page {
		case "dmca":
			c.Response().WriteHeader(http.StatusOK)
			return eb.Wrap(pages.About{Ac: ac, Html: htmlDmca()}.Render(c.Response()))
		case "dorean":
			c.Response().WriteHeader(http.StatusOK)
			return eb.Wrap(pages.About{Ac: ac, Html: htmlDorean()}.Render(c.Response()))
		case "privacy":
			c.Response().WriteHeader(http.StatusOK)
			return eb.Wrap(pages.About{Ac: ac, Html: htmlPrivacy()}.Render(c.Response()))
		case "terms":
			c.Response().WriteHeader(http.StatusOK)
			return eb.Wrap(pages.About{Ac: ac, Html: htmlTerms()}.Render(c.Response()))
		case "theology":
			c.Response().WriteHeader(http.StatusOK)
			return eb.Wrap(pages.About{Ac: ac, Html: htmlTheology()}.Render(c.Response()))
		}

		return echo.ErrNotFound
	})
}
