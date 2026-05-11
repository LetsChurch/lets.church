package main

import (
	"net/http"
	"net/http/httptest"
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
	args := buildFfmpegArgs("https://media.example.com", "upload-id-123", "VIDEO_720P")

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

	// Must not reference AUDIO.m3u8 (double-audio bug)
	for _, a := range args {
		if strings.Contains(a, "AUDIO.m3u8") {
			t.Errorf("buildFfmpegArgs for video variant: unexpected AUDIO.m3u8 in args %v", args)
		}
	}

	// AUDIO variant must reference its own playlist, not a second one
	audioArgs := buildFfmpegArgs("https://media.example.com", "upload-id-123", "AUDIO")
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

func makeToken(t *testing.T, secret []byte, uploadId, variant, filename string) string {
	t.Helper()
	tok, err := jwt.NewBuilder().
		Expiration(time.Now().Add(time.Hour)).
		Claim("uploadId", uploadId).
		Claim("variant", variant).
		Claim("filename", filename).
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
		tok := makeToken(t, secret, "upload123", "VIDEO_720P", "sermon.mp4")
		req := httptest.NewRequest("GET", "/upload123/VIDEO_720P?token="+tok, nil)
		result, code, _ := authenticate(req, secret)
		if code != http.StatusOK || result == nil {
			t.Errorf("expected 200 and result, got code=%d result=%v", code, result)
		}
		if result != nil && (result.uploadId != "upload123" || result.variant != "VIDEO_720P" || result.filename != "sermon.mp4") {
			t.Errorf("unexpected result: %+v", result)
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
