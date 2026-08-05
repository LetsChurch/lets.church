package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/lestrrat-go/jwx/v4/jwa"
	"github.com/lestrrat-go/jwx/v4/jwt"
)

func TestParsePath(t *testing.T) {
	tests := []struct {
		path     string
		uploadId string
		variant  string
		ok       bool
	}{
		{"/abc123/VIDEO_720P", "abc123", "VIDEO_720P", true},
		{"/abc123/AUDIO", "abc123", "AUDIO", true},
		{"abc123/VIDEO_720P", "abc123", "VIDEO_720P", true},                                                              // no leading slash
		{"/550e8400-e29b-41d4-a716-446655440000/VIDEO_720P", "550e8400-e29b-41d4-a716-446655440000", "VIDEO_720P", true}, // UUID uploadId
		{"/abc123", "", "", false},                                                                                       // missing variant
		{"/", "", "", false},
		{"", "", "", false},
		{"//", "", "", false},
		{"/abc 123/VIDEO_720P", "", "", false}, // space in uploadId
		{"/abc123/bad variant", "", "", false}, // space in variant
		{"/../../etc/passwd", "", "", false},   // path traversal
		{"/../etc/passwd", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			uploadId, variant, ok := parsePath(tt.path)
			if ok != tt.ok {
				t.Errorf("parsePath(%q) ok=%v, want %v", tt.path, ok, tt.ok)
			}
			if uploadId != tt.uploadId {
				t.Errorf("parsePath(%q) uploadId=%q, want %q", tt.path, uploadId, tt.uploadId)
			}
			if variant != tt.variant {
				t.Errorf("parsePath(%q) variant=%q, want %q", tt.path, variant, tt.variant)
			}
		})
	}
}

