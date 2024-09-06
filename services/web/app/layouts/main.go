package layouts

import (
	g "github.com/maragudk/gomponents"
	c "lets.church/web/app/components"
	"lets.church/web/app/util"
)

func Main(ac *util.AppContext, body ...g.Node) g.Node {
	return Doc(
		ac,
		c.Header(ac),
		g.Group(body),
		c.Footer(ac),
	)
}
