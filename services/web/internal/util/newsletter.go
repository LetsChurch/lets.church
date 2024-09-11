package util

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/samber/lo"
	"github.com/samber/oops"
)

func GetDefaultMailingListIds() ([]string, error) {
	eb := oops.In("getMailingListIds").Public("Error loading newsletter form.")
	response, err := http.Get(os.Getenv("LISTMONK_INTERNAL_URL") + "/api/lists?tag=default")

	if err != nil {
		return nil, eb.Wrap(err)
	}

	if response.StatusCode != 200 {
		return nil, eb.Errorf("Non-200 response from Listmonk")
	}

	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)

	if err != nil {
		return nil, eb.Wrap(err)
	}

	var data map[string]any
	err = json.Unmarshal(body, &data)

	// Extract the UUID from each list
	results := lo.Map(data["data"].(map[string]any)["results"].([]any), func(item any, index int) string {
		return item.(map[string]any)["uuid"].(string)
	})

	return results, nil
}

func SubscribeToDefaultNewsletters(email string) error {
	eb := oops.In("subscribeToNewsletter")

	listIds, err := GetDefaultMailingListIds()

	if err != nil {
		return eb.Wrap(err)
	}

	if len(listIds) == 0 {
		return eb.Errorf("No default mailing lists found.")
	}

	formData := url.Values{}
	formData.Set("email", email)

	for _, listId := range listIds {
		formData.Add("l", listId)
	}

	resp, err := http.Post(
		os.Getenv("LISTMONK_INTERNAL_URL")+"/subscription/form",
		"application/x-www-form-urlencoded",
		strings.NewReader(formData.Encode()),
	)

	if err != nil {
		return eb.Public("Could not subscribe to newsletter.").Wrap(err)
	}

	defer resp.Body.Close()

	return nil
}
