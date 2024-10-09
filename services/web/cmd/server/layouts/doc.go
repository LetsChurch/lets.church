package layouts

import (
	"io"

	g "github.com/maragudk/gomponents"
	hx "github.com/maragudk/gomponents-htmx"
	h "github.com/maragudk/gomponents/html"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/util"
)

type Doc struct {
	Ac   *util.AppContext
	Body []g.Node
}

func (d Doc) Render(w io.Writer) error {
	return h.Doctype(
		h.HTML(h.Lang("en"),
			h.Head(
				h.Meta(h.Charset("utf-8")),
				h.Meta(h.Name("viewport"), h.Content("width=device-width, initial-scale=1")),
				h.TitleEl(g.Text("Let's Church")),
				h.Link(h.Rel("stylesheet"), h.Href("/assets/index.css")),
				h.Script(h.Type("module"), h.Src("/assets/index.js"), h.Defer()),
				h.Link(h.Rel("shortcut icon"), h.Href("/assets/favicon.svg")),
			),
			h.Body(
				h.Div(h.ID("lc-root"), hx.Boost("true"),
					g.Group(d.Body),
				),
				g.Group(g.Map(d.Ac.Flashes, func(f util.Flash) g.Node {
					return c.Notification{Level: f.Level, Title: f.Title, Message: f.Message}
				})),
			),
		),
	).Render(w)
}
