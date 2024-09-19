package layouts

import (
	g "github.com/maragudk/gomponents"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/util"
)

func Main(ac *util.AppContext, body ...g.Node) g.Node {
	return Doc(
		ac,
		c.Header(ac),
		g.Group(body),
		c.Footer(ac),
	)
}
