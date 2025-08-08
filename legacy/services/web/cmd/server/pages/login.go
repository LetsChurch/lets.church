package pages

import (
	"io"

	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

type Login struct {
	Ac *util.AppContext
}

func (l Login) Render(w io.Writer) error {
	return layouts.Auth{
		Ac: l.Ac,
		Body: []g.Node{
			h.Form(h.Method("POST"),
				h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(l.Ac.CsrfToken)),
				c.LabeledInput{
					Class: "lc-auth__input",
					Label: "Username or Email",
					Input: c.Input{Type: "text", Name: "id", Placeholder: "Username or Email", Required: true},
				},
				c.LabeledInput{
					Class: "lc-auth__input",
					Label: "Password",
					Input: c.Input{Type: "password", Name: "password", Placeholder: "Password", Required: true},
				},
				h.Div(h.Class("lc-auth__meta"),
					h.Div(c.LabeledCheckbox{Name: "remember", Label: "Remember for 30 days", Checked: true}),
					h.Div(h.A(h.Href("/auth/forgot-password"), g.Text("Forgot password"))),
				),
				c.Button{
					Primary:  true,
					Class:    "lc-auth__submit-button",
					Children: []g.Node{g.Text("Login")},
				},
				h.Div(h.Class("lc-auth__bottom"),
					h.Span(g.Text("Don't have an account?")),
					g.Raw("&nbsp;"),
					h.A(h.Href("/auth/register"), g.Text("Sign up")),
				),
			),
		},
	}.Render(w)
}
