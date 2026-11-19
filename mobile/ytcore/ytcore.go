// Package ytcore runs ytconv's web interface inside the Android app.
//
// It is built with gomobile bind into an .aar; the app shows the page in a
// WebView and implements Host for what a phone does differently: showing a
// saved file, telling the media scanner about it, and keeping the process
// alive with a notification while downloads run.
package ytcore

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/M0abl1/youtube_converter/pkg/gui"
	"github.com/M0abl1/youtube_converter/pkg/history"
)

// Host is implemented by the Android app (in Kotlin).
type Host interface {
	// Reveal opens a saved file in an app that can play it.
	Reveal(path string) error
	// OpenFolder opens a folder in the file manager.
	OpenFolder(dir string) error
	// Saved is called after a file is saved, so it shows up in the gallery
	// and music apps.
	Saved(path string)
	// ScopedStorage reports whether downloads must be published by the host.
	ScopedStorage() bool
	// Publish copies a complete file to public storage and returns its actual path.
	Publish(stagedPath, dir string, transfer *Transfer) (string, error)
	// FileExists checks public storage in scoped storage mode.
	FileExists(path string) (bool, error)
	// Busy is called with true when a download starts and false when the
	// queue is empty.
	Busy(busy bool)
}

// Transfer lets the host check whether a job was cancelled while publishing.
type Transfer struct{ ctx context.Context }

func (t *Transfer) Cancelled() bool { return t.ctx.Err() != nil }

var (
	mu     sync.Mutex
	url    string
	cancel context.CancelFunc
)

// Start starts the server on a free loopback port and returns the address
// to load, with its token. filesDir holds the history, cacheDir the
// temporary files and outDir is the folder offered for downloads. Calling
// Start again returns the running server's address.
func Start(filesDir, cacheDir, outDir, version string, host Host) (string, error) {
	mu.Lock()
	defer mu.Unlock()
	if url != "" {
		return url, nil
	}
	if host == nil {
		return "", errors.New("ytcore: host is nil")
	}

	// Go's defaults point at directories an app cannot write to.
	tmp := filepath.Join(cacheDir, "tmp")
	if err := os.MkdirAll(tmp, 0o700); err != nil {
		return "", err
	}
	os.Setenv("TMPDIR", tmp)
	os.Setenv("HOME", filesDir)

	cfg := gui.Config{
		Version:     version,
		OutputDir:   outDir,
		TmpDir:      tmp,
		Connections: 8,
		App:         true,
		Reveal:      host.Reveal,
		OpenFolder:  host.OpenFolder,
		OnSaved:     host.Saved,
		OnBusy:      host.Busy,
	}
	if host.ScopedStorage() {
		cfg.Publish = func(ctx context.Context, path, dir string) (string, error) {
			return host.Publish(path, dir, &Transfer{ctx: ctx})
		}
		cfg.FileExists = func(path string) bool {
			exists, err := host.FileExists(path)
			return err == nil && exists
		}
	}
	if h, err := history.Open(filepath.Join(filesDir, "history.json")); err == nil {
		cfg.History = h
	} else {
		fmt.Fprintln(os.Stderr, "ytcore: download history is off:", err)
	}

	s := gui.New(cfg)
	ln, u, err := s.Listen(0)
	if err != nil {
		return "", err
	}
	ctx, stop := context.WithCancel(context.Background())
	go func() {
		s.Serve(ctx, ln)
		mu.Lock()
		url, cancel = "", nil
		mu.Unlock()
	}()
	url, cancel = u, stop
	return url, nil
}

// Stop cancels the downloads and stops the server.
func Stop() {
	mu.Lock()
	c := cancel
	mu.Unlock()
	if c != nil {
		c()
	}
}
