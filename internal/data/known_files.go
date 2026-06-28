package data

import (
	"bytes"
	"embed"
	"encoding/gob"
	"strings"
	"sync"

	log "github.com/sirupsen/logrus"
)

//go:embed datasets/data.gob
var datasetsFS embed.FS

// gobEntry mirrors the RawEntry struct used by the serialize_dataset script.
// Only FileName is needed for file-name lookups; hash fields are kept for
// future hash-based enrichment (sha1.gob, sha256.gob, md5.gob).
type gobEntry struct {
	FileName  string
	FilePaths []string
	MD5s      []string
	SHA1s     []string
	SHA256s   []string
}

var (
	knownFilesOnce sync.Once

	// knownFileNames is a set of normalised (lower-case) file names that are
	// considered legitimate OS / vendor binaries.
	knownFileNames map[string]struct{}

	// knownKeys is the full set of map keys from the embedded dataset.
	// It includes filenames, file paths, and hash values so any of them
	// can be looked up.
	knownKeys map[string]struct{}
)

func loadKnownFiles() {
	knownFileNames = make(map[string]struct{})
	knownKeys = make(map[string]struct{})

	gobFiles := []string{
		"datasets/data.gob",
	}

	for _, path := range gobFiles {
		raw, err := datasetsFS.ReadFile(path)
		if err != nil {
			log.WithError(err).Errorf("Failed to read embedded dataset %s", path)
			continue
		}

		var entries map[string]gobEntry
		if err := gob.NewDecoder(bytes.NewReader(raw)).Decode(&entries); err != nil {
			log.WithError(err).Errorf("Failed to decode embedded dataset %s", path)
			continue
		}

		for key, entry := range entries {
			lower := strings.ToLower(key)
			knownKeys[lower] = struct{}{}
			// Also index by filename for backwards-compat IsKnownFile()
			if entry.FileName != "" {
				knownFileNames[strings.ToLower(entry.FileName)] = struct{}{}
			}
		}

		log.Infof("Loaded %d known keys from %s", len(entries), path)
	}
}

// IsKnownFile reports whether the given file name (case-insensitive) appears
// in the embedded known-files datasets (data.gob).
func IsKnownFile(name string) bool {
	knownFilesOnce.Do(loadKnownFiles)
	_, ok := knownFileNames[strings.ToLower(name)]
	return ok
}

// IsKnownHash reports whether the given hash value (case-insensitive) appears
// as a key in the embedded dataset (data.gob).
func IsKnownHash(hash string) bool {
	knownFilesOnce.Do(loadKnownFiles)
	_, ok := knownKeys[strings.ToLower(hash)]
	return ok
}
