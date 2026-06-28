package verdict

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

// spurData mirrors the JSON structure rendered in the Spur page's <pre> element.
type spurData struct {
	AS struct {
		Number       int    `json:"number"`
		Organization string `json:"organization"`
	} `json:"as"`
	Client struct {
		Proxies []string `json:"proxies"`
	} `json:"client"`
	Infrastructure string `json:"infrastructure"`
	IP             string `json:"ip"`
	Location       struct {
		City    string `json:"city"`
		Country string `json:"country"`
		State   string `json:"state"`
	} `json:"location"`
	Organization string   `json:"organization"`
	Risks        []string `json:"risks"`
	Tunnels      []struct {
		Anonymous bool   `json:"anonymous"`
		Operator  string `json:"operator"`
		Type      string `json:"type"`
	} `json:"tunnels"`
}

// analyzeSpurContent parses the Spur page DOM and extracts reputation data
// from the JSON blob displayed in a <pre> element.
func analyzeSpurContent(ip string, content string) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_SPUR,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"ip":     ip,
			"source": SOURCE_SPUR,
		}).Error("Failed to parse HTML content")
		return result
	}

	// The Spur page renders the JSON context response inside a <pre> element.
	preText := ""
	doc.Find("pre").Each(func(i int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if text != "" && strings.HasPrefix(text, "{") {
			preText = text
		}
	})

	if preText == "" {
		log.WithFields(log.Fields{
			"ip":     ip,
			"source": SOURCE_SPUR,
		}).Warn("No JSON <pre> block found on Spur page")
		return result
	}

	var data spurData
	if err := json.Unmarshal([]byte(preText), &data); err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"ip":     ip,
			"source": SOURCE_SPUR,
		}).Error("Failed to parse Spur JSON")
		return result
	}

	// Populate details with the parsed fields
	if data.Infrastructure != "" {
		result.Details["infrastructure"] = data.Infrastructure
	}
	if data.Organization != "" {
		result.Details["organization"] = data.Organization
	}

	// Location
	if data.Location.City != "" || data.Location.Country != "" || data.Location.State != "" {
		loc := map[string]interface{}{}
		if data.Location.City != "" {
			loc["city"] = data.Location.City
		}
		if data.Location.Country != "" {
			loc["country"] = data.Location.Country
		}
		if data.Location.State != "" {
			loc["state"] = data.Location.State
		}
		result.Details["location"] = loc
	}

	// AS
	if data.AS.Number != 0 {
		result.Details["asn"] = fmt.Sprintf("AS%d", data.AS.Number)
	}
	if data.AS.Organization != "" {
		result.Details["asnOrg"] = data.AS.Organization
	}

	// Client proxies
	if len(data.Client.Proxies) > 0 {
		result.Details["proxies"] = data.Client.Proxies
	}

	// Risks
	if len(data.Risks) > 0 {
		result.Details["risks"] = data.Risks
	}

	// Tunnels - simplified list + extract operators as tags
	if len(data.Tunnels) > 0 {
		tunnelList := make([]map[string]interface{}, 0, len(data.Tunnels))
		var tags []string
		for _, t := range data.Tunnels {
			entry := map[string]interface{}{
				"type":      t.Type,
				"operator":  t.Operator,
				"anonymous": t.Anonymous,
			}
			if t.Operator != "" {
				entry["iconUrl"] = fmt.Sprintf("https://storage.googleapis.com/spur.us/website/resources/tags/logos/%s.png", t.Operator)
				tags = append(tags, t.Operator)
			}
			tunnelList = append(tunnelList, entry)
		}
		result.Details["tunnels"] = tunnelList
		if len(tags) > 0 {
			result.Details["tags"] = tags
		}
	}

	// Derive verdict: if there are risks or proxies, mark as suspicious
	if len(data.Risks) > 0 || len(data.Client.Proxies) > 0 {
		result.Verdict = "suspicious"
	} else {
		result.Verdict = "neutral"
	}

	log.WithFields(log.Fields{
		"ip":      ip,
		"source":  SOURCE_SPUR,
		"verdict": result.Verdict,
		"details": result.Details,
	}).Info("Spur analysis complete")

	return result
}
