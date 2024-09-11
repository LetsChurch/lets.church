package handler

import (
	"strconv"

	"github.com/labstack/echo/v4"
	g "github.com/maragudk/gomponents"
	"github.com/samber/oops"
)

// This custom Render replaces Echo's echo.Context.Render() with gomponents' Render
func Render(ctx echo.Context, statusCode int, node g.Node) error {
	ctx.Response().WriteHeader(statusCode)
	return oops.Hint("Error rendering node, status code " + strconv.Itoa(statusCode)).Wrap(node.Render(ctx.Response().Writer))
}
