package components

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

type PlayerProps struct{}

func Player(props PlayerProps) g.Node {
	return h.Div(h.Class("lc-player-container"),
		h.Div(h.Class("lc-player"),
			g.Text("Hello, Player"),
		),
	)
}
