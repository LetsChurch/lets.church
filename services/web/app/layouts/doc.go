package layouts

import (
	g "github.com/maragudk/gomponents"
	hx "github.com/maragudk/gomponents-htmx"
	h "github.com/maragudk/gomponents/html"
	c "lets.church/web/app/components"
	"lets.church/web/app/util"
)

func Doc(ac *util.AppContext, body ...g.Node) g.Node {
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
					g.Group(body),
				),
				g.Group(g.Map(ac.Flashes, func(f util.Flash) g.Node {
					return c.Notification(c.NotificationProps{Level: f.Level, Title: f.Title, Message: f.Message})
				})),
			),
		),
	)
}
