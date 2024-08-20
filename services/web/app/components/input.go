package components

import (
	"strings"

	g "github.com/maragudk/gomponents"
	hx "github.com/maragudk/gomponents-htmx"
	h "github.com/maragudk/gomponents/html"
	"github.com/samber/lo"
)

type InputProps struct {
	Type        string
	Name        string
	Value       string
	Placeholder string
	Icon        string
	Class       string
	HxPost      string
	Error       string
	Big         bool
	Required    bool
}

func inputClasses(props InputProps) string {
	arr := []string{"lc-input"}
	if props.Class != "" {
		arr = append(arr, props.Class)
	}
	if props.Big {
		arr = append(arr, "big")
	}
	return strings.Join(arr, " ")
}

func Input(props InputProps) g.Node {
	return h.Div(h.Class(inputClasses(props)),
		g.If(props.Icon != "", Icon(IconProps{Name: props.Icon})),
		h.Input(
			h.Type(props.Type),
			h.Name(props.Name),
			g.If(props.Value != "", h.Value(props.Value)),
			h.Placeholder(props.Placeholder),
			g.If(props.Required, h.Required()),
			g.If(props.HxPost != "", hx.Post(props.HxPost)),
			g.If(props.Error != "", g.Group([]g.Node{
				g.Attr("aria-invalid", "true"),
				g.Attr("aria-errormessage", props.Error),
			})),
		),
	)
}

type LabeledInputProps struct {
	Label string
	Class string
	Hint  string
	Error string
	InputProps
}

func labeledInputClasses(props LabeledInputProps) string {
	arr := []string{"lc-labeled-input"}
	if props.Error != "" {
		arr = append(arr, "lc-labeled-input--error")
	}
	if props.Class != "" {
		arr = append(arr, props.Class)
	}
	return strings.Join(arr, " ")
}

func LabeledInput(props LabeledInputProps) g.Node {
	hintText, hasHintText := lo.Coalesce(props.Error, props.Hint)
	inputProps := props.InputProps
	inputProps.Error = props.Error

	return h.Div(
		h.Class(labeledInputClasses(props)),
		g.If(
			props.HxPost != "",
			g.Group(
				[]g.Node{
					hx.Target("this"),
					hx.Swap("outerHTML"),
				},
			),
		),
		h.Label(
			h.Span(h.Class("lc-labeled-input__label"), g.Text(props.Label)),
			Input(inputProps),
		),
		g.If(
			hasHintText,
			h.Small(h.Class("lc-labeled-input__hint"), g.Text(hintText)),
		),
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
		h.Span(h.Class("lc-labeled-checkbox__label"), g.Raw(props.Label)),
	)
}
