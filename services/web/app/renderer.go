package app

import (
	"github.com/labstack/echo/v4"
	g "github.com/maragudk/gomponents"
	"lets.church/web/app/data"
)

type Renderer struct {
	Session *data.GetSessionRow
	csrf    string
}

func (r *Renderer) Render(ctx echo.Context, statusCode int, node g.Node) error {
	ctx.Response().WriteHeader(statusCode)
	return node.Render(ctx.Response())
}
