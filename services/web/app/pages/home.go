package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/components"
	"lets.church/web/app/data"
	"lets.church/web/app/layouts"
	"lets.church/web/app/util"
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
