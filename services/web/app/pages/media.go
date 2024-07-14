package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"

	"lets.church/web/app/data"
	"lets.church/web/app/layouts"
)

type MediaProps struct {
	UploadId string
	*data.UploadDataRow
}

func Media(props MediaProps) g.Node {
	return layouts.Main(
		h.Main(h.Class("lc-container"),
			g.Text("Media "+props.UploadId+": "+props.Title.String),
		),
	)
}
