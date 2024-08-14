package layouts

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/util"
)

func Auth(ac *util.AppContext, body ...g.Node) g.Node {
	return Doc(
		ac,
		h.Div(h.Class("lc-auth"),
			h.Header(h.Class("lc-auth__header"), h.A(h.Href("/"), h.Img(h.Src("/assets/logo.svg")))),
			g.Group(body),
		),
	)
}
