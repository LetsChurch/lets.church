package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	c "lets.church/web/app/components"
	"lets.church/web/app/layouts"
	"lets.church/web/app/util"
)

type RegisterProps struct {
	Values struct {
		Newsletter    *bool
		Email         string
		Username      string
		Password      string
		FullName      string
		AgreeTheology bool
		AgreeTerms    bool
	}
}

type RegisterUsernameInputProps struct {
	Value string
	Error string
}

func RegisterUsernameInput(props RegisterUsernameInputProps) g.Node {
	return c.LabeledInput(c.LabeledInputProps{
		Class: "lc-auth__input",
		Label: "Username",
		InputProps: c.InputProps{
			Type:        "text",
			Name:        "username",
			Placeholder: "Username",
			Required:    true,
			HxPost:      "/auth/check-username",
			Value:       props.Value,
		},
		Error: props.Error,
	})
}

func Register(ac *util.AppContext, props RegisterProps) g.Node {
	return layouts.Auth(
		ac,
		h.Form(h.Method("POST"),
			h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(ac.CsrfToken)),
			c.LabeledInput(c.LabeledInputProps{
				Class:      "lc-auth__input",
				Label:      "Email",
				InputProps: c.InputProps{Type: "email", Name: "email", Placeholder: "Email", Required: true},
			}),
			RegisterUsernameInput(RegisterUsernameInputProps{}),
			c.LabeledInput(c.LabeledInputProps{
				Class:      "lc-auth__input",
				Label:      "Password",
				InputProps: c.InputProps{Type: "password", Name: "password", Placeholder: "Password", Required: true},
			}),
			c.LabeledInput(c.LabeledInputProps{
				Class:      "lc-auth__input",
				Label:      "Full Name",
				InputProps: c.InputProps{Type: "text", Name: "fullname", Placeholder: "Full Name", Required: true},
			}),
			c.LabeledCheckbox(c.LabeledCheckboxProps{
				Label: "I agree to the <a href=\"/about/theology\" target=\"_blank\">Let's Church Statement of Theology</a>.",
				Name:  "agreeTheology",
			}),
			c.LabeledCheckbox(c.LabeledCheckboxProps{
				Label: "I agree to the <a href=\"/about/terms\" target=\"_blank\">Terms and Conditions</a> and <a href=\"/about/privacy\" target=\"_blank\">Privacy Policy</a>.",
				Name:  "agreeTerms",
			}),
			c.LabeledCheckbox(c.LabeledCheckboxProps{
				Label:   "Subscribe to the Let's Church Newsletter.",
				Name:    "newsletter",
				Checked: true,
			}),
			c.Button(c.ButtonProps{
				Primary:  true,
				Class:    "lc-auth__submit-button",
				Children: []g.Node{g.Text("Register")},
			}),
			h.Div(h.Class("lc-auth__bottom"),
				h.A(h.Class("lc-auth__back-link"), h.Href("/auth/login"),
					c.Icon(c.IconProps{Name: "arrow-left"}),
					g.Text("Back to login"),
				),
			),
		),
	)
}
