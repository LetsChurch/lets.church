package components

import (
	"fmt"
	"io"
	"strconv"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/internal/util"
)

type Player struct {
	Id            string
	LengthSeconds float64
	PlayAt        float64
	AudioOnly     bool
	Width         int
	Height        int
}

func (p Player) Render(w io.Writer) error {
	return h.Div(h.Class("lc-player-container"),
		g.Group([]g.Node{
			h.Script(h.Type("module"), h.Src("/assets/components/player.js"), h.Defer()),
			h.Link(h.Rel("stylesheet"), h.Href("/assets/player.css")),
			g.El("lc-player",
				h.ID(p.Id),
				g.If(!p.AudioOnly, g.Attr("video-source", util.GetVideoSourceUrl(p.Id))),
				g.Attr("audio-source", util.GetAudioSourceUrl(p.Id)),
				g.Attr("peaks-dat-url", util.GetPeaksDatUrl(p.Id)),
				g.Attr("peaks-json-url", util.GetPeaksJsonUrl(p.Id)),
				g.Attr("play-at", strconv.FormatFloat(p.PlayAt, 'f', -1, 64)),
				g.If(p.Width > 0 && p.Height > 0, g.Attr("style", "--media-width:"+fmt.Sprint(p.Width)+";--media-height:"+fmt.Sprint(p.Height)+";")),
			),
		}),
	).Render(w)
}
