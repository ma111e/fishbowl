package verdict

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

// VirusTotal API v3 response types

type vtAPIResponse struct {
	Data  *vtAPIData  `json:"data"`
	Error *vtAPIError `json:"error"`
}

type vtAPIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type vtAPIData struct {
	ID         string          `json:"id"`
	Type       string          `json:"type"`
	Attributes vtAPIAttributes `json:"attributes"`
}

type vtAPIAttributes struct {
	LastAnalysisStats vtAnalysisStats   `json:"last_analysis_stats"`
	LastAnalysisDate  int64             `json:"last_analysis_date"`
	Reputation        int               `json:"reputation"`
	TotalVotes        vtVotes           `json:"total_votes"`
	Tags              []string          `json:"tags"`
	Categories        map[string]string `json:"categories"`
	Country           string            `json:"country"`
	Continent         string            `json:"continent"`
	MeaningfulName    string            `json:"meaningful_name"`
	SHA256            string            `json:"sha256"`
	SHA1              string            `json:"sha1"`
	MD5               string            `json:"md5"`
	TypeDescription   string            `json:"type_description"`
	Size              int64             `json:"size"`
	Names             []string          `json:"names"`
}

type vtAnalysisStats struct {
	Malicious  int `json:"malicious"`
	Suspicious int `json:"suspicious"`
	Undetected int `json:"undetected"`
	Harmless   int `json:"harmless"`
	Timeout    int `json:"timeout"`
}

type vtVotes struct {
	Harmless  int `json:"harmless"`
	Malicious int `json:"malicious"`
}

// vtSupportsAPIMode reports whether the given entity type can be resolved via
// the VT v3 typed endpoints. The "file" type carries filenames, not hashes,
// and cannot be looked up by the /files/{id} hash endpoint.
func vtSupportsAPIMode(entityType string) bool {
	switch strings.ToLower(strings.TrimSpace(entityType)) {
	case "ip", "ip_address", "domain", "hash":
		return true
	}
	return false
}

// analyzeVirusTotalAPI calls the VirusTotal v3 API for ip/domain/hash entities.
func analyzeVirusTotalAPI(value, entityType string, apiKey []byte) models.VerdictResult {
	result := models.VerdictResult{
		IP:      value,
		Source:  SOURCE_VIRUSTOTAL,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	v := strings.TrimSpace(value)
	if v == "" {
		result.Details["error"] = "empty_value"
		log.WithField("source", SOURCE_VIRUSTOTAL).Warn("VirusTotal API received empty value")
		return result
	}

	var endpoint string
	switch strings.ToLower(strings.TrimSpace(entityType)) {
	case "domain":
		endpoint = "https://www.virustotal.com/api/v3/domains/" + url.PathEscape(v)
	case "ip", "ip_address":
		endpoint = "https://www.virustotal.com/api/v3/ip_addresses/" + url.PathEscape(v)
	case "hash":
		endpoint = "https://www.virustotal.com/api/v3/files/" + url.PathEscape(v)
	default:
		result.Details["error"] = fmt.Sprintf("unsupported_entity_type:%s", entityType)
		log.WithFields(log.Fields{
			"source":      SOURCE_VIRUSTOTAL,
			"entity_type": entityType,
		}).Warn("VirusTotal API called with unsupported entity type")
		return result
	}

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		result.Details["error"] = "request_build_failed"
		log.WithError(err).WithField("source", SOURCE_VIRUSTOTAL).Error("Failed to build VirusTotal API request")
		return result
	}
	req.Header.Set("x-apikey", string(apiKey))
	req.Header.Set("accept", "application/json")

	resp, err := verdictHTTPClient.Do(req)
	if err != nil {
		result.Details["error"] = "api_request_failed"
		log.WithError(err).WithField("source", SOURCE_VIRUSTOTAL).Error("VirusTotal API request failed")
		return result
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Details["error"] = "read_body_failed"
		log.WithError(err).WithField("source", SOURCE_VIRUSTOTAL).Error("Failed to read VirusTotal API response body")
		return result
	}

	if resp.StatusCode == http.StatusNotFound {
		var apiResp vtAPIResponse
		_ = json.Unmarshal(body, &apiResp)
		if apiResp.Error != nil && apiResp.Error.Code == "NotFoundError" {
			result.Details["error"] = "not_found"
		} else {
			result.Details["error"] = "http_404"
		}
		log.WithFields(log.Fields{
			"source": SOURCE_VIRUSTOTAL,
			"value":  v,
		}).Info("VirusTotal API: resource not found")
		return result
	}

	if resp.StatusCode != http.StatusOK {
		result.Details["error"] = fmt.Sprintf("http_%d", resp.StatusCode)
		log.WithFields(log.Fields{
			"source":      SOURCE_VIRUSTOTAL,
			"status_code": resp.StatusCode,
		}).Error("VirusTotal API returned non-200 status")
		return result
	}

	var apiResp vtAPIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		result.Details["error"] = "json_parse_failed"
		log.WithError(err).WithField("source", SOURCE_VIRUSTOTAL).Error("Failed to parse VirusTotal API JSON response")
		return result
	}
	if apiResp.Data == nil {
		result.Details["error"] = "empty_data"
		return result
	}

	attrs := apiResp.Data.Attributes
	stats := attrs.LastAnalysisStats
	total := stats.Malicious + stats.Suspicious + stats.Undetected + stats.Harmless + stats.Timeout

	ratio := 0.0
	if total > 0 {
		result.Verdict = setVerdictFromDetections(stats.Malicious)
		ratio = float64(stats.Malicious) / float64(total)
	}
	result.Details["engineResults"] = map[string]interface{}{
		"score":    fmt.Sprintf("%d/%d", stats.Malicious, total),
		"detected": stats.Malicious,
		"total":    total,
		"ratio":    ratio,
	}
	result.Details["analysisStats"] = map[string]interface{}{
		"malicious":  stats.Malicious,
		"suspicious": stats.Suspicious,
		"undetected": stats.Undetected,
		"harmless":   stats.Harmless,
		"timeout":    stats.Timeout,
	}
	result.Details["reputation"] = attrs.Reputation
	if len(attrs.Tags) > 0 {
		result.Details["tags"] = attrs.Tags
	}

	// Type-specific fields
	switch strings.ToLower(strings.TrimSpace(entityType)) {
	case "ip", "ip_address":
		if attrs.Country != "" {
			result.Details["country"] = attrs.Country
		}
		if attrs.Continent != "" {
			result.Details["continent"] = attrs.Continent
		}
	case "domain":
		if len(attrs.Categories) > 0 {
			result.Details["categories"] = attrs.Categories
		}
	case "hash":
		if attrs.MD5 != "" {
			result.Details["md5"] = attrs.MD5
		}
		if attrs.SHA1 != "" {
			result.Details["sha1"] = attrs.SHA1
		}
		if attrs.SHA256 != "" {
			result.Details["sha256"] = attrs.SHA256
		}
		if attrs.TypeDescription != "" {
			result.Details["typeDescription"] = attrs.TypeDescription
		}
		if attrs.Size > 0 {
			result.Details["size"] = attrs.Size
		}
		if len(attrs.Names) > 0 {
			result.Details["names"] = attrs.Names
		}
		if attrs.MeaningfulName != "" {
			result.Details["meaningfulName"] = attrs.MeaningfulName
		}
	}

	log.WithFields(log.Fields{
		"value":   v,
		"source":  SOURCE_VIRUSTOTAL,
		"verdict": result.Verdict,
		"score":   fmt.Sprintf("%d/%d", stats.Malicious, total),
	}).Info("VirusTotal API analysis complete")

	return result
}

