package components

import (
	"io"
	"strings"

	g "github.com/maragudk/gomponents"
	hx "github.com/maragudk/gomponents-htmx"
	h "github.com/maragudk/gomponents/html"
	"github.com/samber/lo"
)

type Input struct {
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

func (i Input) Render(w io.Writer) error {
	return h.Div(h.Class(i.classes()),
		g.If(i.Icon != "", Icon{Name: i.Icon}),
		h.Input(
			h.Type(i.Type),
			h.Name(i.Name),
			g.If(i.Value != "", h.Value(i.Value)),
			h.Placeholder(i.Placeholder),
			g.If(i.Required, h.Required()),
			g.If(i.HxPost != "", hx.Post(i.HxPost)),
			g.If(i.Error != "", g.Group([]g.Node{
				g.Attr("aria-invalid", "true"),
				g.Attr("aria-errormessage", i.Error),
			})),
		),
	).Render(w)
}

func (i Input) classes() string {
	arr := []string{"lc-input"}
	if i.Class != "" {
		arr = append(arr, i.Class)
	}
	if i.Big {
		arr = append(arr, "big")
	}
	return strings.Join(arr, " ")
}

type LabeledInput struct {
	Label string
	Class string
	Hint  string
	Error string
	Input
}

func (li LabeledInput) Render(w io.Writer) error {
	hintText, hasHintText := lo.Coalesce(li.Error, li.Hint)
	input := li.Input
	input.Error = li.Error

	return h.Div(
		h.Class(li.classes()),
		g.If(
			li.HxPost != "",
			g.Group(
				[]g.Node{
					hx.Target("this"),
					hx.Swap("outerHTML"),
				},
			),
		),
		h.Label(
			h.Span(h.Class("lc-labeled-input__label"), g.Text(li.Label)),
			Input(input),
		),
		g.If(
			hasHintText,
			h.Small(h.Class("lc-labeled-input__hint"), g.Text(hintText)),
		),
	).Render(w)
}

func (li LabeledInput) classes() string {
	arr := []string{"lc-labeled-input"}
	if li.Error != "" {
		arr = append(arr, "lc-labeled-input--error")
	}
	if li.Class != "" {
		arr = append(arr, li.Class)
	}
	return strings.Join(arr, " ")
}

type LabeledCheckbox struct {
	Name    string
	Label   string
	Checked bool
}

func (lcb LabeledCheckbox) Render(w io.Writer) error {
	return h.Label(h.Class("lc-labeled-checkbox"),
		h.Input(h.Type("checkbox"), h.Name(lcb.Name), g.If(lcb.Checked, h.Checked())),
		h.Span(h.Class("lc-labeled-checkbox__label"), g.Raw(lcb.Label)),
	).Render(w)
}
