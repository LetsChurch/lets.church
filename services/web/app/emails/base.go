package emails

import (
	g "github.com/maragudk/gomponents"
	h "github.com/maragudk/gomponents/html"
)

const styles = `
#outlook a { padding:0; }
body { margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%; }
table, td { border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt; }
img { border:0;height:auto;line-height:100%; outline:none;text-decoration:none;-ms-interpolation-mode:bicubic; }
p { display:block;margin:13px 0; }

font-family: system-ui, sans-serif;
font-weight: normal;
a {
  color: inherit;
  text-decoration: underline;
  text-decoration-style: dotted;
}
a.plain {
  text-decoration: none;
  color: inherit;
}
a:hover {
  text-decoration: underline;
}
`

const onlyScreenMin480Styles = `
@media only screen and (min-width:480px) {
	.mj-column-per-100 { width:100% !important; max-width: 100%; }
}
`

const screenMin480Styles = `
.moz-text-html .mj-column-per-100 { width:100% !important; max-width: 100%; }
`

const onlyScreenMax479Styles = `
@media only screen and (max-width:479px) {
	table.mj-full-width-mobile { width: 100% !important; }
	td.mj-full-width-mobile { width: auto !important; }
}
`

type BaseProps struct {
	Title string
	Body  []g.Node
}

func Base(props BaseProps) g.Node {
	return h.Doctype(
		h.HTML(
			g.Attr("xmlns", "http://www.w3.org/1999/xhtml"),
			g.Attr("xmlns:v", "urn:schemas-microsoft-com:vml"),
			g.Attr("xmlns:o", "urn:schemas-microsoft-com:office:office"),
			h.Head(
				h.TitleEl(g.Text(props.Title)),

				g.Raw("<!--[if !mso]><!-->"),
				h.Meta(g.Attr("http-equiv", "X-UA-Compatible"), g.Attr("content", "IE=edge")),
				g.Raw("<!--<![endif]-->"),

				h.Meta(g.Attr("http-equiv", "Content-Type"), g.Attr("content", "text/html; charset=UTF-8")),
				h.Meta(h.Name("viewport"), h.Content("width=device-width, initial-scale=1")),

				h.StyleEl(h.Type("text/css"), g.Text(styles)),

				g.Raw("<!--[if mso]><!-->"),
				h.NoScript(
					g.El(
						"xml",
						g.El(
							"o:OfficeDocumentSettings",
							g.El("o:AllowPNG"),
							g.El("o:PixelsPerInch", g.Text("96")),
						),
					),
				),
				g.Raw("<!--<![endif]-->"),

				g.Raw("<!--[if lte mso 11]><!-->"),
				h.StyleEl(h.Type("text/css"), g.Text(".mj-outlook-group-fix { width:100% !important; }")),
				g.Raw("<!--<![endif]-->"),

				h.StyleEl(h.Type("text/css"), g.Text(onlyScreenMin480Styles)),
				h.StyleEl(g.Attr("media", "screen and (min-width:480px)"), g.Text(screenMin480Styles)),
				h.StyleEl(h.Type("text/css"), g.Text(onlyScreenMax479Styles)),
			),
			h.Body(
				h.Style("word-spacing:normal;"),
				h.Div(h.Style(""), g.Group(props.Body)),
			),
		),
	)
}