func TestBuildFfmpegArgs(t *testing.T) {
	args := buildFfmpegArgs(
		"https://media.example.com",
		"upload-id-123",
		"VIDEO_720P",
		videoAudioEmbedded,
	)

	// Must reference the correct playlist URL
	wantURL := "https://media.example.com/upload-id-123/VIDEO_720P.m3u8"
	found := false
	for _, a := range args {
		if a == wantURL {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("buildFfmpegArgs: expected URL %q in args %v", wantURL, args)
	}

	// Must include protocol_whitelist for HTTPS segments
	foundWhitelist := false
	for _, a := range args {
		if strings.Contains(a, "https") {
			foundWhitelist = true
			break
		}
	}
	if !foundWhitelist {
		t.Errorf("buildFfmpegArgs: expected protocol_whitelist containing https in args %v", args)
	}

	// Legacy video variants already contain audio and must not add a second copy.
	for _, a := range args {
		if strings.Contains(a, "AUDIO.m3u8") {
			t.Errorf("buildFfmpegArgs for video variant: unexpected AUDIO.m3u8 in args %v", args)
		}
	}
	for _, want := range []string{"0:v:0", "0:a:0"} {
		if !containsArg(args, want) {
			t.Errorf("buildFfmpegArgs embedded video audio: expected %q in args %v", want, args)
		}
	}

	// Current video variants contain video only and must mux the shared audio
	// rendition into the download as input 1.
	separateAudioArgs := buildFfmpegArgs(
		"https://media.example.com",
		"upload-id-123",
		"VIDEO_720P",
		videoAudioSeparate,
	)
	for _, want := range []string{
		"https://media.example.com/upload-id-123/AUDIO.m3u8",
		"0:v:0",
		"1:a:0",
	} {
		if !containsArg(separateAudioArgs, want) {
			t.Errorf("buildFfmpegArgs separate video audio: expected %q in args %v", want, separateAudioArgs)
		}
	}

	// AUDIO variant must reference its own playlist, not a second one
	audioArgs := buildFfmpegArgs(
		"https://media.example.com",
		"upload-id-123",
		"AUDIO",
		videoAudioNone,
	)
	wantAudioURL := "https://media.example.com/upload-id-123/AUDIO.m3u8"
	found = false
	for _, a := range audioArgs {
		if a == wantAudioURL {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("buildFfmpegArgs AUDIO: expected URL %q in args %v", wantAudioURL, audioArgs)
	}
	for _, want := range []string{"-map", "0:a:0", "empty_moov+default_base_moof", "-frag_duration", "5000000"} {
		if !containsArg(audioArgs, want) {
			t.Errorf("buildFfmpegArgs AUDIO: expected %q in args %v", want, audioArgs)
		}
	}
	if containsArg(audioArgs, "frag_keyframe+default_base_moof") {
		t.Errorf("buildFfmpegArgs AUDIO: keyframe fragmentation does not work for audio-only output: %v", audioArgs)
	}

	// Exactly one -i flag for both video and audio variants
	for _, args := range [][]string{args, audioArgs} {
		count := 0
		for _, a := range args {
			if a == "-i" {
				count++
			}
		}
		if count != 1 {
			t.Errorf("buildFfmpegArgs: expected exactly 1 -i flag, got %d in %v", count, args)
		}
	}
	inputCount := 0
	for _, arg := range separateAudioArgs {
		if arg == "-i" {
			inputCount++
		}
	}
	if inputCount != 2 {
		t.Errorf("buildFfmpegArgs separate video audio: expected 2 inputs, got %d in %v", inputCount, separateAudioArgs)
	}
}

func containsArg(args []string, want string) bool {
	for _, arg := range args {
		if arg == want {
			return true
		}
	}
	return false
}

func TestAudioFfmpegArgsProduceDecodableAudio(t *testing.T) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is not installed")
	}

	mediaRoot := t.TempDir()
	uploadID := "upload-id-123"
	uploadDir := filepath.Join(mediaRoot, uploadID)
	if err := os.Mkdir(uploadDir, 0o755); err != nil {
		t.Fatalf("create upload directory: %v", err)
	}

	playlistPath := filepath.Join(uploadDir, "AUDIO.m3u8")
	generate := exec.Command(
		ffmpegPath,
		"-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "sine=frequency=1000:duration=1",
		"-c:a", "aac",
		"-f", "hls",
		"-hls_segment_type", "fmp4",
		"-hls_time", "0.25",
		"-hls_playlist_type", "vod",
		playlistPath,
	)
	if output, err := generate.CombinedOutput(); err != nil {
		t.Fatalf("generate audio HLS fixture: %v\n%s", err, output)
	}

	download := exec.Command(
		ffmpegPath,
		buildFfmpegArgs(mediaRoot, uploadID, "AUDIO", videoAudioNone)...,
	)
	var container bytes.Buffer
	var downloadStderr bytes.Buffer
	download.Stdout = &container
	download.Stderr = &downloadStderr
	if err := download.Run(); err != nil {
		t.Fatalf("remux audio download: %v\n%s", err, downloadStderr.String())
	}

	decode := exec.Command(
		ffmpegPath,
		"-hide_banner", "-loglevel", "error",
		"-i", "pipe:0",
		"-map", "0:a:0",
		"-f", "s16le",
		"pipe:1",
	)
	decode.Stdin = bytes.NewReader(container.Bytes())
	var samples bytes.Buffer
	var decodeStderr bytes.Buffer
	decode.Stdout = &samples
	decode.Stderr = &decodeStderr
	if err := decode.Run(); err != nil {
		t.Fatalf("decode downloaded audio: %v\n%s", err, decodeStderr.String())
	}
	if samples.Len() == 0 {
		t.Fatalf("downloaded audio decoded successfully but contained no samples\n%s", decodeStderr.String())
	}
}

