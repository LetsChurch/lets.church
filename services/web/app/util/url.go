package util

import (
	"net/url"
	"os"
)

var MEDIA_URL = os.Getenv("MEDIA_URL")

func GetPublicMediaUrl(key string) string {
	baseUrl, err := url.Parse(MEDIA_URL)
	if err != nil {
		panic(err)
	}
	baseUrl.Path += "/" + key
	return baseUrl.String()
}
