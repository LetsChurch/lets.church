package components

import (
	"fmt"
	"strconv"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/util"
)

type PlayerProps struct {
	Id            string
	LengthSeconds float64
	PlayAt        float64
	AudioOnly     bool
	Width         int
	Height        int
}

func Player(props PlayerProps) g.Node {
	return g.Group([]g.Node{
		h.Script(h.Type("module"), h.Src("/assets/components/player.js"), h.Defer()),
		h.Link(h.Rel("stylesheet"), h.Href("/assets/player.css")),
		h.Div(h.Class("lc-player-container"),
			g.El("lc-player",
				h.ID(props.Id),
				g.If(!props.AudioOnly, g.Attr("video-source", util.GetVideoSourceUrl(props.Id))),
				g.Attr("audio-source", util.GetAudioSourceUrl(props.Id)),
				g.Attr("peaks-dat-url", util.GetPeaksDatUrl(props.Id)),
				g.Attr("peaks-json-url", util.GetPeaksJsonUrl(props.Id)),
				g.Attr("play-at", strconv.FormatFloat(props.PlayAt, 'f', -1, 64)),
				g.If(props.Width > 0 && props.Height > 0, g.Attr("style", "--media-width:"+fmt.Sprint(props.Width)+";--media-height:"+fmt.Sprint(props.Height)+";")),
			),
		),
	})
}
