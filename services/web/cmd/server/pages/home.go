package pages

import (
	"io"

	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
	"lets.church/internal/data"
)

type Home struct {
	Ac      *util.AppContext
	Uploads *[]data.TrendingUploadsRow
}

func (home Home) Render(w io.Writer) error {
	return layouts.Main{
		Ac: home.Ac,
		Body: []g.Node{
			h.Main(h.Class("lc-container"),
				components.MediaGrid{Uploads: home.Uploads},
			),
			components.Cta{
				Ac:            home.Ac,
				PrimaryText:   "Sign Up",
				PrimaryHref:   "/auth/register",
				SecondaryText: "Learn More",
				SecondaryHref: "/about",
			},
		},
	}.Render(w)
}
