package jobs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/smtp"
	"net/url"
	"os"
	"strings"

	worker "github.com/contribsys/faktory_worker_go"
	l "github.com/rs/zerolog/log"
	"github.com/samber/lo"
	"github.com/samber/oops"
	"lets.church/internal/jobs"
	"sync"
	"text/template"

	mjml "github.com/Boostport/mjml-go"
)

var SMTP_URL string = os.Getenv("SMTP_URL")

func SendEmail(ctx context.Context, args ...any) error {
	eb := oops.In("SendEmail")
	help := worker.HelperFor(ctx)
	logger := l.Logger.With().Str("jobId", help.Jid()).Logger()
	logger.Info().Msg("Starting job")

	var email jobs.EmailArgs
	err := json.Unmarshal([]byte(args[0].(string)), &email)
	if err != nil {
		return eb.Hint("Could not parse email args").Wrap(err)
	}

	u, err := url.Parse(SMTP_URL)
	if err != nil {
		return eb.Hint("Could not parse SMTP URL").Wrap(err)
	}

	smtpPassword, _ := u.User.Password()
	auth := lo.Ternary(u.User.Username() != "", smtp.PlainAuth("", u.User.Username(), smtpPassword, u.Host), nil)
	randomBytes := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, randomBytes); err != nil {
		return eb.Hint("Could not generate random boundary").Wrap(err)
	}
	boundary := hex.EncodeToString(randomBytes)

	html, err := makeEmailHtml(makeEmailHtmlArgs{
		Title:   email.HtmlTitle,
		Preview: email.HtmlPreview,
		Paras:   email.HtmlParas,
	})

	if err != nil {
		return eb.Hint("Could not generate email HTML").Wrap(err)
	}

	body := strings.Join([]string{
		"From: " + email.From,
		"To: " + strings.Join(email.To, ","),
		"Subject: " + email.Subject,
		"MIME-Version: 1.0",
		"Content-Type: multipart/alternative; boundary=" + boundary,
		"\r\n--" + boundary,
		"Content-Type: text/plain; charset=\"utf-8\"\r\n",
		email.PlainText,
		"\r\n--" + boundary,
		"Content-Type: text/html; charset=\"utf-8\"\r\n",
		html,
	}, "\r\n")
	err = smtp.SendMail(u.Host, auth, email.From, email.To, []byte(body))
	if err != nil {
		logger.Error().Err(err).Msg("Failed to send email")
		return eb.Hint("Could not send email").Wrap(err)
	}

	return nil
}

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
					{{range .Paras}}
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

type makeEmailHtmlArgs struct {
	Title   string
	Preview string
	Paras   []string
}

func makeEmailHtml(args makeEmailHtmlArgs) (string, error) {
	eb := oops.Hint("MakeEmailHtml")

	var buf strings.Builder
	err := tmpl().Execute(&buf, args)
	if err != nil {
		return "", eb.Hint("Could not compile template to mjml with html/template").Wrap(err)
	}

	output, err := mjml.ToHTML(context.Background(), buf.String(), mjml.WithMinify(true))

	return output, eb.Hint("Could not compile mjml to HTML").Wrap(err)
}
