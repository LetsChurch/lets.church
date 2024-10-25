package components

import (
	"io"
	"strings"

	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
)

type Button struct {
	Type       string
	Class      string
	Icon       string
	IconClass  string
	Name       string
	Value      string
	Children   []g.Node
	Primary    bool
	Big        bool
	Active     bool
	ActiveText bool
}

func (b Button) Render(w io.Writer) error {
	return h.Button(
		g.If(b.Type != "", h.Type(b.Type)),
		h.Class(b.classes()),
		g.If(b.Icon != "", Icon{Name: b.Icon, Class: b.IconClass}),
		g.Group(b.Children),
		g.If(b.Name != "", h.Name(b.Name)),
		g.If(b.Value != "", h.Value(b.Value)),
	).Render(w)
}

func (b Button) classes() string {
	arr := []string{"lc-button"}
	if b.Class != "" {
		arr = append(arr, b.Class)
	}
	if b.Primary {
		arr = append(arr, "primary")
	}
	if b.Active {
		arr = append(arr, "active")
	}
	if b.ActiveText {
		arr = append(arr, "active-text")
	}
	if b.Big {
		arr = append(arr, "big")
	}
	return strings.Join(arr, " ")
}

type ButtonLink struct {
	Href string
	Button
}

func (bl ButtonLink) Render(w io.Writer) error {
	return h.A(
		g.If(bl.Type != "", h.Type(bl.Type)),
		h.Class(bl.classes()),
		h.Href(bl.Href),
		g.Group(bl.Children),
	).Render(w)
}
