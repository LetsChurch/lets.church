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

type videoAudioSource int

const (
	videoAudioNone videoAudioSource = iota
	videoAudioEmbedded
	videoAudioSeparate
)

func appendHLSInput(args []string, playlistURL string) []string {
	return append(args,
		"-protocol_whitelist", "file,crypto,data,http,https,tcp,tls",
		"-allowed_extensions", "m3u8,m4s,mp4",
		"-i", playlistURL,
	)
}

func mediaPlaylistURL(mediaURL, uploadId, variant string) string {
	return fmt.Sprintf("%s/%s/%s.m3u8", mediaURL, uploadId, variant)
}

func buildFfmpegArgs(mediaURL, uploadId, variant string, videoAudio videoAudioSource) []string {
	args := appendHLSInput(
		[]string{"-hide_banner"},
		mediaPlaylistURL(mediaURL, uploadId, variant),
	)

	if variant == "AUDIO" {
		// Audio has no video keyframes, so frag_keyframe can leave a streamed
		// MP4 with one unusable fragment. Emit an empty initialization movie and
		// cut fragments by duration so the downloaded m4a contains decodable
		// samples while it is written to a non-seekable HTTP response.
		args = append(args,
			"-map", "0:a:0",
			"-c", "copy",
			"-movflags", "empty_moov+default_base_moof",
			"-frag_duration", "5000000",
		)
	} else {
		if videoAudio == videoAudioSeparate {
			args = appendHLSInput(args, mediaPlaylistURL(mediaURL, uploadId, "AUDIO"))
		}

		args = append(args, "-map", "0:v:0")
		switch videoAudio {
		case videoAudioEmbedded:
			args = append(args, "-map", "0:a:0")
		case videoAudioSeparate:
			args = append(args, "-map", "1:a:0")
		}
		args = append(args,
			"-c", "copy",
			"-movflags", "frag_keyframe+default_base_moof",
		)
	}

	return append(args,
		"-f", "mp4",
		"pipe:1",
	)
}

func playlistHasAudio(ctx context.Context, playlistURL string) (bool, error) {
	args := appendHLSInput(
		[]string{
			"-v", "error",
			"-select_streams", "a:0",
			"-show_entries", "stream=index",
			"-of", "csv=p=0",
		},
		playlistURL,
	)
	out, err := exec.CommandContext(ctx, "ffprobe", args...).Output()
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(string(out)) != "", nil
}

type authResult struct {
	uploadId     string
	variant      string
	filename     string
	includeAudio bool
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

	// Tokens issued before video downloads gained separate-audio support do not
	// have this claim. Keep accepting them as video-only until their 15-minute
	// lifetime expires during a rolling deployment.
	includeAudio, err := jwt.Get[bool](token, "includeAudio")
	if err != nil {
		includeAudio = false
	}

	return &authResult{
		uploadId:     uploadId,
		variant:      variant,
		filename:     filename,
		includeAudio: includeAudio,
	}, http.StatusOK, ""
}

func sanitizeFilename(filename string) string {
	return unsafeFilename.ReplaceAllString(filename, "_")
}

func main() {
	mediaURL := mustEnv("MEDIA_URL")
	jwtSecret := []byte(mustEnv("JWT_SECRET"))
	addr := envOrDefault("ADDR", ":8080")

	mediaURL = strings.TrimRight(mediaURL, "/")

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

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
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Hour)
		defer cancel()

		videoAudio := videoAudioNone
		if !isAudio && auth.includeAudio {
			hasEmbeddedAudio, err := playlistHasAudio(
				ctx,
				mediaPlaylistURL(mediaURL, uploadId, variant),
			)
			if err != nil {
				http.Error(w, "failed to inspect media", http.StatusBadGateway)
				log.Printf("ffprobe error for /%s/%s: %v", uploadId, variant, err)
				return
			}
			if hasEmbeddedAudio {
				videoAudio = videoAudioEmbedded
			} else {
				videoAudio = videoAudioSeparate
			}
		}
		args := buildFfmpegArgs(mediaURL, uploadId, variant, videoAudio)

		contentType := "video/mp4"
		if isAudio {
			contentType = "audio/mp4"
		}

		filename = sanitizeFilename(filename)

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
