package layouts

import (
	g "github.com/maragudk/gomponents"
	"lets.church/web/app/components"
	"lets.church/web/app/data"
)

type MainProps struct {
	Session *data.GetSessionRow
}

func Main(props MainProps, body ...g.Node) g.Node {
	return Doc(
		components.Header(components.HeaderProps{Session: props.Session}),
		g.Group(body),
		components.Footer(),
	)
}
