package pages

import (
	"io"

	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

type ResetPassword struct {
	Ac    *util.AppContext
	Token string
}

func (rp ResetPassword) Render(w io.Writer) error {
	return layouts.Auth{
		Ac: rp.Ac,
		Body: []g.Node{
			h.Form(h.Method("POST"),
				h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(rp.Ac.CsrfToken)),
				h.Input(h.Type("hidden"), h.Name("token"), h.Value(rp.Token)),
				c.LabeledInput{
					Class: "lc-auth__input",
					Label: "New Password",
					Input: c.Input{Type: "password", Name: "password", Placeholder: "Password", Required: true},
				},
				c.Button{
					Primary:  true,
					Class:    "lc-auth__submit-button",
					Children: []g.Node{g.Text("Change password")},
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
