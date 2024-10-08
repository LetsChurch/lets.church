package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

type ResetPasswordProps struct {
	Token string
}

func ResetPassword(ac *util.AppContext, props ResetPasswordProps) g.Node {
	return layouts.Auth(
		ac,
		h.Form(h.Method("POST"),
			h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(ac.CsrfToken)),
			h.Input(h.Type("hidden"), h.Name("token"), h.Value(props.Token)),
			c.LabeledInput(c.LabeledInputProps{
				Class:      "lc-auth__input",
				Label:      "New Password",
				InputProps: c.InputProps{Type: "password", Name: "password", Placeholder: "Password", Required: true},
			}),
			c.Button{
				Primary:  true,
				Class:    "lc-auth__submit-button",
				Children: []g.Node{g.Text("Change password")},
			},
			h.Div(h.Class("lc-auth__bottom"),
				h.A(h.Class("lc-auth__back-link"), h.Href("/auth/login"),
					c.Icon(c.IconProps{Name: "arrow-left"}),
					g.Text("Back to login"),
				),
			),
		),
	)
}
