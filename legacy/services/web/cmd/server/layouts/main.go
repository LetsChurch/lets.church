package layouts

import (
	"io"

	g "maragu.dev/gomponents"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/util"
)

type Main struct {
	Ac   *util.AppContext
	Body []g.Node
}

func (m Main) Render(w io.Writer) error {
	return Doc{
		Ac: m.Ac,
		Body: []g.Node{
			c.Header{Ac: m.Ac},
			g.Group(m.Body),
			c.Footer{Ac: m.Ac},
		},
	}.Render(w)
}
