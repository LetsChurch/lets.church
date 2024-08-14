package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/layouts"
	"lets.church/web/app/util"
)

func ChurchesAdd(ac *util.AppContext) g.Node {
	return layouts.Main(
		ac,
		h.Main(h.Class("lc-container"),
			g.Text("Add Church"),
		),
	)
}
