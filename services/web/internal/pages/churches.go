package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/internal/layouts"
	"lets.church/internal/util"
)

func Churches(ac *util.AppContext) g.Node {
	return layouts.Main(
		ac,
		h.Main(h.Class("lc-container"),
			g.Text("Find a Church"),
		),
	)
}
