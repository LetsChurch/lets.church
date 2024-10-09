package components

import (
	"io"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type Notification struct {
	Level   string
	Title   string
	Message string
}

func (n Notification) Render(w io.Writer) error {
	return g.El("lc-notification",
		h.Dialog(g.Attr("open"),
			Icon{Name: "notification-" + n.Level, Full: true, Class: "lc-notification__icon"},
			h.P(h.Class("lc-notification__title"), g.Text(n.Title)),
			h.Button(h.Class("lc-notification__close"), Icon{Name: "x", Width: 20, Height: 20}, g.Attr("data-close")),
			h.P(h.Class("lc-notification__message"), g.Text(n.Message)),
		),
	).Render(w)
}
