package components

import (
	"io"
	"regexp"
	"strings"

	"lets.church/internal/util"
	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
)

var avatarInitialsRx = regexp.MustCompile(`(\p{L}{1})\p{L}+`)

func getAvatarInitials(name string) string {
	// Find all matches
	matches := avatarInitialsRx.FindAllStringSubmatch(name, -1)

	// Get the first and last initials
	var first, last string
	if len(matches) > 0 {
		first = matches[0][1]
		last = matches[len(matches)-1][1]
	}

	// Concatenate and convert to uppercase
	initials := strings.ToUpper(first + last)
	return initials
}

type Avatar struct {
	ImgKey string
	Name   string
	Class  string
	Size   string
	Alt    string
	OnDark bool
}

func (a Avatar) Render(w io.Writer) error {
	return h.Div(h.Class(a.classes()),
		g.If(a.ImgKey != "", h.Img(h.Src(a.src()))),
		g.If(a.ImgKey == "" && a.Name != "", g.Text(getAvatarInitials(a.Name))),
	).Render(w)
}

func (a Avatar) classes() string {
	arr := []string{"lc-avatar"}
	if a.OnDark {
		arr = append(arr, "lc-avatar--on-dark")
	}
	if a.Size != "" {
		arr = append(arr, "lc-avatar--"+a.Size)
	}
	if a.Class != "" {
		arr = append(arr, a.Class)
	}
	return strings.Join(arr, " ")
}

func (a Avatar) src() string {
	scale := 6
	if a.Size == "sm" {
		scale = 8
	} else if a.Size == "md" {
		scale = 10
	} else if a.Size == "lg" {
		scale = 12
	} else if a.Size == "xl" {
		scale = 14
	} else if a.Size == "2xl" {
		scale = 16
	}

	size := scale * 4 * 3 // 4 is the unit size, 3 is for DPI (TODO: serve multiple renditions for different DPI?)

	return util.PublicImage(a.ImgKey, util.PiWidth(size), util.PiHeight(size))
}
