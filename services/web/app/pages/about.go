package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/data"
	"lets.church/web/app/layouts"
)

type AboutProps struct {
	Session *data.GetSessionRow
	Html    string
}

func About(props AboutProps) g.Node {
	return layouts.Main(
		layouts.MainProps{Session: props.Session},
		h.Main(h.Class("lc-container"),
			g.Raw(props.Html),
		),
	)
}
