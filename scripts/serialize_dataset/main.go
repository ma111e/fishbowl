package main

import (
	"bytes"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type RawEntry struct {
	FileName  string   `json:"file_name"`
	FilePaths []string `json:"file_path"`
	MD5s      []string `json:"hash_md5"`
	SHA1s     []string `json:"hash_sha1"`
	SHA256s   []string `json:"hash_sha256"`
}

func normalize(name string) string {
	return strings.ToLower(name)
}

func stripBOM(b []byte) []byte {
	if len(b) >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF {
		return b[3:]
	}
	return b
}

// toSlice coerces a raw JSON value into a []string.
// Accepts a bare string, an array of strings, or null/missing.
func toSlice(raw json.RawMessage) []string {
	if raw == nil {
		return nil
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	if raw[0] == '"' {
		var s string
		if err := json.Unmarshal(raw, &s); err == nil && s != "" {
			return []string{normalize(s)}
		}
		return nil
	}
	if raw[0] == '[' {
		var ss []string
		if err := json.Unmarshal(raw, &ss); err == nil {
			out := ss[:0]
			for _, s := range ss {
				if s != "" {
					out = append(out, normalize(s))
				}
			}
			return out
		}
	}
	return nil
}

func parseEntry(value json.RawMessage) (RawEntry, bool) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(value, &raw); err != nil {
		return RawEntry{}, false
	}

	var r RawEntry

	if v, ok := raw["file_name"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			r.FileName = s
		}
	}
	if r.FileName == "" {
		return RawEntry{}, false
	}

	r.FilePaths = toSlice(raw["file_path"])
	r.MD5s = toSlice(raw["hash_md5"])
	r.SHA1s = toSlice(raw["hash_sha1"])
	r.SHA256s = toSlice(raw["hash_sha256"])

	return r, true
}

func uniqueStrings(ss []string) []string {
	seen := make(map[string]struct{}, len(ss))
	out := make([]string, 0, len(ss))
	for _, s := range ss {
		if _, dup := seen[s]; !dup {
			seen[s] = struct{}{}
			out = append(out, s)
		}
	}
	return out
}

func mergeEntry(dst *RawEntry, src RawEntry) {
	dst.FilePaths = uniqueStrings(append(dst.FilePaths, src.FilePaths...))
	dst.MD5s = uniqueStrings(append(dst.MD5s, src.MD5s...))
	dst.SHA1s = uniqueStrings(append(dst.SHA1s, src.SHA1s...))
	dst.SHA256s = uniqueStrings(append(dst.SHA256s, src.SHA256s...))
}

func main() {
	fmt.Println("📥 Reading JSON files from 'in' directory...")

	files, err := os.ReadDir("in")
	if err != nil {
		panic(err)
	}

	// Map of normalised filename -> merged entry
	merged := make(map[string]*RawEntry)

	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		input, err := os.ReadFile(filepath.Join("in", file.Name()))
		if err != nil {
			panic(err)
		}
		input = stripBOM(input)

		var fileRaw map[string]json.RawMessage
		if err := json.Unmarshal(input, &fileRaw); err != nil {
			panic(fmt.Sprintf("failed to parse %s: %v", file.Name(), err))
		}

		for key, value := range fileRaw {
			if key == "comment" {
				continue
			}

			entry, ok := parseEntry(value)
			if !ok {
				continue
			}

			name := normalize(entry.FileName)
			if existing, found := merged[name]; found {
				mergeEntry(existing, entry)
			} else {
				e := entry
				merged[name] = &e
			}
		}
	}

	fmt.Print("🔎 Processing merged entries...\n\n")

	fmt.Printf("📊 Total unique files: %d\n", len(merged))

	// Build keyed map: every value (filename, file_path, hash) becomes its
	// own key pointing to the corresponding entry.
	keyed := make(map[string]RawEntry)
	for _, e := range merged {
		entry := *e

		// Key by normalized filename
		keyed[normalize(entry.FileName)] = entry

		// Key by each file path
		for _, v := range entry.FilePaths {
			keyed[v] = entry
		}

		// Key by each MD5
		for _, v := range entry.MD5s {
			keyed[v] = entry
		}

		// Key by each SHA1
		for _, v := range entry.SHA1s {
			keyed[v] = entry
		}

		// Key by each SHA256
		for _, v := range entry.SHA256s {
			keyed[v] = entry
		}
	}

	fmt.Printf("📊 Total keys in output map: %d\n\n", len(keyed))

	if err := os.MkdirAll("out", 0o755); err != nil {
		panic(err)
	}

	outPath := filepath.Join("out", "merged.gob")
	f, err := os.Create(outPath)
	if err != nil {
		panic(err)
	}
	defer func() { _ = f.Close() }()

	if err := gob.NewEncoder(f).Encode(keyed); err != nil {
		panic(err)
	}

	fmt.Printf("✅ Gob-encoded merged result written to %s (%d keys)\n", outPath, len(keyed))
}
