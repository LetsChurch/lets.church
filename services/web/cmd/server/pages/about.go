package pages

import (
	"io"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

type About struct {
	Ac   *util.AppContext
	Html string
}

func (a About) Render(w io.Writer) error {
	return layouts.Main{
		Ac: a.Ac,
		Body: []g.Node{
			h.Main(h.Class("lc-container epistole"),
				g.Raw(a.Html),
			),
		},
	}.Render(w)
}
