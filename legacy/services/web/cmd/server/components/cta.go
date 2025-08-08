package components

import (
	"io"

	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
	"lets.church/cmd/server/util"
)

type Cta struct {
	Ac            *util.AppContext
	PrimaryText   string
	PrimaryHref   string
	SecondaryText string
	SecondaryHref string
}

func (c Cta) Render(w io.Writer) error {
	if c.Ac.Authenticated {
		return nil
	}

	return h.Aside(h.Class("lc-container lc-cta"),
		h.Div(
			h.H2(g.Text("Join Let's Church")),
			h.P(g.Text("Get sermon hosting and other resources 100% free of charge.")),
		),
		h.Div(
			ButtonLink{
				Button: Button{Primary: true, Children: []g.Node{g.Text(c.SecondaryText)}},
				Href:   c.SecondaryHref,
			},
			ButtonLink{
				Button: Button{Children: []g.Node{g.Text(c.PrimaryText)}},
				Href:   c.PrimaryHref,
			},
		),
	).Render(w)
}
