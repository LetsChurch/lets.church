package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/internal/layouts"
	"lets.church/internal/util"
)

type AboutProps struct {
	Html string
}

func About(ac *util.AppContext, props AboutProps) g.Node {
	return layouts.Main(
		ac,
		h.Main(h.Class("lc-container"),
			g.Raw(props.Html),
		),
	)
}
