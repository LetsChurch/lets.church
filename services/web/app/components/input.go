package components

import (
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type InputProps struct {
	Type        string
	Name        string
	Placeholder string
	Icon        string
	Class       string
	Big         bool
	Required    bool
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
		h.Input(h.Type(props.Type), h.Name(props.Name), h.Placeholder(props.Placeholder), g.If(props.Required, h.Required())),
	)
}

type LabeledInputProps struct {
	Label string
	Class string
	InputProps
}

func labeledInputClasses(class string) string {
	arr := []string{"lc-labeled-input"}
	if class != "" {
		arr = append(arr, class)
	}
	return strings.Join(arr, " ")
}

func LabeledInput(props LabeledInputProps) g.Node {
	return h.Label(h.Class(labeledInputClasses(props.Class)),
		h.Span(h.Class("lc-labeled-input__label"), g.Text(props.Label)),
		Input(props.InputProps),
	)
}

type LabeledCheckboxProps struct {
	Name    string
	Label   string
	Checked bool
}

func LabeledCheckbox(props LabeledCheckboxProps) g.Node {
	return h.Label(h.Class("lc-labeled-checkbox"),
		h.Input(h.Type("checkbox"), h.Name(props.Name), g.If(props.Checked, h.Checked())),
		h.Span(h.Class("lc-labeled-checkbox__label"), g.Text(props.Label)),
	)
}
