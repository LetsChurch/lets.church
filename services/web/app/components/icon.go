package components

import (
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type IconProps struct {
	Name  string
	Class string
}

func Icon(props IconProps) g.Node {
	return g.El("svg", h.Class(strings.Join([]string{"lc-icon", props.Class}, " ")),
		g.El("use", h.Href("/assets/icons.svg#"+props.Name)),
	)
}
