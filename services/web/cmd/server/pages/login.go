package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

func Login(ac *util.AppContext) g.Node {
	return layouts.Auth(
		ac,
		h.Form(h.Method("POST"),
			h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(ac.CsrfToken)),
			c.LabeledInput(c.LabeledInputProps{
				Class:      "lc-auth__input",
				Label:      "Username or Email",
				InputProps: c.InputProps{Type: "text", Name: "id", Placeholder: "Username or Email", Required: true},
			}),
			c.LabeledInput(c.LabeledInputProps{
				Class:      "lc-auth__input",
				Label:      "Password",
				InputProps: c.InputProps{Type: "password", Name: "password", Placeholder: "Password", Required: true},
			}),
			h.Div(h.Class("lc-auth__meta"),
				h.Div(c.LabeledCheckbox(c.LabeledCheckboxProps{Name: "remember", Label: "Remember for 30 days", Checked: true})),
				h.Div(h.A(h.Href("/auth/forgot-password"), g.Text("Forgot password"))),
			),
			c.Button(c.ButtonProps{
				Primary:  true,
				Class:    "lc-auth__submit-button",
				Children: []g.Node{g.Text("Login")},
			}),
			h.Div(h.Class("lc-auth__bottom"),
				h.Span(g.Text("Don't have an account?")),
				g.Raw("&nbsp;"),
				h.A(h.Href("/auth/register"), g.Text("Sign up")),
			),
		),
	)
}
