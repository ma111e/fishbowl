package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type RawEntry struct {
	FileName string `json:"file_name"`
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

func main() {
	fmt.Println("📥 Reading JSON files from 'in' directory...")

	files, err := os.ReadDir("in")
	if err != nil {
		panic(err)
	}

	// Map to count occurrences of each filename
	counts := make(map[string]int)

	totalEntries := 0

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
			panic(err)
		}

		for key, value := range fileRaw {
			if key == "comment" {
				continue
			}

			var r RawEntry
			if err := json.Unmarshal(value, &r); err != nil {
				continue
			}

			if r.FileName == "" {
				continue
			}

			name := normalize(r.FileName)
			counts[name]++
			totalEntries++
		}
	}

	fmt.Printf("📊 Total valid entries processed: %d\n", totalEntries)

	// Count duplicates
	duplicates := 0
	for _, c := range counts {
		if c > 1 {
			duplicates += c - 1
		}
	}

	fmt.Printf("⚠️ Total unique filenames: %d\n", len(counts))
	fmt.Printf("⚠️ Total duplicate entries (would be lost in map[string]Entry): %d\n", duplicates)

	// Optional: print top 10 most duplicated filenames
	type kv struct {
		Key   string
		Count int
	}
	top := []kv{}
	for k, c := range counts {
		if c > 1 {
			top = append(top, kv{k, c})
		}
	}

	// Sort descending
	for i := 0; i < len(top)-1; i++ {
		for j := i + 1; j < len(top); j++ {
			if top[j].Count > top[i].Count {
				top[i], top[j] = top[j], top[i]
			}
		}
	}

	fmt.Println("🔑 Top duplicated filenames:")
	for i, kv := range top {
		if i >= 10 {
			break
		}
		fmt.Printf("- %s : %d duplicates\n", kv.Key, kv.Count)
	}
}
