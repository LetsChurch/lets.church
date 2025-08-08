package components

import (
	"io"
	"strings"

	"github.com/samber/lo"
	"lets.church/internal/data"
	"lets.church/internal/util"
	g "maragu.dev/gomponents"
	h "maragu.dev/gomponents/html"
)

type MediaGrid struct {
	Uploads *[]data.TrendingUploadsRow
}

func (mg MediaGrid) Render(w io.Writer) error {
	return h.Div(h.Class("lc-media-grid"),
		g.Group(g.Map(*mg.Uploads, func(item data.TrendingUploadsRow) g.Node {
			return h.Div(h.Class("lc-card"),
				Thumbnail{
					Key: lo.CoalesceOrEmpty(
						item.OverrideThumbnailPath.String,
						item.DefaultThumbnailPath.String,
						item.ChannelDefaultThumbnailPath.String,
					),
					LengthSeconds: item.LengthSeconds.Float64,
					HasVideo: lo.SomeBy(item.Variants, func(v data.UploadVariant) bool {
						return strings.HasPrefix(string(v), "VIDEO_")
					}),
				},
				h.Div(h.Class("meta"),
					Avatar{
						ImgKey: item.ChannelAvatarPath.String,
						Name:   item.ChannelName,
						Size:   "md",
						Alt:    item.ChannelName + " avatar",
					},
					h.A(h.Title(item.Title.String), h.Href("/media/"+util.Uuid(item.ID.Bytes).Base58()),
						h.P(h.Class("title"), g.Text(item.Title.String)),
						h.P(h.Class("channel-name"), g.Text(item.ChannelName)),
					),
				),
			)
		})),
	).Render(w)
}
