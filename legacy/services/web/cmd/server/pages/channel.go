package pages

import (
	"io"

	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
)

type Channel struct {
	Ac   *util.AppContext
	Slug string
}

func (c Channel) Render(w io.Writer) error {
	return layouts.Main{
		Ac: c.Ac,
		Body: []g.Node{
			h.Main(h.Class("lc-container"),
				g.Text("Channel: "+c.Slug),
			),
		},
	}.Render(w)
}
