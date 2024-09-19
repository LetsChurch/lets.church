package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

func ChurchesAdd(ac *util.AppContext) g.Node {
	return layouts.Main(
		ac,
		h.Main(h.Class("lc-container"),
			g.Text("Add Church"),
		),
	)
}