type vtBadge struct {
	Name    string `json:"name"`
	Tooltip string `json:"tooltip,omitempty"`
}

func setVerdictFromDetections(detections int) string {
	switch {
	case detections == 0:
		return "benign"
	case detections <= 2:
		return "neutral"
	case detections <= 5:
		return "suspicious"
	default:
		return "malicious"
	}
}

// VirusTotal-specific analyzer
func analyzeVirusTotalContent(ip string, content string) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_VIRUSTOTAL,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	log.WithFields(log.Fields{
		"ip":             ip,
		"source":         SOURCE_VIRUSTOTAL,
		"content_length": len(content),
	}).Info("VirusTotal parser received content")

	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		result.Details["error"] = "empty_content"
		log.WithFields(log.Fields{
			"ip":     ip,
			"source": SOURCE_VIRUSTOTAL,
		}).Warn("VirusTotal parser received empty content")
		return result
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"ip":     ip,
			"source": SOURCE_VIRUSTOTAL,
		}).Error("Failed to parse HTML content")
		return result
	}

	// When VirusTotal fails to resolve an IOC and suggests trying another query,
	// do not attempt to infer a verdict from the page.
	// Example marker: <a class="btn">Try a new search</a>
	tryNewSearchFound := false
	doc.Find("a.btn").EachWithBreak(func(_ int, s *goquery.Selection) bool {
		text := strings.TrimSpace(strings.ToLower(s.Text()))
		if text == "try a new search" {
			tryNewSearchFound = true
			return false
		}
		return true
	})
	if tryNewSearchFound {
		result.Details["error"] = "try_new_search_prompt"
		log.WithFields(log.Fields{
			"ip":     ip,
			"source": SOURCE_VIRUSTOTAL,
		}).Warn("VirusTotal parser encountered 'try a new search' prompt")
		return result
	}

	// ── Extract identifiers (aliases) from .text-truncate divs ──
	aliases := make([]string, 0)
	seenAliases := make(map[string]struct{})
	doc.Find("div.text-truncate").Each(func(_ int, s *goquery.Selection) {
		// Skip parent containers that have nested text-truncate children
		if s.Find("div.text-truncate").Length() > 0 {
			return
		}
		// Get text content after removing all child elements to avoid nested aliases
		text := strings.TrimSpace(s.Clone().Children().Remove().End().Text())
		if text == "" {
			text = strings.TrimSpace(s.Text())
		}
		text = strings.TrimSpace(text)
		if text == "" {
			return
		}

		lower := strings.ToLower(text)
		if _, ok := seenAliases[lower]; ok {
			return
		}
		seenAliases[lower] = struct{}{}
		aliases = append(aliases, text)
	})
	if len(aliases) > 0 {
		result.Details["aliases"] = aliases
	}

	// ── Extract file-specific fields ──
	if sel := doc.Find(".file-id"); sel.Length() > 0 {
		if h := strings.TrimSpace(sel.Text()); h != "" {
			result.Details["fileHash"] = h
		}
	}
	if sel := doc.Find(".file-name"); sel.Length() > 0 {
		if n := strings.TrimSpace(sel.Text()); n != "" {
			result.Details["fileName"] = n
		}
	}

	// ── Extract labeled metadata sections (e.g. "Size", "Last Analysis Date") ──
	allowedLabels := map[string]struct{}{
		"last analysis date": {},
		"size":               {},
		"type":               {},
		"creation date":      {},
		"first submission":   {},
		"last submission":    {},
	}
	doc.Find("div.text-body-tertiary").Each(func(_ int, s *goquery.Selection) {
		label := strings.TrimSpace(s.Text())
		if label == "" {
			return
		}
		if _, ok := allowedLabels[strings.ToLower(label)]; !ok {
			return
		}
		parent := s.Parent()
		if parent.Length() == 0 {
			return
		}

		// Check for vt-ui-time-ago element (Last Analysis Date)
		if ta := parent.Find("vt-ui-time-ago"); ta.Length() > 0 {
			if tooltip, exists := ta.Attr("data-tooltip-text"); exists && strings.TrimSpace(tooltip) != "" {
				result.Details[label] = strings.TrimSpace(tooltip)
				return
			}
		}

		// Otherwise get text from the first non-label child
		parent.Children().Each(func(_ int, child *goquery.Selection) {
			if child.HasClass("text-body-tertiary") {
				return
			}
			if text := strings.TrimSpace(child.Text()); text != "" {
				if _, exists := result.Details[label]; !exists {
					result.Details[label] = text
				}
			}
		})
	})

	// ── Extract badges (skip non-tag entries like "Sign up") ──
	badgeBlacklist := map[string]struct{}{
		"sign up": {}, "sign in": {}, "log in": {}, "register": {},
	}
	badges := make([]vtBadge, 0)
	seenBadges := make(map[string]struct{})
	doc.Find("a.badge.rounded-pill").Each(func(_ int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if text == "" {
			return
		}
		lower := strings.ToLower(text)
		if _, blocked := badgeBlacklist[lower]; blocked {
			return
		}
		if _, ok := seenBadges[lower]; ok {
			return
		}
		seenBadges[lower] = struct{}{}
		b := vtBadge{Name: text}
		if tooltip, exists := s.Attr("data-tooltip-text"); exists && strings.TrimSpace(tooltip) != "" {
			b.Tooltip = strings.TrimSpace(tooltip)
		}
		badges = append(badges, b)
	})
	if len(badges) > 0 {
		result.Details["badges"] = badges
	}

	// ── Extract detection ratio from score widget ──
	reRatio := regexp.MustCompile(`(?m)(\d{1,3})\s*\/\s*(\d{1,3})`)
	parseRatioFromText := func(text string) (int, int, bool) {
		clean := strings.TrimSpace(text)
		if clean == "" {
			return 0, 0, false
		}
		matches := reRatio.FindStringSubmatch(clean)
		if len(matches) < 3 {
			return 0, 0, false
		}
		detections, err1 := strconv.Atoi(matches[1])
		total, err2 := strconv.Atoi(matches[2])
		if err1 != nil || err2 != nil || total <= 0 {
			return 0, 0, false
		}
		return detections, total, true
	}

	var detected int
	var total int
	var found bool

	for _, selector := range []string{"vt-ioc-score-widget-detections-chart"} {
		if found {
			break
		}

		selection := doc.Find(selector)
		if selection.Length() == 0 {
			continue
		}

		selection.EachWithBreak(func(_ int, s *goquery.Selection) bool {
			text := strings.TrimSpace(s.Text())
			d, t, ok := parseRatioFromText(text)
			if !ok {
				return true
			}

			detected = d
			total = t
			found = true
			return false
		})
	}

	if found {
		ratio := float64(detected) / float64(total)
		if math.IsNaN(ratio) || math.IsInf(ratio, 0) {
			ratio = 0
		}

		result.Verdict = setVerdictFromDetections(detected)
		log.WithFields(log.Fields{
			"ip":       ip,
			"source":   SOURCE_VIRUSTOTAL,
			"detected": detected,
			"total":    total,
			"ratio":    ratio,
			"verdict":  result.Verdict,
		}).Info("VirusTotal parser extracted detection ratio")

		result.Details["engineResults"] = map[string]interface{}{
			"score":    strconv.Itoa(detected) + "/" + strconv.Itoa(total),
			"detected": detected,
			"total":    total,
			"ratio":    ratio,
		}
	}

	return result
}
