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

	"github.com/contribsys/faktory/client"
	worker "github.com/contribsys/faktory_worker_go"
	"github.com/google/uuid"
	l "github.com/rs/zerolog/log"
	"github.com/samber/lo"
	"github.com/samber/oops"
)

var SMTP_URL string = os.Getenv("SMTP_URL")

type EmailArgs struct {
	From    string   `json:"from"`
	Subject string   `json:"subject"`
	Text    string   `json:"text"`
	Html    string   `json:"html"`
	To      []string `json:"to"`
}

func QueueEmailJob(c *client.Client, args EmailArgs) error {
	eb := oops.Hint("QueueEmailJob")
	emailJson, err := json.Marshal(args)
	if err != nil {
		return eb.Hint("Could not serialize email job arguments").Wrap(err)
	}

	err = c.Push(&client.Job{
		Queue: "background",
		Type:  "SendEmail",
		Args:  []any{string(emailJson)},
		Jid:   uuid.NewString(),
	})

	return oops.Hint("Could not submit email job").Wrap(err)
}

func SendEmail(ctx context.Context, args ...any) error {
	eb := oops.In("SendEmail")
	help := worker.HelperFor(ctx)
	logger := l.Logger.With().Str("jobId", help.Jid()).Logger()
	logger.Info().Msg("Starting job")

	var email EmailArgs
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
	body := strings.Join([]string{
		"From: " + email.From,
		"To: " + strings.Join(email.To, ","),
		"Subject: " + email.Subject,
		"MIME-Version: 1.0",
		"Content-Type: multipart/alternative; boundary=" + boundary,
		"\r\n--" + boundary,
		"Content-Type: text/plain; charset=\"utf-8\"\r\n",
		email.Text,
		"\r\n--" + boundary,
		"Content-Type: text/html; charset=\"utf-8\"\r\n",
		email.Html,
	}, "\r\n")
	err = smtp.SendMail(u.Host, auth, email.From, email.To, []byte(body))
	if err != nil {
		logger.Error().Err(err).Msg("Failed to send email")
		return eb.Hint("Could not send email").Wrap(err)
	}

	return nil
}
