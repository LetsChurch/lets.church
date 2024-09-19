package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/cmd/server/components"
	"lets.church/cmd/server/layouts"
	"lets.church/cmd/server/util"
	"lets.church/internal/data"
)

type HomeProps struct {
	AppContext *util.AppContext
	Uploads    *[]data.TrendingUploadsRow
}

func Home(ac *util.AppContext, props HomeProps) g.Node {
	return layouts.Main(
		ac,
		h.Main(h.Class("lc-container"),
			components.MediaGrid(components.MediaGridProps{Uploads: props.Uploads}),
		),
		components.Cta(ac, components.CtaProps{
			PrimaryText:   "Sign Up",
			PrimaryHref:   "/auth/register",
			SecondaryText: "Learn More",
			SecondaryHref: "/about",
		}),
	)
}