func TestVideoFfmpegArgsMuxSeparateAudio(t *testing.T) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is not installed")
	}

	mediaRoot := t.TempDir()
	uploadID := "upload-id-123"
	uploadDir := filepath.Join(mediaRoot, uploadID)
	if err := os.Mkdir(uploadDir, 0o755); err != nil {
		t.Fatalf("create upload directory: %v", err)
	}

	audioPlaylist := filepath.Join(uploadDir, "AUDIO.m3u8")
	generateAudio := exec.Command(
		ffmpegPath,
		"-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "sine=frequency=1000:duration=1",
		"-c:a", "aac",
		"-f", "hls",
		"-hls_segment_type", "fmp4",
		"-hls_time", "0.25",
		"-hls_playlist_type", "vod",
		"-hls_fmp4_init_filename", "AUDIO_init.mp4",
		"-hls_segment_filename", filepath.Join(uploadDir, "AUDIO_%04d.m4s"),
		audioPlaylist,
	)
	if output, err := generateAudio.CombinedOutput(); err != nil {
		t.Fatalf("generate audio HLS fixture: %v\n%s", err, output)
	}

	videoPlaylist := filepath.Join(uploadDir, "VIDEO_720P.m3u8")
	generateVideo := exec.Command(
		ffmpegPath,
		"-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc2=size=160x90:rate=10:duration=1",
		"-an",
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		"-g", "10",
		"-sc_threshold", "0",
		"-f", "hls",
		"-hls_segment_type", "fmp4",
		"-hls_time", "0.25",
		"-hls_playlist_type", "vod",
		"-hls_fmp4_init_filename", "VIDEO_720P_init.mp4",
		"-hls_segment_filename", filepath.Join(uploadDir, "VIDEO_720P_%04d.m4s"),
		videoPlaylist,
	)
	if output, err := generateVideo.CombinedOutput(); err != nil {
		t.Fatalf("generate video HLS fixture: %v\n%s", err, output)
	}

	hasEmbeddedAudio, err := playlistHasAudio(context.Background(), videoPlaylist)
	if err != nil {
		t.Fatalf("probe video HLS fixture: %v", err)
	}
	if hasEmbeddedAudio {
		t.Fatal("video-only HLS fixture unexpectedly contains embedded audio")
	}

	download := exec.Command(
		ffmpegPath,
		buildFfmpegArgs(mediaRoot, uploadID, "VIDEO_720P", videoAudioSeparate)...,
	)
	var container bytes.Buffer
	var downloadStderr bytes.Buffer
	download.Stdout = &container
	download.Stderr = &downloadStderr
	if err := download.Run(); err != nil {
		t.Fatalf("remux video download: %v\n%s", err, downloadStderr.String())
	}

	for _, stream := range []struct {
		name       string
		mapArg     string
		outputArgs []string
	}{
		{name: "video", mapArg: "0:v:0", outputArgs: []string{"-frames:v", "1", "-f", "rawvideo"}},
		{name: "audio", mapArg: "0:a:0", outputArgs: []string{"-f", "s16le"}},
	} {
		t.Run(stream.name, func(t *testing.T) {
			args := []string{
				"-hide_banner", "-loglevel", "error",
				"-i", "pipe:0",
				"-map", stream.mapArg,
			}
			args = append(args, stream.outputArgs...)
			args = append(args, "pipe:1")
			decode := exec.Command(ffmpegPath, args...)
			decode.Stdin = bytes.NewReader(container.Bytes())
			var decoded bytes.Buffer
			var decodeStderr bytes.Buffer
			decode.Stdout = &decoded
			decode.Stderr = &decodeStderr
			if err := decode.Run(); err != nil {
				t.Fatalf("decode %s track: %v\n%s", stream.name, err, decodeStderr.String())
			}
			if decoded.Len() == 0 {
				t.Fatalf("downloaded video contained no decodable %s data\n%s", stream.name, decodeStderr.String())
			}
		})
	}
}

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"sermon.mp4", "sermon.mp4"},
		{"my sermon (2024).mp4", "my sermon (2024).mp4"},
		{"file\x00name.mp4", "file_name.mp4"},
		{`file"name.mp4`, "file_name.mp4"},
		{`file\name.mp4`, "file_name.mp4"},
		{"file\x1fname.mp4", "file_name.mp4"},
		{"file\x7fname.mp4", "file_name.mp4"},
		{"normal-file_123.mp4", "normal-file_123.mp4"},
		{"file;name.mp4", "file_name.mp4"},
		{"a;b;c.mp4", "a_b_c.mp4"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := sanitizeFilename(tt.input)
			if got != tt.want {
				t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func makeToken(t *testing.T, secret []byte, uploadId, variant, filename string, includeAudio ...bool) string {
	t.Helper()
	hasAudio := len(includeAudio) > 0 && includeAudio[0]
	tok, err := jwt.NewBuilder().
		Expiration(time.Now().Add(time.Hour)).
		Claim("uploadId", uploadId).
		Claim("variant", variant).
		Claim("filename", filename).
		Claim("includeAudio", hasAudio).
		Build()
	if err != nil {
		t.Fatalf("build token: %v", err)
	}
	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.HS256(), secret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return string(signed)
}

func makeExpiredToken(t *testing.T, secret []byte, uploadId, variant, filename string) string {
	t.Helper()
	tok, err := jwt.NewBuilder().
		Expiration(time.Now().Add(-time.Second)).
		Claim("uploadId", uploadId).
		Claim("variant", variant).
		Claim("filename", filename).
		Build()
	if err != nil {
		t.Fatalf("build expired token: %v", err)
	}
	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.HS256(), secret))
	if err != nil {
		t.Fatalf("sign expired token: %v", err)
	}
	return string(signed)
}

