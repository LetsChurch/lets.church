package components

import (
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type ButtonProps struct {
	Type     string
	Class    string
	Children []g.Node
	Primary  bool
}

func classes(primary bool, class string) string {
	arr := []string{"lc-button"}
	if class != "" {
		arr = append(arr, class)
	}
	if primary {
		arr = append(arr, "primary")
	}
	return strings.Join(arr, " ")
}

func Button(props ButtonProps) g.Node {
	return h.Button(
		g.If(props.Type != "", h.Type(props.Type)),
		h.Class(classes(props.Primary, props.Class)),
		g.Group(props.Children),
	)
}

type ButtonLinkProps struct {
	Href string
	ButtonProps
}

func ButtonLink(props ButtonLinkProps) g.Node {
	return h.A(
		g.If(props.Type != "", h.Type(props.Type)),
		h.Class(classes(props.Primary, props.Class)),
		h.Href(props.Href),
		g.Group(props.Children),
	)
}
