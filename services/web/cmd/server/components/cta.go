package components

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/cmd/server/util"
)

type CtaProps struct {
	PrimaryText   string
	PrimaryHref   string
	SecondaryText string
	SecondaryHref string
}

func Cta(ac *util.AppContext, props CtaProps) g.Node {
	return g.If(!ac.Authenticated, h.Aside(h.Class("lc-container lc-cta"),
		h.Div(
			h.H2(g.Text("Join Let's Church")),
			h.P(g.Text("Get sermon hosting and other resources 100% free of charge.")),
		),
		h.Div(
			ButtonLink(ButtonLinkProps{
				ButtonProps: ButtonProps{Primary: true, Children: []g.Node{g.Text(props.SecondaryText)}},
				Href:        props.SecondaryHref,
			}),
			ButtonLink(ButtonLinkProps{
				ButtonProps: ButtonProps{Children: []g.Node{g.Text(props.PrimaryText)}},
				Href:        props.PrimaryHref,
			}),
		),
	))
}
