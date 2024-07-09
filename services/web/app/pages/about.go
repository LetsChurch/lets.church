package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/layouts"
)

func About(html string) g.Node {
	return layouts.Main(h.Main(h.Class("lc-container"),
		g.Raw(html),
	))
}
