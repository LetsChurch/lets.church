package util

import (
	"context"
	"strings"
	"sync"
	"text/template"

	mjml "github.com/Boostport/mjml-go"
	"github.com/samber/oops"
)

const templateText = `
<mjml>
  <mj-head>
    <mj-title>{{.Title}}</mj-title>
    <mj-preview>{{.Preview}}</mj-preview>
    <mj-style>
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
    </mj-style>
  </mj-head>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-image width="250px" src="https://mail.letschurch.cloud/logo.png" href="https://lets.church" />
        <mj-text font-family="system-ui, sans-serif" font-size="16px" line-height="165%" color="#111111">
          <h1>{{.Title}}</h1>
					{{range .Body}}
					<p>{{.}}</p>
	        {{end}}
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-social>
          <mj-social-element src="https://mail.letschurch.cloud/brand-facebook.png" href="https://fb.me/LetsChurchOrg" />
          <mj-social-element src="https://mail.letschurch.cloud/brand-x.png" href="https://x.com/LetsChurchOrg" />
          <mj-social-element src="https://mail.letschurch.cloud/brand-github.png" href="https://github.com/LetsChurch" />
          <mj-social-element src="https://mail.letschurch.cloud/brand-gitlab.png" href="https://gitlab.com/LetsChurch" />
        </mj-social>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`

var tmpl = sync.OnceValue(func() *template.Template {
	return template.Must(template.New("email").Parse(templateText))
})

type MakeEmailHtmlArgs struct {
	Title   string
	Preview string
	Body    []string
}

func MakeEmailHtml(args MakeEmailHtmlArgs) (string, error) {
	eb := oops.Hint("MakeEmailHtml")

	var buf strings.Builder
	err := tmpl().Execute(&buf, args)
	if err != nil {
		return "", eb.Hint("Could not compile template to mjml with html/template").Wrap(err)
	}

	output, err := mjml.ToHTML(context.Background(), buf.String(), mjml.WithMinify(true))

	return output, eb.Hint("Could not compile mjml to HTML").Wrap(err)
}
