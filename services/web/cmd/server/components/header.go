package components

import (
	"io"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/cmd/server/util"
)

type Header struct {
	Ac *util.AppContext
}

func (self Header) Render(w io.Writer) error {
	return h.Header(h.Class("lc-container lc-header"),
		h.Nav(
			h.A(h.Href("/"), h.Class("lc-logo"), h.Img(h.Src("/assets/logoicon.svg"))),
			Input{Type: "search", Placeholder: "Search", Icon: "search", Big: true},
			h.A(h.Href("/"), h.Class("nav"), g.Text("Media")),
			h.A(h.Href("/churches"), h.Class("nav"), g.Text("Find a Church")),
			h.A(h.Href("/about"), h.Class("nav"), g.Text("About")),
		),
		h.Div(
			g.If(!self.Ac.Authenticated,
				ButtonLink{
					Button: Button{Primary: true, Big: true, Children: []g.Node{g.Text("Login")}},
					Href:   "/auth/login",
				},
			),
			g.If(self.Ac.Authenticated,
				h.Form(h.Action("/auth/logout"), h.Method("POST"),
					h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(self.Ac.CsrfToken)),
					Button{Primary: true, Type: "submit", Big: true, Children: []g.Node{g.Text("Logout")}},
				),
			),
		),
	).Render(w)
}
