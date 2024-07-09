package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/layouts"
)

func Churches() g.Node {
	return layouts.Main(h.Main(h.Class("lc-container"), g.Text("Find a Church")))
}
