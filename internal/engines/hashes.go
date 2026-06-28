package engines

import (
	"regexp"
	"strings"

	"github.com/ma111e/fishbowl/internal/data"
	"github.com/ma111e/fishbowl/internal/models"
)

// HashesEngine implements the Engine interface for SHA1/SHA256 hash extraction.
type HashesEngine struct{}

func (e *HashesEngine) Name() string {
	return "hashes"
}

func (e *HashesEngine) Analyze(textContent string) ResultPatch {
	return ResultPatch{Hashes: ExtractHashes(textContent)}
}

func (e *HashesEngine) Process(textContent string) interface{} {
	return e.Analyze(textContent).Hashes
}

func init() {
	RegisterEngine(&HashesEngine{})
}

var (
	sha1Regex   = regexp.MustCompile(`\b[a-fA-F0-9]{40}\b`)
	sha256Regex = regexp.MustCompile(`\b[a-fA-F0-9]{64}\b`)
)

func ExtractHashes(text string) []models.Hash {
	if text == "" {
		return []models.Hash{}
	}

	sha1Matches := sha1Regex.FindAllString(text, -1)
	sha256Matches := sha256Regex.FindAllString(text, -1)

	seen := make(map[string]struct{})
	out := make([]models.Hash, 0, len(sha1Matches)+len(sha256Matches))

	add := func(kind string, value string) {
		v := strings.ToLower(value)
		key := kind + ":" + v
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		h := models.Hash{Kind: kind, Value: v}
		if data.IsKnownHash(v) {
			h.Badges = []string{"known"}
		}
		out = append(out, h)
	}

	for _, m := range sha1Matches {
		add("sha1", m)
	}
	for _, m := range sha256Matches {
		add("sha256", m)
	}

	return out
}
