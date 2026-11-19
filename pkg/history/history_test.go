package history

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStore(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "history.json")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.List()) != 0 {
		t.Fatal("new store not empty")
	}
	a, err := s.Add(Entry{VideoID: "a", Title: "A", Format: "mp4", Path: "/x/a.mp4"})
	if err != nil {
		t.Fatal(err)
	}
	b, _ := s.Add(Entry{VideoID: "b", Title: "B", Format: "mp3", ListID: "PL1", ListTitle: "List"})
	if a.ID == b.ID || a.SavedAt.IsZero() {
		t.Errorf("ids/time: %+v %+v", a, b)
	}
	if l := s.List(); len(l) != 2 || l[0].ID != b.ID {
		t.Errorf("List not newest first: %+v", l)
	}

	// Reopen: entries and id counter survive.
	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if l := s2.List(); len(l) != 2 || l[0].ListTitle != "List" {
		t.Errorf("reloaded: %+v", l)
	}
	c, _ := s2.Add(Entry{VideoID: "c"})
	if c.ID == a.ID || c.ID == b.ID {
		t.Errorf("reused id %s", c.ID)
	}
	if e, ok := s2.Get(a.ID); !ok || e.Title != "A" {
		t.Errorf("Get: %+v %v", e, ok)
	}

	if err := s2.Remove(a.ID, c.ID); err != nil {
		t.Fatal(err)
	}
	if l := s2.List(); len(l) != 1 || l[0].ID != b.ID {
		t.Errorf("after remove: %+v", l)
	}
	if err := s2.Clear(); err != nil {
		t.Fatal(err)
	}
	s3, _ := Open(path)
	if len(s3.List()) != 0 {
		t.Error("clear not saved")
	}
}

func TestCorruptFileIsSetAside(t *testing.T) {
	path := filepath.Join(t.TempDir(), "history.json")
	os.WriteFile(path, []byte("{not json"), 0o644)
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Add(Entry{VideoID: "a"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path + ".bak"); err != nil {
		t.Error("corrupt file not kept as .bak")
	}
}

func TestCap(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "h.json"))
	for i := 0; i < MaxEntries+3; i++ {
		s.entries = append(s.entries, Entry{ID: "x"})
	}
	s.Add(Entry{VideoID: "last"})
	if l := s.List(); len(l) != MaxEntries || l[0].VideoID != "last" {
		t.Errorf("cap: %d entries, newest %q", len(l), l[0].VideoID)
	}
}
