package components

import (
	"regexp"
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
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

func avatarClasses(size string, class string) string {
	arr := []string{"lc-avatar"}
	if size != "" {
		arr = append(arr, "lc-avatar--"+size)
	}
	if class != "" {
		arr = append(arr, class)
	}
	return strings.Join(arr, " ")
}

type AvatarProps struct {
	Src   string
	Name  string
	Class string
	Size  string
	Alt   string
}

func Avatar(props AvatarProps) g.Node {
	return h.Div(h.Class(avatarClasses(props.Size, props.Class)),
		g.If(props.Src != "", h.Img(h.Src(props.Src))),
		g.If(props.Src == "" && props.Name != "", g.Text(getAvatarInitials(props.Name))))
}
