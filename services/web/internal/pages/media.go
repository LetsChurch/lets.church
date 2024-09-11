package pages

import (
	"fmt"
	"strconv"
	"strings"

	g "github.com/maragudk/gomponents"
	hx "github.com/maragudk/gomponents-htmx"
	h "github.com/maragudk/gomponents/html"

	"github.com/samber/lo"

	"github.com/asticode/go-astisub"
	c "lets.church/internal/components"
	"lets.church/internal/data"
	"lets.church/internal/layouts"
	"lets.church/internal/util"
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
	Comments   map[string][]data.GetUploadUserCommentsRow
	UploadId   string
}

func Media(ac *util.AppContext, props MediaProps) g.Node {
	uuid, _ := util.ParseUuid(props.UploadId)

	audioOnly := lo.EveryBy(props.Variants, func(v data.UploadVariant) bool {
		return strings.HasPrefix(string(v), "AUDIO")
	})

	width, height := getDimensions(props.Variants)

	return layouts.Main(
		ac,
		c.Player(c.PlayerProps{
			Id:        uuid.Canonical(),
			PlayAt:    0.0,
			AudioOnly: audioOnly,
			Width:     width,
			Height:    height,
		}),
		h.Div(h.Class("lc-container"),
			hx.History("false"),
			h.Div(
				h.Class("lc-media__meta"),
				h.H1(h.Class("lc-media__meta__title"), g.Text(props.Title.String)),
				h.Div(h.Class("lc-media__meta__actions"),
					h.A(
						h.Href("/channel/"+props.ChannelSlug.String),
						h.Class("lc-media__meta__actions__channel"),
						c.Avatar(c.AvatarProps{Src: "https://placehold.co/96", Name: props.ChannelName.String, Size: "md", Alt: props.ChannelName.String}),
						h.Div(g.Text(props.ChannelName.String)),
						c.Button(c.ButtonProps{Icon: "rss", Children: []g.Node{g.Text("Subscribe")}}),
					),
					h.Div(
						c.Button(c.ButtonProps{Icon: "cloud-download", Children: []g.Node{g.Text("Download")}}),
						c.Button(c.ButtonProps{Icon: "share", Children: []g.Node{g.Text("Share")}}),
						h.Div(h.Class("lc-button-group"),
							c.Button(c.ButtonProps{Icon: "thumb-up", Children: []g.Node{g.Text("Up")}}),
							c.Button(c.ButtonProps{Icon: "thumb-down", IconClass: "flip-x", Children: []g.Node{g.Text("Down")}}),
						),
					),
				),
				h.Script(h.Type("module"), h.Src("/assets/components/transcript.js"), h.Defer()),
				g.El("lc-transcript",
					h.Div(
						h.Class("lc-media__meta__transcript"),
						h.Button(h.Class("lc-media__meta__transcript__expand"),
							g.Attr("onclick", "this.parentElement.classList.toggle('lc-media__meta__transcript--expanded')"),
							c.Icon(c.IconProps{Name: "caret-down-filled", Width: 16, Height: 16}),
						),
						h.Dl(h.Class("lc-media__meta__transcript__scroll"),
							g.Group(g.Map(props.Transcript.Items, func(item *astisub.Item) g.Node {
								return h.Div(
									h.Class("lc-media__meta__transcript__segment"),
									h.Role("button"),
									h.Data("start", strconv.Itoa(int(item.StartAt.Seconds()))),
									h.Dt(h.Pre(g.Text(util.FormatDuration(item.StartAt)))),
									h.Dd(g.Text(item.String())),
								)
							})),
						),
					),
				),
				h.Div(h.Class("lc-media__meta__details"),
					h.Div(h.Class("lc-media__meta__details__stats"),
						h.P(h.Class("lc-media__meta__details__stats__views"),
							g.Text(fmt.Sprintf("%d views", props.TotalViews)),
						),
						h.Time(h.Class("lc-media__meta__details__stats__date"),
							g.Attr("datetime", "2024-07-09T18:28:18.961Z"),
							g.Text("July 9, 2024"),
						),
					),
					g.If(props.Description.String != "", h.Div(
						g.Text(props.Description.String),
					)),
				),
			),
			h.Div(
				g.Iff(props.Comments[""] != nil, func() g.Node {
					return g.Group(g.Map(props.Comments[""], func(rootComment data.GetUploadUserCommentsRow) g.Node {
						return h.Div(g.Text(rootComment.Text))
					}))
				}),
			),
		),
	)
}
