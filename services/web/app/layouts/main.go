package layouts

import (
	g "github.com/maragudk/gomponents"
	hx "github.com/maragudk/gomponents-htmx"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/components"
)

func Main(body ...g.Node) g.Node {
	return h.Doctype(
		h.HTML(h.Lang("en"),
			h.Head(
				h.Meta(h.Charset("utf-8")),
				h.Meta(h.Name("viewport"), h.Content("width=device-width, initial-scale=1")),
				h.TitleEl(g.Text("Let's Church")),
				h.Link(h.Rel("stylesheet"), h.Href("/assets/index.css")),
				h.Script(h.Type("module"), h.Src("/assets/index.js"), h.Defer()),
			),
			h.Body(
				h.Div(h.ID("lc-root"), hx.Boost("true"),
					components.Header(),
					g.Group(body),
					components.Footer(),
				),
			),
		))
}
