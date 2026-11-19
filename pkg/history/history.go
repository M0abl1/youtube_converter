// Package history keeps a local record of the files ytconv saved, so the
// web interface can list what was downloaded, grouped by playlist, and
// where each file went. It is a small JSON file in the user's config
// directory; nothing leaves the computer.
package history

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"sync"
	"time"
)

// MaxEntries caps the file; the oldest entries are dropped first.
const MaxEntries = 5000

// Entry is one saved file.
type Entry struct {
	ID        string    `json:"id"`
	VideoID   string    `json:"videoId"`
	Title     string    `json:"title"`
	Format    string    `json:"format"`            // mp4, mp3, ...
	Quality   string    `json:"quality,omitempty"` // e.g. "1080p H.264, AAC 128 kbps"
	Path      string    `json:"path"`
	Size      int64     `json:"size"`
	SavedAt   time.Time `json:"savedAt"`
	ListID    string    `json:"listId,omitempty"` // playlist the video was downloaded from
	ListTitle string    `json:"listTitle,omitempty"`
}

// Store is a history file. The zero value is not usable; call Open.
type Store struct {
	path    string
	mu      sync.Mutex
	entries []Entry // oldest first
	nextID  int
}

// DefaultPath is <user config dir>/ytconv/history.json.
func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "ytconv", "history.json"), nil
}

// Open loads the history at path. A missing file is an empty history; a
// corrupt one is set aside (renamed to .bak) so new downloads still get
// recorded.
func Open(path string) (*Store, error) {
	s := &Store{path: path}
	b, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return s, nil
	case err != nil:
		return nil, err
	}
	if err := json.Unmarshal(b, &s.entries); err != nil {
		os.Rename(path, path+".bak")
		s.entries = nil
	}
	for _, e := range s.entries {
		if n, err := strconv.Atoi(e.ID); err == nil && n > s.nextID {
			s.nextID = n
		}
	}
	return s, nil
}

// Add records e (its ID and, if unset, SavedAt are filled in) and saves.
func (s *Store) Add(e Entry) (Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	e.ID = strconv.Itoa(s.nextID)
	if e.SavedAt.IsZero() {
		e.SavedAt = time.Now()
	}
	s.entries = append(s.entries, e)
	if over := len(s.entries) - MaxEntries; over > 0 {
		s.entries = slices.Delete(s.entries, 0, over)
	}
	return e, s.saveLocked()
}

// List returns the entries, newest first.
func (s *Store) List() []Entry {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := slices.Clone(s.entries)
	slices.Reverse(out)
	return out
}

// Get returns the entry with id.
func (s *Store) Get(id string) (Entry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := slices.IndexFunc(s.entries, func(e Entry) bool { return e.ID == id })
	if i < 0 {
		return Entry{}, false
	}
	return s.entries[i], true
}

// Remove deletes the entries with the given ids (the files stay on disk).
func (s *Store) Remove(ids ...string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = slices.DeleteFunc(s.entries, func(e Entry) bool { return slices.Contains(ids, e.ID) })
	return s.saveLocked()
}

// Clear deletes every entry (the files stay on disk).
func (s *Store) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = nil
	return s.saveLocked()
}

// saveLocked writes the file atomically: a crash leaves the old or the new
// version, never half of one.
func (s *Store) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s.entries, "", "  ")
	if err != nil {
		return err
	}
	if s.entries == nil {
		b = []byte("[]")
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".history-*.json")
	if err != nil {
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return err
	}
	if err := os.Rename(tmp.Name(), s.path); err != nil {
		os.Remove(tmp.Name())
		return fmt.Errorf("saving history: %w", err)
	}
	return nil
}