func TestAuthenticate(t *testing.T) {
	secret := []byte("test-secret")

	t.Run("valid token", func(t *testing.T) {
		tok := makeToken(t, secret, "upload123", "VIDEO_720P", "sermon.mp4", true)
		req := httptest.NewRequest("GET", "/upload123/VIDEO_720P?token="+tok, nil)
		result, code, _ := authenticate(req, secret)
		if code != http.StatusOK || result == nil {
			t.Errorf("expected 200 and result, got code=%d result=%v", code, result)
		}
		if result != nil && (result.uploadId != "upload123" || result.variant != "VIDEO_720P" || result.filename != "sermon.mp4" || !result.includeAudio) {
			t.Errorf("unexpected result: %+v", result)
		}
	})

	t.Run("legacy token without audio claim", func(t *testing.T) {
		tok, err := jwt.NewBuilder().
			Expiration(time.Now().Add(time.Hour)).
			Claim("uploadId", "upload123").
			Claim("variant", "VIDEO_720P").
			Claim("filename", "sermon.mp4").
			Build()
		if err != nil {
			t.Fatalf("build token: %v", err)
		}
		signed, err := jwt.Sign(tok, jwt.WithKey(jwa.HS256(), secret))
		if err != nil {
			t.Fatalf("sign token: %v", err)
		}
		req := httptest.NewRequest("GET", "/upload123/VIDEO_720P?token="+string(signed), nil)
		result, code, _ := authenticate(req, secret)
		if code != http.StatusOK || result == nil {
			t.Fatalf("expected legacy token to remain valid, got code=%d result=%v", code, result)
		}
		if result.includeAudio {
			t.Errorf("legacy token unexpectedly enabled audio: %+v", result)
		}
	})

	t.Run("missing token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/upload123/VIDEO_720P", nil)
		_, code, _ := authenticate(req, secret)
		if code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", code)
		}
	})

	t.Run("invalid token signature", func(t *testing.T) {
		tok := makeToken(t, []byte("wrong-secret"), "upload123", "VIDEO_720P", "sermon.mp4")
		req := httptest.NewRequest("GET", "/upload123/VIDEO_720P?token="+tok, nil)
		_, code, _ := authenticate(req, secret)
		if code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", code)
		}
	})

	t.Run("expired token", func(t *testing.T) {
		tok := makeExpiredToken(t, secret, "upload123", "VIDEO_720P", "sermon.mp4")
		req := httptest.NewRequest("GET", "/upload123/VIDEO_720P?token="+tok, nil)
		_, code, _ := authenticate(req, secret)
		if code != http.StatusUnauthorized {
			t.Errorf("expected 401 for expired token, got %d", code)
		}
	})

	t.Run("uploadId mismatch", func(t *testing.T) {
		tok := makeToken(t, secret, "other-upload", "VIDEO_720P", "sermon.mp4")
		req := httptest.NewRequest("GET", "/upload123/VIDEO_720P?token="+tok, nil)
		_, code, _ := authenticate(req, secret)
		if code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", code)
		}
	})

	t.Run("variant mismatch", func(t *testing.T) {
		tok := makeToken(t, secret, "upload123", "AUDIO", "sermon.mp4")
		req := httptest.NewRequest("GET", "/upload123/VIDEO_720P?token="+tok, nil)
		_, code, _ := authenticate(req, secret)
		if code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", code)
		}
	})
}

func TestHandlerMethodNotAllowed(t *testing.T) {
	secret := []byte("test-secret")
	// Use a minimal handler that mirrors the production method check + auth flow.
	// The method gate fires before auth, so no valid token is needed.
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		auth, code, msg := authenticate(r, secret)
		if auth == nil {
			http.Error(w, msg, code)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	for _, method := range []string{"POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"} {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/upload123/VIDEO_720P", nil)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != http.StatusMethodNotAllowed {
				t.Errorf("%s: expected 405, got %d", method, rr.Code)
			}
		})
	}
}
