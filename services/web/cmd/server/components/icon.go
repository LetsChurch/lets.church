package components

import (
	"io"
	"strconv"
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type Icon struct {
	Name   string
	Class  string
	Width  int
	Height int
	Size   int
	Full   bool
}

func iconClasses(size int, full bool, class string) string {
	arr := []string{"lc-icon"}
	if full {
		arr = append(arr, "lc-icon--full")
	} else if size > 0 {
		arr = append(arr, "lc-icon--"+strconv.Itoa(size))
	}
	if class != "" {
		arr = append(arr, class)
	}
	return strings.Join(arr, " ")
}

func (i Icon) Render(w io.Writer) error {
	return g.El("svg", h.Class(iconClasses(i.Size, i.Full, i.Class)),
		g.El("use", h.Href("/assets/icons.svg#"+i.Name),
			g.If(i.Width > 0, h.Width(strconv.Itoa(i.Width))),
			g.If(i.Height > 0, h.Height(strconv.Itoa(i.Height))),
		),
	).Render(w)
}
