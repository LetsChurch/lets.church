package components

import (
	"io"

	"github.com/samber/lo"
	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
)

type DropdownMenu struct {
	Id       string
	Children []g.Node
}

func (d DropdownMenu) Render(w io.Writer) error {
	return g.El("lc-dropdown-menu",
		h.ID(d.Id), h.Role("menu"), g.Attr("popover"),
		g.Group(d.Children),
	).Render(w)
}

type Link struct {
	Href  string
	Icon  string
	Label string
}

type DropdownLinkMenu struct {
	Id    string
	Attrs []g.Node
	Links [][]Link
}

func (d DropdownLinkMenu) Render(w io.Writer) error {
	links := lo.Map(
		lo.Filter(d.Links, func(group []Link, i int) bool { return len(group) > 0 }),
		func(items []Link, i int) g.Node {
			return h.Ul(h.Class("group"), g.Group(lo.Map(items, func(item Link, i int) g.Node {
				return h.A(h.Href(item.Href), h.Class("item"), Icon{Name: item.Icon, Size: 16}, g.Text(item.Label))
			})))
		},
	)

	children := []g.Node{}
	children = append(children, d.Attrs...)
	children = append(children, links...)

	return DropdownMenu{
		Id:       d.Id,
		Children: children,
	}.Render(w)
}
