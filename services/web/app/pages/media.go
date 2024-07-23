package pages

import (
	"fmt"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"

	"lets.church/web/app/components"
	"lets.church/web/app/data"
	"lets.church/web/app/layouts"
)

type MediaProps struct {
	*data.UploadDataRow
	UploadId string
}

func Media(props MediaProps) g.Node {
	return layouts.Main(
		components.Player(components.PlayerProps{}),
		h.Div(h.Class("lc-container"),
			h.H1(h.Class("lc-media__title"), g.Text(props.Title.String)),
			h.Div(h.Class("lc-media__actions"),
				h.A(
					h.Href("/channel/"+props.ChannelSlug),
					h.Class("lc-media__actions__channel"),
					components.Avatar(components.AvatarProps{Src: "https://placehold.co/96", Name: props.ChannelName, Size: "md", Alt: props.ChannelName}),
					h.Div(g.Text(props.ChannelName)),
					components.Button(components.ButtonProps{Icon: "rss", Children: []g.Node{g.Text("Subscribe")}}),
				),
				h.Div(
					components.Button(components.ButtonProps{Icon: "cloud-download", Children: []g.Node{g.Text("Download")}}),
					components.Button(components.ButtonProps{Icon: "share", Children: []g.Node{g.Text("Share")}}),
					h.Div(h.Class("lc-button-group"),
						components.Button(components.ButtonProps{Icon: "thumb-up", Children: []g.Node{g.Text("Up")}}),
						components.Button(components.ButtonProps{Icon: "thumb-down", IconClass: "flip-x", Children: []g.Node{g.Text("Down")}}),
					),
				),
			),
			h.Div(h.Class("lc-media__content"),
				h.Div(h.Class("lc-media__content__meta"),
					h.Div(h.Class("lc-media__content__meta__stats"),
						h.P(h.Class("lc-media__content__meta__stats__views"),
							g.Text(fmt.Sprintf("%d views", props.TotalViews.Int64)),
						),
						h.Time(h.Class("lc-media__content__meta__stats__date"),
							g.Attr("datetime", "2024-07-09T18:28:18.961Z"),
							g.Text("July 9, 2024"),
						),
					),
					h.Div(
						g.Text(props.Description.String),
					),
				),
				h.Div(h.Class("lc-media__content__transcript"),
					g.Text("transcript"),
				),
			),
		),
	)
}
