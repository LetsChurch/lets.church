package jobs

import (
	"encoding/json"

	"github.com/contribsys/faktory/client"
	"github.com/google/uuid"
	"github.com/samber/oops"
)

type EmailArgs struct {
	From        string   `json:"from"`
	Subject     string   `json:"subject"`
	PlainText   string   `json:"text"`
	HtmlTitle   string   `json:"htmlTitle"`
	HtmlPreview string   `json:"htmlPreview"`
	HtmlParas   []string `json:"htmlParas"`
	To          []string `json:"to"`
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
