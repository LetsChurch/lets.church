package components

import (
	"strconv"
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type IconProps struct {
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

func Icon(props IconProps) g.Node {
	return g.El("svg", h.Class(iconClasses(props.Size, props.Full, props.Class)),
		g.El("use", h.Href("/assets/icons.svg#"+props.Name),
			g.If(props.Width > 0, h.Width(strconv.Itoa(props.Width))),
			g.If(props.Height > 0, h.Height(strconv.Itoa(props.Height))),
		),
	)
}
