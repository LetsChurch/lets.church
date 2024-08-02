package components

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

func Footer() g.Node {
	return h.Footer(h.Class("lc-container lc-footer"),
		h.Div(h.Class("newsletter"),
			h.Div(
				h.H3(g.Text("Join our newsletter")),
				h.P(g.Text("Get updates about Let's Church. No spam.")),
			),
			h.Form(
				Input(InputProps{Type: "email", Placeholder: "Enter your email", Big: true}),
				Button(ButtonProps{Type: "submit", Primary: true, Big: true, Children: []g.Node{g.Text("Subscribe")}}),
			),
		),
		h.Nav(
			h.Div(
				h.H4(g.Text("Media")),
				h.Ul(
					h.Li(h.A(h.Href("/"), g.Text("Explore"))),
					h.Li(h.A(h.Href("/channels"), g.Text("Channels"))),
				),
			),
			h.Div(
				h.H4(g.Text("Find a Church")),
				h.Ul(
					h.Li(h.A(h.Href("/churches"), g.Text("Search"))),
					h.Li(h.A(h.Href("/churches?tag=reformed"), g.Text("Reformed Churches"))),
					h.Li(h.A(h.Href("/churches?tag=family-integrated"), g.Text("Family Integrated Churches"))),
					h.Li(h.A(h.Href("/churches/add"), g.Text("Add Your Church"))),
				),
			),
			h.Div(
				h.H4(g.Text("Company")),
				h.Ul(
					h.Li(h.A(h.Href("/about"), g.Text("About"))),
					h.Li(h.A(h.Href("/about/theology"), g.Text("Theology"))),
					h.Li(h.A(h.Href("/about/dorean"), g.Text("The Dorean Principle"))),
					h.Li(h.A(h.Href("https://www.zeffy.com/en-US/donation-form/5da9e1c3-a8e2-4bb4-817a-5dbbb968ec6b"), g.Text("Donate"))),
				),
			),
			h.Div(
				h.H4(g.Text("Legal")),
				h.Ul(
					h.Li(h.A(h.Href("/about/terms"), g.Text("Terms"))),
					h.Li(h.A(h.Href("/about/privacy"), g.Text("Privacy"))),
					h.Li(h.A(h.Href("/about/dmca"), g.Text("DMCA"))),
				),
			),
		),
		h.Div(h.Class("bottom"),
			h.Div(g.Raw(`<a href="/"><img src="/assets/logo.svg"></a>`)),
			h.Div(g.Raw(`Let's Church is in the public domain and is a 501(c)(3) non-profit.&nbsp;<a href="/about">Learn more.</a>`)),
		),
	)
}
