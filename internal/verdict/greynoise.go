package verdict

import (
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/ma111e/fishbowl/internal/logsafe"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

// GreyNoise-specific analyzer
func analyzeGreyNoiseContent(ip string, content string) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_GREYNOISE,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	// Parse the HTML content
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		log.WithFields(logsafe.Fields(log.Fields{
			"error":  err,
			"source": SOURCE_GREYNOISE,
		}, log.Fields{
			"ip": ip,
		})).Error("Failed to parse HTML content")
		return result
	}

	// Look for classification elements
	classificationSelectors := []string{"[data-test=\"ip-context-classification\"]", ".classification"}

	for _, selector := range classificationSelectors {
		doc.Find(selector).Each(func(i int, s *goquery.Selection) {
			classification := strings.ToLower(strings.TrimSpace(s.Text()))
			result.Details["classification"] = classification

			switch {
			case strings.Contains(classification, "malicious"):
				result.Verdict = "malicious"
				result.Details["noise"] = true
				result.Details["riot"] = false

			case strings.Contains(classification, "benign"):
				result.Verdict = "benign"
				result.Details["noise"] = false
				result.Details["riot"] = true

			case strings.Contains(classification, "unknown"):
				result.Verdict = "unknown"
				result.Details["noise"] = false
				result.Details["riot"] = false

			default:
				result.Verdict = "neutral"
			}
		})
	}

	// Extract additional information when available
	lastSeenText := doc.Find(".last-seen, [data-test=\"ip-context-last-seen\"]").Text()
	if lastSeenText != "" {
		result.Details["lastSeen"] = lastSeenText
	}

	return result
}
