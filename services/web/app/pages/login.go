package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	c "lets.church/web/app/components"
	"lets.church/web/app/layouts"
)

type LoginProps struct {
	Csrf string
}

func Login(props LoginProps) g.Node {
	return layouts.Doc(
		h.Div(h.Class("lc-login"),
			h.Header(h.Class("lc-login__header"), h.A(h.Href("/"), h.Img(h.Src("/assets/logo.svg")))),
			h.Form(h.Method("POST"),
				h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(props.Csrf)),
				c.LabeledInput(c.LabeledInputProps{
					Class:      "lc-login__input",
					Label:      "Username or Email",
					InputProps: c.InputProps{Type: "text", Name: "id", Placeholder: "Username or Email"},
				}),
				c.LabeledInput(c.LabeledInputProps{
					Class:      "lc-login__input",
					Label:      "Password",
					InputProps: c.InputProps{Type: "password", Name: "password", Placeholder: "Password"},
				}),
				h.Div(h.Class("lc-login__meta"),
					h.Div(c.LabeledCheckbox(c.LabeledCheckboxProps{Name: "remember", Label: "Remember for 30 days", Checked: true})),
					h.Div(h.A(h.Href("/auth/forgot-password"), g.Text("Forgot password"))),
				),
				c.Button(c.ButtonProps{
					Primary:  true,
					Class:    "lc_login__login-button",
					Children: []g.Node{g.Text("Login")},
				}),
				h.Div(h.Class("lc-login__signup"),
					h.Span(g.Text("Don't have an account?")),
					g.Raw("&nbsp;"),
					h.A(h.Href("/auth/register"), g.Text("Sign up")),
				),
			),
		),
	)
}
