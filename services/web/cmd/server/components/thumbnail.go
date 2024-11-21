package components

import (
	"io"
	"time"

	"github.com/samber/lo"
	"lets.church/internal/util"
	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
)

type Thumbnail struct {
	Key           string
	LengthSeconds float64
	HasVideo      bool
}

func (tn Thumbnail) Render(w io.Writer) error {

	return h.Div(h.Class("lc-thumbnail"),
		h.Div(h.Class("lc-thumbnail__inner"),
			lo.TernaryF(
				tn.Key != "",
				func() g.Node {
					src := util.PublicImage(tn.Key, util.PiWidth(960), util.PiHeight(540))
					lqsrc := util.PublicImage(tn.Key, util.PiWidth(240), util.PiHeight(135))

					return h.Img(h.Src(src), h.Style("background:url("+lqsrc+")"))
				},
				func() g.Node {
					return Icon{Name: lo.Ternary(tn.HasVideo, "player-play", "volume"), Full: true, ViewBox: true}
				},
			),
			h.Span(h.Class("lc-thumbnail__timestamp"), g.Text(util.FormatDuration(time.Duration(tn.LengthSeconds)*time.Second))),
		),
	).Render(w)
}
