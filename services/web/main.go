package main

import (
	"fmt"
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

	fmt.Println("hello, world")

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
