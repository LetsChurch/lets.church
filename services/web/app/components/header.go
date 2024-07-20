package components

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

func Header() g.Node {
	return h.Header(h.Class("lc-container lc-header"),
		h.Nav(h.Class("left"),
			h.A(h.Href("/"), h.Class("lc-logo"), h.Img(h.Src("/assets/logoicon.svg"))),
			Input(InputProps{Type: "search", Placeholder: "Search", Icon: "search", Big: true}),
			h.A(h.Href("/"), h.Class("nav"), g.Text("Media")),
			h.A(h.Href("/churches"), h.Class("nav"), g.Text("Find a Church")),
			h.A(h.Href("/about"), h.Class("nav"), g.Text("About")),
		),
		h.Div(h.Class("right"),
			ButtonLink(ButtonLinkProps{
				ButtonProps: ButtonProps{Primary: true, Big: true, Children: []g.Node{g.Text("Login")}},
				Href:        "/auth/login",
			}),
		),
	)
}
