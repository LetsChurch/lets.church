package components

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/data"
)

type HeaderProps struct {
	Session *data.GetSessionRow
}

func Header(props HeaderProps) g.Node {
	return h.Header(h.Class("lc-container lc-header"),
		h.Nav(
			h.A(h.Href("/"), h.Class("lc-logo"), h.Img(h.Src("/assets/logoicon.svg"))),
			Input(InputProps{Type: "search", Placeholder: "Search", Icon: "search", Big: true}),
			h.A(h.Href("/"), h.Class("nav"), g.Text("Media")),
			h.A(h.Href("/churches"), h.Class("nav"), g.Text("Find a Church")),
			h.A(h.Href("/about"), h.Class("nav"), g.Text("About")),
		),
		h.Div(
			g.If(props.Session == nil,
				ButtonLink(ButtonLinkProps{
					ButtonProps: ButtonProps{Primary: true, Big: true, Children: []g.Node{g.Text("Login")}},
					Href:        "/auth/login",
				}),
			),
			g.If(props.Session != nil,
				h.Form(h.Action("/auth/logout"), h.Method("POST"),
					Button(ButtonProps{Primary: true, Type: "submit", Big: true, Children: []g.Node{g.Text("Logout")}}),
				),
			),
		),
	)
}
