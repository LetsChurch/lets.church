package pages

import (
	"io"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
)

type Register struct {
	Ac     *util.AppContext
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

type RegisterUsernameInput struct {
	Value string
	Error string
}

func (r RegisterUsernameInput) Render(w io.Writer) error {
	return c.LabeledInput{
		Class: "lc-auth__input",
		Label: "Username",
		Input: c.Input{
			Type:        "text",
			Name:        "username",
			Placeholder: "Username",
			Required:    true,
			HxPost:      "/auth/check-username",
			Value:       r.Value,
		},
		Error: r.Error,
	}.Render(w)
}

func (r Register) Render(w io.Writer) error {
	return layouts.Auth{
		Ac: r.Ac,
		Body: []g.Node{
			h.Form(h.Method("POST"),
				h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(r.Ac.CsrfToken)),
				c.LabeledInput{
					Class: "lc-auth__input",
					Label: "Email",
					Input: c.Input{Type: "email", Name: "email", Placeholder: "Email", Required: true},
				},
				RegisterUsernameInput{},
				c.LabeledInput{
					Class: "lc-auth__input",
					Label: "Password",
					Input: c.Input{Type: "password", Name: "password", Placeholder: "Password", Required: true},
				},
				c.LabeledInput(c.LabeledInput{
					Class: "lc-auth__input",
					Label: "Full Name",
					Input: c.Input{Type: "text", Name: "fullname", Placeholder: "Full Name", Required: true},
				}),
				c.LabeledCheckbox(c.LabeledCheckbox{
					Label: "I agree to the <a href=\"/about/theology\" target=\"_blank\">Let's Church Statement of Theology</a>.",
					Name:  "agreeTheology",
				}),
				c.LabeledCheckbox(c.LabeledCheckbox{
					Label: "I agree to the <a href=\"/about/terms\" target=\"_blank\">Terms and Conditions</a> and <a href=\"/about/privacy\" target=\"_blank\">Privacy Policy</a>.",
					Name:  "agreeTerms",
				}),
				c.LabeledCheckbox(c.LabeledCheckbox{
					Label:   "Subscribe to the Let's Church Newsletter.",
					Name:    "newsletter",
					Checked: true,
				}),
				c.Button{
					Primary:  true,
					Class:    "lc-auth__submit-button",
					Children: []g.Node{g.Text("Register")},
				},
				h.Div(h.Class("lc-auth__bottom"),
					h.A(h.Class("lc-auth__back-link"), h.Href("/auth/login"),
						c.Icon(c.Icon{Name: "arrow-left"}),
						g.Text("Back to login"),
					),
				),
			),
		},
	}.Render(w)
}
