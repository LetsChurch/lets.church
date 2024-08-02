package pages

import (
	"fmt"
	"strings"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"

	"github.com/samber/lo"

	"github.com/asticode/go-astisub"
	"lets.church/web/app/components"
	"lets.church/web/app/data"
	"lets.church/web/app/layouts"
	"lets.church/web/app/util"
)

func getDimensions(variants []data.UploadVariant) (int, int) {
	if lo.Contains(variants, "VIDEO_4K") {
		return 3840, 2160
	}

	if lo.Contains(variants, "VIDEO_1080P") {
		return 1920, 1080
	}

	if lo.Contains(variants, "VIDEO_720P") {
		return 1280, 720
	}

	if lo.Contains(variants, "VIDEO_480P") {
		return 960, 540
	}

	if lo.Contains(variants, "VIDEO_360P") {
		return 640, 360
	}

	return 0, 0
}

type MediaProps struct {
	*data.UploadDataRow
	Transcript *astisub.Subtitles
	UploadId   string
}

func Media(props MediaProps) g.Node {
	uuid, _ := util.Parse(props.UploadId)

	audioOnly := lo.EveryBy(props.Variants, func(v data.UploadVariant) bool {
		return strings.HasPrefix(string(v), "AUDIO")
	})

	width, height := getDimensions(props.Variants)

	return layouts.Main(
		components.Player(components.PlayerProps{
			Id:            uuid.Canonical(),
			LengthSeconds: props.LengthSeconds.Float64,
			PlayAt:        0.0,
			AudioOnly:     audioOnly,
			Width:         width,
			Height:        height,
		}),
		h.Div(h.Class("lc-container"),
			h.H1(h.Class("lc-media__title"), g.Text(props.Title.String)),
			h.Div(h.Class("lc-media__actions"),
				h.A(
					h.Href("/channel/"+props.ChannelSlug.String),
					h.Class("lc-media__actions__channel"),
					components.Avatar(components.AvatarProps{Src: "https://placehold.co/96", Name: props.ChannelName.String, Size: "md", Alt: props.ChannelName.String}),
					h.Div(g.Text(props.ChannelName.String)),
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
							g.Text(fmt.Sprintf("%d views", props.TotalViews)),
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
				h.Dl(h.Class("lc-media__content__transcript"),
					g.Group(g.Map(props.Transcript.Items, func(item *astisub.Item) g.Node {
						return h.Div(
							h.Class("lc-media__content__transcript__segment"),
							h.Role("button"),
							h.Dt(h.Pre(g.Text(util.FormatDuration(item.StartAt)))),
							h.Dd(g.Text(item.String())),
						)
					})),
				),
			),
		),
	)
}
