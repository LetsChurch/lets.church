package components

import (
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type InputProps struct {
	Type        string
	Placeholder string
	Icon        string
	Class       string
}

func Input(props InputProps) g.Node {
	return h.Div(h.Class(strings.Join([]string{"lc-input", props.Class}, " ")),
		g.If(props.Icon != "", Icon(IconProps{Name: props.Icon})),
		h.Input(h.Type(props.Type), h.Placeholder(props.Placeholder)),
	)
}
