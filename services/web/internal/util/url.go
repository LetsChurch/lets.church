package util

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/samber/lo"
	"github.com/samber/oops"
	"lets.church/internal/data"

	"github.com/subosito/gozaru"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var MEDIA_URL = os.Getenv("MEDIA_URL")
var S3_PUBLIC_REGION = os.Getenv("S3_PUBLIC_REGION")
var S3_PUBLIC_ENDPOINT = os.Getenv("S3_PUBLIC_ENDPOINT")
var S3_PUBLIC_BUCKET = os.Getenv("S3_PUBLIC_BUCKET")
var S3_PUBLIC_ACCESS_KEY_ID = os.Getenv("S3_PUBLIC_ACCESS_KEY_ID")
var S3_PUBLIC_SECRET_ACCESS_KEY = os.Getenv("S3_PUBLIC_SECRET_ACCESS_KEY")
var S3_INGEST_REGION = os.Getenv("S3_INGEST_REGION")
var S3_INGEST_ENDPOINT = os.Getenv("S3_INGEST_ENDPOINT")
var S3_INGEST_BUCKET = os.Getenv("S3_INGEST_BUCKET")
var S3_INGEST_ACCESS_KEY_ID = os.Getenv("S3_INGEST_ACCESS_KEY_ID")
var S3_INGEST_SECRET_ACCESS_KEY = os.Getenv("S3_INGEST_SECRET_ACCESS_KEY")
var IMGPROXY_URL = os.Getenv("IMGPROXY_URL")
var IMGPROXY_KEY = lo.Must(hex.DecodeString(os.Getenv("IMGPROXY_KEY")))
var IMGPROXY_SALT = lo.Must(hex.DecodeString(os.Getenv("IMGPROXY_SALT")))

func GetPublicMediaUrl(key string) string {
	baseUrl, err := url.Parse(MEDIA_URL)
	if err != nil {
		panic(err)
	}
	baseUrl.Path += "/" + key
	return baseUrl.String()
}

func GetPublicUrlWithFilename(ctx context.Context, key string, filename string) (string, error) {
	eb := oops.In("GetPublicUrlWithFilename")
	cfg, err := config.LoadDefaultConfig(
		ctx,
		config.WithRegion(S3_PUBLIC_REGION),
		config.WithBaseEndpoint(S3_PUBLIC_ENDPOINT),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			S3_PUBLIC_ACCESS_KEY_ID,
			S3_PUBLIC_SECRET_ACCESS_KEY,
			"",
		)),
	)
	if err != nil {
		return "", eb.Wrap(err)
	}

	s3Client := s3.NewFromConfig(cfg)
	presignClient := s3.NewPresignClient(s3Client)
	sanitizedFilename := gozaru.Sanitize(filename)

	getObjectInput := &s3.GetObjectInput{
		Bucket:                     aws.String(S3_PUBLIC_BUCKET),
		Key:                        aws.String(key),
		ResponseContentDisposition: aws.String(fmt.Sprintf(`attachment; filename="%s"`, sanitizedFilename)),
	}

	presignedURL, err := presignClient.PresignGetObject(ctx, getObjectInput)
	if err != nil {
		return "", eb.Wrap(err)
	}

	return presignedURL.URL, nil
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

type DownloadMeta struct {
	Icon  string
	Label string
	Url   string
}

