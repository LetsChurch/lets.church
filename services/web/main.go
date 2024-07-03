package main

import (
	"net/http"

	"lets.church/web/app/pages"

	"github.com/a-h/templ"
	"github.com/labstack/echo/v4"
)

func main() {
	app := echo.New()
	app.File("/favicon.ico", "assets/favicon.ico")
	app.Static("/assets", "assets")
	app.GET("/", MediaHandler)
	app.GET("/about", AboutHandler)
	app.GET("/about/:page", AboutPageHandler)
	app.GET("/channels", ChannelsHandler)
	app.GET("/churches", ChurchesHandler)
	app.GET("/churches/add", ChurchesAddHandler)

	app.Logger.Fatal(app.Start("0.0.0.0:3000"))
}

// This custom Render replaces Echo's echo.Context.Render() with templ's templ.Component.Render().
func Render(ctx echo.Context, statusCode int, t templ.Component) error {
	buf := templ.GetBuffer()
	defer templ.ReleaseBuffer(buf)

	if err := t.Render(ctx.Request().Context(), buf); err != nil {
		return err
	}

	return ctx.HTML(statusCode, buf.String())
}

func MediaHandler(c echo.Context) error {
	return Render(c, http.StatusOK, pages.Media())
}

func AboutHandler(c echo.Context) error {
	return Render(c, http.StatusOK, pages.About("About"))
}

func AboutPageHandler(c echo.Context) error {
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

func ChannelsHandler(c echo.Context) error {
	return Render(c, http.StatusOK, pages.Channels())
}

func ChurchesHandler(c echo.Context) error {
	return Render(c, http.StatusOK, pages.Churches())
}

func ChurchesAddHandler(c echo.Context) error {
	return Render(c, http.StatusOK, pages.ChurchesAdd())
}
