package pages

import (
	"fmt"
	"io"
	"strconv"
	"strings"

	g "maragu.dev/gomponents"
	hx "maragu.dev/gomponents-htmx"
	h "maragu.dev/gomponents/html"

	"github.com/samber/lo"

	"github.com/asticode/go-astisub"
	c "lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
	"lets.church/internal/data"
	gutil "lets.church/internal/util"
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

type Media struct {
	*data.UploadDataRow
	Ac         *util.AppContext
	Transcript *astisub.Subtitles
	Comments   map[string][]data.GetUploadUserCommentsRow
	UploadId   string
}

func (m Media) Render(w io.Writer) error {
	uuid, _ := gutil.ParseUuid(m.UploadId)

	audioOnly := lo.EveryBy(m.Variants, func(v data.UploadVariant) bool {
		return strings.HasPrefix(string(v), "AUDIO")
	})

	width, height := getDimensions(m.Variants)

	return layouts.Main{
		Ac: m.Ac,
		Body: []g.Node{
			c.Player{
				Id:        uuid.Canonical(),
				PlayAt:    0.0,
				AudioOnly: audioOnly,
				Width:     width,
				Height:    height,
			},
			h.Div(h.Class("lc-container"),
				hx.History("false"),
				h.Div(
					h.Class("lc-media__meta"),
					h.H1(h.Class("lc-media__meta__title"), g.Text(m.Title.String)),
					h.Div(h.Class("lc-media__meta__actions"),
						h.Div(
							h.A(
								h.Href("/channel/"+m.ChannelSlug.String),
								h.Class("lc-media__meta__actions__channel"),
								c.Avatar{Src: "https://placehold.co/96", Name: m.ChannelName.String, Size: "md", Alt: m.ChannelName.String},
								h.Div(g.Text(m.ChannelName.String)),
							),
							h.Form(
								h.Action("/channel/"+m.ChannelSlug.String+lo.Ternary(m.ChannelUserSubscribed, "/unsubscribe", "/subscribe")),
								h.Method("post"),
								h.Class("contents"),
								util.HxIsland("subscribe"),
								c.Button{
									Type:     "submit",
									Icon:     "rss",
									Children: []g.Node{g.Text(lo.Ternary(m.ChannelUserSubscribed, "Unsubscribe", "Subscribe"))},
									Active:   m.ChannelUserSubscribed,
								},
							),
						),
						h.Div(
							c.Button{Icon: "cloud-download", Children: []g.Node{g.Text("Download")}},
							c.Button{Icon: "share", Children: []g.Node{g.Text("Share")}},
							h.Div(h.Class("lc-button-group"),
								MediaRatingForm{
									UploadId:   m.UploadId,
									Likes:      m.UploadDataRow.TotalLikes,
									Dislikes:   m.UploadDataRow.TotalDislikes,
									UserRating: m.UploadDataRow.UserRating.Rating,
								},
							),
						),
					),
					h.Script(h.Type("module"), h.Src("/assets/components/transcript.js"), h.Defer()),
					g.El("lc-transcript",
						h.Div(
							h.Class("lc-media__meta__transcript"),
							h.Button(h.Class("lc-media__meta__transcript__expand"),
								g.Attr("onclick", "this.parentElement.classList.toggle('lc-media__meta__transcript--expanded')"),
								c.Icon(c.Icon{Name: "caret-down-filled", Width: 16, Height: 16}),
							),
							h.Dl(h.Class("lc-media__meta__transcript__scroll"),
								g.Group(g.Map(m.Transcript.Items, func(item *astisub.Item) g.Node {
									return h.Div(
										h.Class("lc-media__meta__transcript__segment"),
										h.Role("button"),
										h.Data("start", strconv.Itoa(int(item.StartAt.Seconds()))),
										h.Dt(h.Pre(g.Text(gutil.FormatDuration(item.StartAt)))),
										h.Dd(g.Text(item.String())),
									)
								})),
							),
						),
					),
					h.Div(h.Class("lc-media__meta__details"),
						h.Div(h.Class("lc-media__meta__details__stats"),
							h.P(h.Class("lc-media__meta__details__stats__views"),
								g.Text(fmt.Sprintf("%d views", m.TotalViews)),
							),
							h.Time(h.Class("lc-media__meta__details__stats__date"),
								g.Attr("datetime", "2024-07-09T18:28:18.961Z"),
								g.Text("July 9, 2024"),
							),
						),
						g.If(m.Description.String != "", h.Div(
							g.Text(m.Description.String),
						)),
					),
				),
				h.Div(
					g.Iff(m.Comments[""] != nil, func() g.Node {
						return g.Group(g.Map(m.Comments[""], func(rootComment data.GetUploadUserCommentsRow) g.Node {
							return h.Div(g.Text(rootComment.Text))
						}))
					}),
				),
			),
		},
	}.Render(w)
}

type MediaRatingForm struct {
	UploadId   string
	Likes      int64
	Dislikes   int64
	UserRating data.Rating
}

func (m MediaRatingForm) Render(w io.Writer) error {
	return h.Form(
		h.Method("post"),
		h.Action("/media/"+m.UploadId+"/rate"),
		h.Class("contents"),
		hx.Boost("false"),
		hx.Post("/media/"+m.UploadId+"/rate"),
		h.Input(h.Type("hidden"), h.Name("likes"), h.Value(strconv.Itoa(int(m.Likes)))),
		c.Button{
			Type:       "submit",
			Name:       "rating",
			Value:      "LIKE",
			Icon:       "thumb-up",
			Children:   []g.Node{g.Text(strconv.FormatInt(m.Likes, 10))},
			ActiveText: m.UserRating == data.RatingLIKE,
		},
		h.Input(h.Type("hidden"), h.Name("dislikes"), h.Value(strconv.Itoa(int(m.Dislikes)))),
		c.Button{
			Type:       "submit",
			Name:       "rating",
			Value:      "DISLIKE",
			Icon:       "thumb-down",
			IconClass:  "flip-x",
			Children:   []g.Node{g.Text(strconv.FormatInt(m.Dislikes, 10))},
			ActiveText: m.UserRating == data.RatingDISLIKE,
		},
	).Render(w)
}
