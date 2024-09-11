package util

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

func DownloadFileToReader(url string) (*bytes.Reader, error) {
	// Make the HTTP request
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Check if the status code is OK (200)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to download file: %s", resp.Status)
	}

	// Read the response body into a bytes.Buffer
	var buf bytes.Buffer
	if _, err := io.Copy(&buf, resp.Body); err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Create a bytes.Reader from the buffer
	return bytes.NewReader(buf.Bytes()), nil
}