func GetMediaDownloadUrls(ctx context.Context, udr *data.UploadDataRow) ([]DownloadMeta, error) {
	if !udr.DownloadsEnabled {
		return nil, nil
	}

	eb := oops.In("GetMediaDownloadUrls")

	filteredVariants := lo.Filter(udr.Variants, func(variant data.UploadVariant, i int) bool {
		// TODO: remove 360P
		return strings.HasSuffix(string(variant), "_DOWNLOAD") && !strings.Contains(string(variant), "360P")
	})

	downloadVariants := make([]DownloadMeta, len(filteredVariants))

	for i, variant := range filteredVariants {
		canonical := Uuid(udr.ID.Bytes).Canonical()
		ext := lo.Ternary(strings.HasPrefix(string(variant), "VIDEO"), "mp4", "m4a")

		publicUrl, err := GetPublicUrlWithFilename(
			ctx,
			fmt.Sprintf("%s/%s.%s", canonical, variant, ext),
			fmt.Sprintf("%s.%s", udr.Title.String, ext),
		)

		if err != nil {
			return nil, eb.Wrap(err)
		}

		downloadVariants[i] = DownloadMeta{
			Icon: strings.TrimSuffix(string(variant), "_DOWNLOAD"),
			Label: lo.Switch[data.UploadVariant, string](variant).
				Case(data.UploadVariantVIDEO4KDOWNLOAD, "4k Video").
				Case(data.UploadVariantVIDEO1080PDOWNLOAD, "1080p Video").
				Case(data.UploadVariantVIDEO720PDOWNLOAD, "720p Video").
				Case(data.UploadVariantVIDEO480PDOWNLOAD, "480p Video").
				Default("Audio"),
			Url: publicUrl,
		}
	}

	return downloadVariants, nil
}

func GetTranscriptDownloadUrls(ctx context.Context, udr *data.UploadDataRow) ([]DownloadMeta, error) {
	eb := oops.In("GetTranscriptDownloadUrls")
	if !udr.DownloadsEnabled {
		return nil, nil
	}

	vttUrl, err := GetPublicUrlWithFilename(
		ctx,
		Uuid(udr.ID.Bytes).Canonical()+"/transcript.vtt",
		udr.Title.String+".vtt",
	)
	if err != nil {
		return nil, eb.Wrap(err)
	}

	txtUrl, err := GetPublicUrlWithFilename(
		ctx,
		Uuid(udr.ID.Bytes).Canonical()+"transcript.original.txt",
		udr.Title.String+".txt",
	)
	if err != nil {
		return nil, eb.Wrap(err)
	}

	return []DownloadMeta{
		{
			Icon:  "badge-cc",
			Label: "Transcript (vtt)",
			Url:   vttUrl,
		},
		{
			Icon:  "file-description",
			Label: "Transcript (txt)",
			Url:   txtUrl,
		},
	}, nil
}

func GetS3ProtocolUri(from string, key string) string {
	return fmt.Sprintf("s3://%s/%s", lo.Ternary(from == "PUBLIC", S3_PUBLIC_BUCKET, S3_INGEST_BUCKET), key)
}

type PublicImageConfigurator func(w io.Writer) error

func PublicImage(key string, ops ...PublicImageConfigurator) string {
	pathBuilder := strings.Builder{}
	hashBuilder := hmac.New(sha256.New, IMGPROXY_KEY)

	hashBuilder.Write(IMGPROXY_SALT)

	w := io.MultiWriter(&pathBuilder, hashBuilder)

	for _, op := range ops {
		if err := op(w); err != nil {
			panic(err)
		}
	}

	w.Write([]byte("/"))
	w.Write([]byte(imgproxyBase64([]byte(GetS3ProtocolUri("PUBLIC", key)))))
	path := pathBuilder.String()
	sig := imgproxyBase64(hashBuilder.Sum(nil))
	return IMGPROXY_URL + "/" + sig + path
}

func PiWidth(width int) PublicImageConfigurator {
	return func(w io.Writer) error {
		w.Write([]byte("/w:"))
		w.Write([]byte(strconv.Itoa(width)))
		return nil
	}
}

func PiHeight(height int) PublicImageConfigurator {
	return func(w io.Writer) error {
		w.Write([]byte("/h:"))
		w.Write([]byte(strconv.Itoa(height)))
		return nil
	}
}

func imgproxyBase64(data []byte) string {
	str := base64.StdEncoding.EncodeToString(data)
	str = strings.ReplaceAll(str, "=", "")
	str = strings.ReplaceAll(str, "+", "-")
	str = strings.ReplaceAll(str, "/", "_")
	return str
}
