package handler

import (
	"github.com/labstack/echo/v4"
	g "github.com/maragudk/gomponents"
)

// This custom Render replaces Echo's echo.Context.Render() with gomponents' Render
func Render(ctx echo.Context, statusCode int, node g.Node) error {
	ctx.Response().WriteHeader(statusCode)
	return node.Render(ctx.Response().Writer)
}
