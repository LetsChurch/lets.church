package handler

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	"lets.church/cmd/server/pages"
	"lets.church/internal/data"

	"github.com/samber/oops"
)

func (h *Handler) ChannelRoutes(app *echo.Echo) {
	g := app.Group("/channel")

	g.GET("s", func(c echo.Context) error {
		ac, err := h.getAppContext(c)
		if err != nil {
			return err
		}

		c.Response().WriteHeader(http.StatusOK)
		return pages.Channels{Ac: ac}.Render(c.Response())
	})

	g.GET("/:slug", func(c echo.Context) error {
		ac, err := h.getAppContext(c)
		if err != nil {
			return err
		}
		slug := c.Param("slug")
		c.Response().WriteHeader(http.StatusOK)
		return pages.Channel{Ac: ac, Slug: slug}.Render(c.Response())
	})

	g.POST("/:slug/subscribe", func(c echo.Context) error {
		eb := oops.In("ChannelSubscribe")
		ac, err := h.getAppContext(c)
		if err != nil {
			return err
		}
		slug := c.Param("slug")

		if ac.User == nil {
			return eb.Public("You must be logged in to subscribe to a channel.").Wrap(&echo.HTTPError{Code: http.StatusUnauthorized})
		}

		h.Queries.SubscribeToChannelBySlug(c.Request().Context(), data.SubscribeToChannelBySlugParams{
			UserID: ac.User.ID,
			Slug:   pgtype.Text{String: slug, Valid: true},
		})

		return c.Redirect(http.StatusFound, c.Request().Referer())
	})

	g.POST("/:slug/unsubscribe", func(c echo.Context) error {
		eb := oops.In("ChannelUnsubscribe")
		ac, err := h.getAppContext(c)
		if err != nil {
			return err
		}
		slug := c.Param("slug")

		if ac.User == nil {
			return eb.Public("You must be logged in to unsubscribe from a channel.").Wrap(&echo.HTTPError{Code: http.StatusUnauthorized})
		}

		h.Queries.UnsubscribeFromChannelBySlug(c.Request().Context(), data.UnsubscribeFromChannelBySlugParams{
			UserID: ac.User.ID,
			Slug:   pgtype.Text{String: slug, Valid: true},
		})

		return c.Redirect(http.StatusFound, c.Request().Referer())
	})
}
