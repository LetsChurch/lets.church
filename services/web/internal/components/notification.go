package components

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type NotificationProps struct {
	Level   string
	Title   string
	Message string
}

func Notification(props NotificationProps) g.Node {
	return g.El("lc-notification",
		h.Dialog(g.Attr("open"),
			Icon(IconProps{Name: "notification-" + props.Level, Full: true, Class: "lc-notification__icon"}),
			h.P(h.Class("lc-notification__title"), g.Text(props.Title)),
			h.Button(h.Class("lc-notification__close"), Icon(IconProps{Name: "x", Width: 20, Height: 20}), g.Attr("data-close")),
			h.P(h.Class("lc-notification__message"), g.Text(props.Message)),
		),
	)
}
