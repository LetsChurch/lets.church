package components

import (
	"io"
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type Button struct {
	Type      string
	Class     string
	Icon      string
	IconClass string
	Children  []g.Node
	Primary   bool
	Big       bool
}

func (b Button) Render(w io.Writer) error {
	h.Button(
		g.If(b.Type != "", h.Type(b.Type)),
		h.Class(b.classes()),
		g.If(b.Icon != "", Icon(IconProps{Name: b.Icon, Class: b.IconClass})),
		g.Group(b.Children),
	).Render(w)

	return nil
}

func (b Button) classes() string {
	arr := []string{"lc-button"}
	if b.Class != "" {
		arr = append(arr, b.Class)
	}
	if b.Primary {
		arr = append(arr, "primary")
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
	h.A(
		g.If(bl.Type != "", h.Type(bl.Type)),
		h.Class(bl.classes()),
		h.Href(bl.Href),
		g.Group(bl.Children),
	).Render(w)

	return nil
}
