package engines

import (
	"path/filepath"
	"regexp"
	"strings"

	"github.com/ma111e/fishbowl/internal/data"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

// FilesEngine implements the Engine interface for filename/path extraction.
type FilesEngine struct{}

func (e *FilesEngine) Name() string {
	return "files"
}

func (e *FilesEngine) Analyze(textContent string) ResultPatch {
	text := strings.TrimSpace(textContent)
	if text == "" {
		return ResultPatch{Files: []models.FileEntity{}}
	}

	allowed := loadAllowedFileExtensions()
	if len(allowed) == 0 {
		log.Warn("No allowed file extensions configured")
		return ResultPatch{Files: []models.FileEntity{}}
	}

	candidates := extractFileCandidates(text)
	if len(candidates) == 0 {
		return ResultPatch{Files: []models.FileEntity{}}
	}

	seen := make(map[string]struct{})
	out := make([]models.FileEntity, 0, len(candidates))

	for _, c := range candidates {
		c = strings.TrimSpace(c)
		// if c == "" || len(c) > maxCandidateLen {
		// 	continue
		// }

		// Remove common trailing punctuation that appears in prose.
		c = strings.TrimRight(c, ".,;:!?)\"]}")
		c = strings.TrimLeft(c, "\"'([{<")
		if c == "" {
			continue
		}

		// Determine the filename portion and extension.
		base := c
		// Prefer platform-aware behavior.
		if strings.Contains(base, "\\") {
			if idx := strings.LastIndex(base, "\\"); idx >= 0 && idx < len(base)-1 {
				base = base[idx+1:]
			}
		} else if strings.Contains(base, "/") {
			base = filepath.Base(base)
		}

		// As a fallback, strip any query-like suffixes (rare in plain text but possible).
		base = strings.SplitN(base, "?", 2)[0]
		base = strings.SplitN(base, "#", 2)[0]

		parts := strings.Split(base, ".")
		if len(parts) < 2 {
			continue
		}

		isAllowed := false
		for i := 1; i < len(parts); i++ {
			// clean up RTL characters just in case it's adjacent to the extension
			cleanExt := strings.ToLower(strings.Trim(parts[i], "\u202e\u200e\u202d\u202c"))
			if _, ok := allowed[cleanExt]; ok {
				isAllowed = true
				break
			}
		}

		if !isAllowed {
			continue
		}

		key := strings.ToLower(base)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}

		entity := models.FileEntity{File: base}
		if data.IsKnownFile(key) {
			entity.Badges = []string{"known-file"}
		}
		out = append(out, entity)
	}

	return ResultPatch{Files: out}
}

func (e *FilesEngine) Process(textContent string) interface{} {
	return e.Analyze(textContent).Files
}

func init() {
	RegisterEngine(&FilesEngine{})
}

var (
	fileCandidateRegex = regexp.MustCompile(
		`(?i)` +
			// Branch 1: Windows backslash paths → group 1
			`(?:[a-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*` +
			`|\\\\[^\\/:*?"<>|\r\n]+\\(?:[^\\/:*?"<>|\r\n]+\\)*` +
			`|(?:[a-z]:)?\.{0,2}\\(?:[^\\/:*?"<>|\r\n]+\\)*)` +
			"([^\\\\/:*?\"<>|\\r\\n\\s()\\[\\]`,'\"]+(?:\\.[a-z0-9]{1,10})+)" +
			// Branch 2: Unix / URL paths → group 2
			`|(?:https?://[^\s/]*)?(?:/[^/"'<>|\r\n\t\s]*/)+` +
			`([\w\-+.@%]+(?:\.[a-z0-9]{1,10})+)` +
			// Branch 3: Quoted spaced filenames → group 3
			`|"([^"\\]*(?:\.[a-z0-9]{1,10})+)"` +
			// Branch 4: Bare filename - extension must contain ≥1 letter (blocks IPs)
			`|(\w[\w\-+.@%]*(?:\.[a-z0-9]*[a-z][a-z0-9]*))[.,;:!?)` + "`" + `]*`,
	)
)

func extractFileCandidates(text string) []string {
	return fileCandidateRegex.FindAllString(text, -1)
}

func loadAllowedFileExtensions() map[string]struct{} {
	out := make(map[string]struct{}, len(data.AllowedFileExtensions))
	for _, v := range data.AllowedFileExtensions {
		x := strings.ToLower(strings.TrimSpace(v))
		if x == "" {
			continue
		}
		x = strings.TrimPrefix(x, ".")
		if x == "" {
			continue
		}
		out[x] = struct{}{}
	}
	return out
}
