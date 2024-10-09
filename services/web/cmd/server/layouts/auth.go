package layouts

import (
	"io"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/cmd/server/util"
)

type Auth struct {
	Ac   *util.AppContext
	Body []g.Node
}

func (a Auth) Render(w io.Writer) error {
	return Doc{
		Ac: a.Ac,
		Body: []g.Node{
			h.Div(h.Class("lc-auth"),
				h.Header(h.Class("lc-auth__header"), h.A(h.Href("/"), h.Img(h.Src("/assets/logo.svg")))),
				g.Group(a.Body),
			),
		},
	}.Render(w)
}
