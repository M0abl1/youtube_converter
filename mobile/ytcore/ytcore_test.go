package ytcore

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

type fakeHost struct{}

func (fakeHost) Reveal(string) error             { return nil }
func (fakeHost) OpenFolder(string) error         { return nil }
func (fakeHost) Saved(string)                    {}
func (fakeHost) Busy(bool)                       {}
func (fakeHost) ScopedStorage() bool             { return false }
func (fakeHost) FileExists(string) (bool, error) { return false, nil }
func (fakeHost) Publish(string, string, *Transfer) (string, error) {
	panic("publishing requires scoped storage")
}

func TestStartStop(t *testing.T) {
	u, err := Start(t.TempDir(), t.TempDir(), t.TempDir(), "test", fakeHost{})
	if err != nil {
		t.Fatal(err)
	}
	if again, _ := Start(t.TempDir(), t.TempDir(), t.TempDir(), "test", fakeHost{}); again != u {
		t.Errorf("second Start: %q, want %q", again, u)
	}
	if !strings.HasPrefix(u, "http://127.0.0.1:") || !strings.Contains(u, "token=") {
		t.Fatalf("url: %q", u)
	}
	res, err := http.Get(u)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("page: %d", res.StatusCode)
	}
	Stop()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := http.Get(u); err != nil {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Error("server still running after Stop")
}
