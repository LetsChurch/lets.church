package util

import g "maragu.dev/gomponents"
import h "maragu.dev/gomponents/html"
import hx "maragu.dev/gomponents-htmx"

func HxIsland(id string) g.Group {
	return []g.Node{
		h.ID(id),
		hx.Select("#" + id),
		hx.Swap("outerHTML show:none"),
		hx.Target("this"),
	}
}
