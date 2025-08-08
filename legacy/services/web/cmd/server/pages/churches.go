package pages

import (
	"io"

	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

type Churches struct {
	Ac *util.AppContext
}

func (c Churches) Render(w io.Writer) error {
	return layouts.Main{
		Ac: c.Ac,
		Body: []g.Node{
			h.Main(h.Class("lc-container"),
				g.Text("Find a Church"),
			),
		},
	}.Render(w)
}
