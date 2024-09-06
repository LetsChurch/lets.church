package components

import (
	"encoding/json"
	"io"
	"net/http"
	"os"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"github.com/samber/lo"
	"github.com/samber/oops"
	"lets.church/web/app/util"
)

func getMailingListIds() ([]string, error) {
	eb := oops.In("getMailingListIds").Public("Error loading newsletter form.")
	response, err := http.Get(os.Getenv("LISTMONK_INTERNAL_URL") + "/api/lists?tag=default")

	if err != nil {
		return nil, eb.Wrap(err)
	}

	if response.StatusCode != 200 {
		return nil, eb.Errorf("Non-200 response from Listmonk")
	}

	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)

	if err != nil {
		return nil, eb.Wrap(err)
	}

	var data map[string]any
	err = json.Unmarshal(body, &data)

	// Extract the UUID from each list
	results := lo.Map(data["data"].(map[string]any)["results"].([]any), func(item any, index int) string {
		return item.(map[string]any)["uuid"].(string)
	})

	return results, nil
}

func Footer(ac *util.AppContext) g.Node {
	listIds, err := getMailingListIds()
	message := oops.GetPublic(err, "")

	return h.Footer(h.Class("lc-container lc-footer"),
		h.Div(h.Class("newsletter"),
			g.If(message != "", h.P(g.Text("Error loading newsletter form."))),
			g.If(message == "",
				g.Group([]g.Node{
					h.Div(
						h.H3(g.Text("Join our newsletter")),
						h.P(g.Text("Get updates about Let's Church. No spam.")),
					),
					h.Form(
						h.Method("post"),
						h.Action("/newsletter/subscribe"),
						h.Input(h.Type("hidden"), h.Name("_csrf"), h.Value(ac.CsrfToken)),
						g.Group(g.Map(listIds, func(id string) g.Node {
							return h.Input(h.Type("hidden"), h.Name("l"), h.Value(id))
						})),
						Input(InputProps{Type: "email", Placeholder: "Enter your email", Big: true, Name: "email"}),
						Button(ButtonProps{Type: "submit", Primary: true, Big: true, Children: []g.Node{g.Text("Subscribe")}}),
					),
				}),
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
