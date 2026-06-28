package verdict

import (
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

// AlienVault OTX-specific analyzer
func analyzeAlienVaultContent(ip string, content string) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_ALIENVAULT,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	// Parse the HTML content
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"ip":     ip,
			"source": SOURCE_ALIENVAULT,
		}).Error("Failed to parse HTML content")
		return result
	}

	// Count pulse items
	pulseCount := 0
	pulseSelectors := []string{".pulse-item", ".pulse-name"}

	for _, selector := range pulseSelectors {
		selection := doc.Find(selector)
		if selection.Length() > 0 {
			pulseCount = selection.Length()
			break
		}
	}

	// Set pulse count in details
	result.Details["pulseCount"] = pulseCount

	// Check if it's a "not found" page
	notFoundText := doc.Find(".page-header").Text()
	if strings.Contains(strings.ToLower(notFoundText), "not found") {
		result.Verdict = "unknown"
		result.Details["status"] = "not_found"
	}

	// Extract tags if available
	tags := []string{}
	doc.Find(".tag").Each(func(i int, s *goquery.Selection) {
		tags = append(tags, strings.TrimSpace(s.Text()))
	})
	if len(tags) > 0 {
		result.Details["tags"] = tags
	}

	return result
}
