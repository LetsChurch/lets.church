package jobs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/smtp"
	"net/url"
	"os"
	"strings"

	"github.com/contribsys/faktory/client"
	worker "github.com/contribsys/faktory_worker_go"
	"github.com/google/uuid"
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
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	help := worker.HelperFor(ctx)
	var email EmailArgs
	err := json.Unmarshal([]byte(args[0].(string)), &email)
	if err != nil {
		return err
	}

	u, err := url.Parse(SMTP_URL)
	if err != nil {
		return err
	}

	logger.Info("Working on job", "id", help.Jid())

	password, _ := u.User.Password()
	auth := lo.Ternary(u.User.Username() != "", smtp.PlainAuth("", u.User.Username(), password, u.Host), nil)
	randomBytes := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, randomBytes); err != nil {
		return err
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
		logger.Error("Failed to send email", "error", err.Error())
		return err
	}

	return nil
}
