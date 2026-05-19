package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v4/jwa"
	"github.com/lestrrat-go/jwx/v4/jwt"
)

var (
	safeSegment    = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	unsafeFilename = regexp.MustCompile(`[\x00-\x1f\x7f"\\;]`)
)

func parsePath(path string) (uploadId, variant string, ok bool) {
	parts := strings.SplitN(strings.TrimPrefix(path, "/"), "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	if !safeSegment.MatchString(parts[0]) || !safeSegment.MatchString(parts[1]) {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func buildFfmpegArgs(mediaURL, uploadId, variant string) []string {
	return []string{
		"-hide_banner",
		"-protocol_whitelist", "file,crypto,data,http,https,tcp,tls",
		"-allowed_extensions", "m3u8,m4s,mp4",
		"-i", fmt.Sprintf("%s/%s/%s.m3u8", mediaURL, uploadId, variant),
		"-c", "copy",
		"-movflags", "frag_keyframe+default_base_moof",
		"-f", "mp4",
		"pipe:1",
	}
}

type authResult struct {
	uploadId string
	variant  string
	filename string
}

func authenticate(r *http.Request, jwtSecret []byte) (*authResult, int, string) {
	uploadId, variant, ok := parsePath(r.URL.Path)
	if !ok {
		return nil, http.StatusBadRequest, "invalid path: expected /{uploadId}/{variant}"
	}

	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		return nil, http.StatusBadRequest, "missing token"
	}

	token, err := jwt.ParseString(tokenStr, jwt.WithKey(jwa.HS256(), jwtSecret), jwt.WithValidate(true))
	if err != nil {
		return nil, http.StatusUnauthorized, "invalid token"
	}

	claimUploadId, err := jwt.Get[string](token, "uploadId")
	if err != nil || claimUploadId != uploadId {
		return nil, http.StatusUnauthorized, "invalid token"
	}

	claimVariant, err := jwt.Get[string](token, "variant")
	if err != nil || claimVariant != variant {
		return nil, http.StatusUnauthorized, "invalid token"
	}

	filename, err := jwt.Get[string](token, "filename")
	if err != nil || filename == "" {
		return nil, http.StatusUnauthorized, "invalid token"
	}

	return &authResult{uploadId: uploadId, variant: variant, filename: filename}, http.StatusOK, ""
}

func sanitizeFilename(filename string) string {
	return unsafeFilename.ReplaceAllString(filename, "_")
}

func main() {
	mediaURL := mustEnv("MEDIA_URL")
	jwtSecret := []byte(mustEnv("JWT_SECRET"))
	addr := envOrDefault("ADDR", ":8080")

	mediaURL = strings.TrimRight(mediaURL, "/")

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		auth, statusCode, msg := authenticate(r, jwtSecret)
		if auth == nil {
			http.Error(w, msg, statusCode)
			return
		}

		uploadId, variant, filename := auth.uploadId, auth.variant, auth.filename

		isAudio := variant == "AUDIO"
		args := buildFfmpegArgs(mediaURL, uploadId, variant)

		contentType := "video/mp4"
		if isAudio {
			contentType = "audio/mp4"
		}

		filename = sanitizeFilename(filename)

		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Hour)
		defer cancel()

		pr, pw := io.Pipe()
		defer pr.Close()
		cmd := exec.CommandContext(ctx, "ffmpeg", args...)
		cmd.Stdout = pw
		cmd.Stderr = os.Stderr

		log.Printf("%s /%s/%s → ffmpeg %s", r.Method, uploadId, variant, strings.Join(args, " "))
		if err := cmd.Start(); err != nil {
			pw.Close()
			http.Error(w, "failed to start ffmpeg", http.StatusInternalServerError)
			log.Printf("ffmpeg start error: %v", err)
			return
		}

		w.Header().Set("Content-Type", contentType)
		encoded := url.PathEscape(filename)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, filename, encoded))

		go func() {
			if err := cmd.Wait(); err != nil {
				pw.CloseWithError(err)
			} else {
				pw.Close()
			}
		}()

		if _, err := io.Copy(w, pr); err != nil {
			log.Printf("copy error: %v", err)
			if killErr := cmd.Process.Kill(); killErr != nil {
				log.Printf("ffmpeg kill error: %v", killErr)
			}
		}
	})

	log.Printf("download service listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required environment variable %s is not set", key)
	}
	return v
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
