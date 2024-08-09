package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/data"
	"lets.church/web/app/layouts"
)

type ChurchesAddProps struct {
	Session *data.GetSessionRow
}

func ChurchesAdd(props ChurchesAddProps) g.Node {
	return layouts.Main(
		layouts.MainProps{Session: props.Session},
		h.Main(h.Class("lc-container"),
			g.Text("Add Church"),
		),
	)
}
