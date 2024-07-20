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
	Big         bool
}

func inputClasses(big bool, class string) string {
	arr := []string{"lc-input"}
	if class != "" {
		arr = append(arr, class)
	}
	if big {
		arr = append(arr, "big")
	}
	return strings.Join(arr, " ")
}

func Input(props InputProps) g.Node {
	return h.Div(h.Class(inputClasses(props.Big, props.Class)),
		g.If(props.Icon != "", Icon(IconProps{Name: props.Icon})),
		h.Input(h.Type(props.Type), h.Placeholder(props.Placeholder)),
	)
}
