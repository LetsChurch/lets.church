package components

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/data"
	"lets.church/web/app/util"
)

type MediaGridProps struct {
	Uploads *[]data.UploadGridRecord
}

func MediaGrid(props MediaGridProps) g.Node {
	return h.Div(h.Class("lc-media-grid"),
		g.Group(g.Map(*props.Uploads, func(item data.UploadGridRecord) g.Node {
			return h.Div(h.Class("lc-card"),
				h.Div(h.Class("thumbnail"),
					h.Div(h.Class("thumbnail-inner"),
						h.Img(h.Src("https://placehold.co/1920x1080"), h.Style("background:url(https://placehold.co/960x540)")),
						h.Span(h.Class("timestamp"), g.Text(util.FormatSeconds(item.LengthSeconds))),
					),
				),
				h.Div(h.Class("meta"),
					h.Img(h.Class("avatar"), h.Src("https://placehold.co/96"), h.Alt("Placeholder")),
					h.A(h.Title(item.Title), h.Href("/media/"+item.Id),
						h.P(h.Class("title"), g.Text(item.Title)),
						h.P(h.Class("channel-name"), g.Text(item.ChannelName)),
					),
				),
			)
		})),
	)
}
