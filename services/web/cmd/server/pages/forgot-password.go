package pages

import (
	"io"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

type ForgotPassword struct {
	Ac *util.AppContext
}

func (f ForgotPassword) Render(w io.Writer) error {
	return layouts.Auth{
		Ac: f.Ac,
		Body: []g.Node{h.H1(h.Class("lc-auth__heading"), g.Text("Forgot password?")),
			h.P(h.Class("lc-auth__description"), g.Text("No worries, we'll send you reset instructions.")),
			h.Form(h.Method("POST"),
				h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(f.Ac.CsrfToken)),
				c.LabeledInput{
					Class: "lc-auth__input",
					Label: "Email",
					Input: c.Input{Type: "email", Name: "email", Placeholder: "Email", Required: true},
				},
				c.Button{
					Primary:  true,
					Class:    "lc-auth__submit-button",
					Children: []g.Node{g.Text("Reset password")},
				},
				h.Div(h.Class("lc-auth__bottom"),
					h.A(h.Class("lc-auth__back-link"), h.Href("/auth/login"),
						c.Icon{Name: "arrow-left"},
						g.Text("Back to login"),
					),
				),
			),
		},
	}.Render(w)
}
