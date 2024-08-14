package layouts

import (
	g "github.com/maragudk/gomponents"
	"lets.church/web/app/components"
	"lets.church/web/app/util"
)

func Main(ac *util.AppContext, body ...g.Node) g.Node {
	return Doc(
		ac,
		components.Header(ac),
		g.Group(body),
		components.Footer(),
	)
}
