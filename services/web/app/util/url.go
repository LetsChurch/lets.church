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

func GetVideoSourceUrl(key string) string {
	return GetPublicMediaUrl(key + "/master.m3u8")
}

func GetAudioSourceUrl(key string) string {
	return GetPublicMediaUrl(key + "/AUDIO.m3u8")
}

func GetPeaksDatUrl(key string) string {
	return GetPublicMediaUrl(key + "/peaks.dat")
}

func GetPeaksJsonUrl(key string) string {
	return GetPublicMediaUrl(key + "/peaks.json")
}
