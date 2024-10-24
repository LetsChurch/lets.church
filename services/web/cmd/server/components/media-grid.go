package components

import (
	"io"
	"time"

	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
	"lets.church/internal/data"
	"lets.church/internal/util"
)

type MediaGrid struct {
	Uploads *[]data.TrendingUploadsRow
}

func (mg MediaGrid) Render(w io.Writer) error {
	return h.Div(h.Class("lc-media-grid"),
		g.Group(g.Map(*mg.Uploads, func(item data.TrendingUploadsRow) g.Node {
			return h.Div(h.Class("lc-card"),
				h.Div(h.Class("thumbnail"),
					h.Div(h.Class("thumbnail-inner"),
						h.Img(h.Src("https://placehold.co/1920x1080"), h.Style("background:url(https://placehold.co/960x540)")),
						h.Span(h.Class("timestamp"), g.Text(util.FormatDuration(time.Duration(item.LengthSeconds.Float64)*time.Second))),
					),
				),
				h.Div(h.Class("meta"),
					Avatar{Name: item.ChannelName, Src: "https://placehold.co/96", Size: "md", Alt: "Placeholder"},
					h.A(h.Title(item.Title.String), h.Href("/media/"+util.Uuid(item.ID.Bytes).Base58()),
						h.P(h.Class("title"), g.Text(item.Title.String)),
						h.P(h.Class("channel-name"), g.Text(item.ChannelName)),
					),
				),
			)
		})),
	).Render(w)
}
