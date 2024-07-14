package pages

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
	"lets.church/web/app/components"
	"lets.church/web/app/data"
	"lets.church/web/app/layouts"
)

type HomeProps struct {
	Uploads *[]data.TrendingUploadsRow
}

func Home(props HomeProps) g.Node {
	return layouts.Main(
		h.Main(h.Class("lc-container"),
			components.MediaGrid(components.MediaGridProps{Uploads: props.Uploads}),
		),
		components.Cta(components.CtaProps{
			PrimaryText:   "Sign Up",
			PrimaryHref:   "/auth/register",
			SecondaryText: "Learn More",
			SecondaryHref: "/about",
		}),
	)
}
