package verdict

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

var (
	reAbuseScore   = regexp.MustCompile(`Confidence of\s+Abuse\s+is\s+<b>(\d+)%</b>`)
	reAbuseReports = regexp.MustCompile(`reported\s+<b>([\d,]+)</b>\s+times`)
)

// abuseIPDBAPIResponse represents the JSON response from the AbuseIPDB v2 check endpoint.
type abuseIPDBAPIResponse struct {
	Data abuseIPDBData `json:"data"`
}

type abuseIPDBData struct {
	IPAddress            string   `json:"ipAddress"`
	IsPublic             bool     `json:"isPublic"`
	IPVersion            int      `json:"ipVersion"`
	IsWhitelisted        bool     `json:"isWhitelisted"`
	AbuseConfidenceScore int      `json:"abuseConfidenceScore"`
	CountryCode          string   `json:"countryCode"`
	UsageType            string   `json:"usageType"`
	ISP                  string   `json:"isp"`
	Domain               string   `json:"domain"`
	Hostnames            []string `json:"hostnames"`
	IsTor                bool     `json:"isTor"`
	TotalReports         int      `json:"totalReports"`
	NumDistinctUsers     int      `json:"numDistinctUsers"`
	LastReportedAt       string   `json:"lastReportedAt"`
}

const abuseIPDBAPIURL = "https://api.abuseipdb.com/api/v2/check"

// abuseIPDBVerdict maps an abuse confidence score and report count to a verdict string,
// using the same thresholds as the scraping path.
func abuseIPDBVerdict(score, reports int) string {
	verdict := "neutral"
	if score > 50 {
		verdict = "malicious"
	} else if score > 20 {
		verdict = "suspicious"
	}

	// Report-count overrides
	if reports >= 20 {
		verdict = "malicious"
	} else if reports >= 10 && verdict == "neutral" {
		verdict = "suspicious"
	}
	return verdict
}

// analyzeAbuseIPDBAPI queries the AbuseIPDB v2 API for IP reputation data.
func analyzeAbuseIPDBAPI(ip string, apiKey []byte) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_ABUSEIPDB,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	ipAddr := strings.TrimSpace(ip)
	if ipAddr == "" {
		result.Details["error"] = "empty_ip"
		log.WithField("source", SOURCE_ABUSEIPDB).Warn("AbuseIPDB API received empty IP")
		return result
	}

	params := url.Values{}
	params.Set("ipAddress", ipAddr)
	params.Set("maxAgeInDays", "90")
	params.Set("verbose", "")
	reqURL := fmt.Sprintf("%s?%s", abuseIPDBAPIURL, params.Encode())

	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		result.Details["error"] = "request_build_failed"
		log.WithError(err).WithField("source", SOURCE_ABUSEIPDB).Error("Failed to build AbuseIPDB API request")
		return result
	}
	req.Header.Set("Key", string(apiKey))
	req.Header.Set("Accept", "application/json")

	resp, err := verdictHTTPClient.Do(req)
	if err != nil {
		result.Details["error"] = "api_request_failed"
		log.WithError(err).WithField("source", SOURCE_ABUSEIPDB).Error("AbuseIPDB API request failed")
		return result
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		result.Details["error"] = fmt.Sprintf("http_%d", resp.StatusCode)
		log.WithFields(log.Fields{
			"source":      SOURCE_ABUSEIPDB,
			"status_code": resp.StatusCode,
		}).Error("AbuseIPDB API returned non-200 status")
		return result
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Details["error"] = "read_body_failed"
		log.WithError(err).WithField("source", SOURCE_ABUSEIPDB).Error("Failed to read AbuseIPDB API response body")
		return result
	}

	var apiResp abuseIPDBAPIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		result.Details["error"] = "json_parse_failed"
		log.WithError(err).WithField("source", SOURCE_ABUSEIPDB).Error("Failed to parse AbuseIPDB API JSON response")
		return result
	}

	d := apiResp.Data
	result.Verdict = abuseIPDBVerdict(d.AbuseConfidenceScore, d.TotalReports)
	result.Details["abuseConfidenceScore"] = d.AbuseConfidenceScore
	result.Details["reportCount"] = d.TotalReports
	result.Details["distinctUsers"] = d.NumDistinctUsers
	result.Details["isWhitelisted"] = d.IsWhitelisted
	if d.ISP != "" {
		result.Details["isp"] = d.ISP
	}
	if d.UsageType != "" {
		result.Details["usageType"] = d.UsageType
	}
	if d.Domain != "" {
		result.Details["domainName"] = d.Domain
	}
	if d.CountryCode != "" {
		result.Details["country"] = d.CountryCode
	}
	if d.LastReportedAt != "" {
		result.Details["lastReportedAt"] = d.LastReportedAt
	}
	if d.IsTor {
		result.Details["isTor"] = true
	}

	log.WithFields(log.Fields{
		"ip":      ip,
		"source":  SOURCE_ABUSEIPDB,
		"verdict": result.Verdict,
		"score":   d.AbuseConfidenceScore,
	}).Info("AbuseIPDB API analysis complete")

	return result
}

// analyzeAbuseIPDBContent extracts reputation data from AbuseIPDB HTML page content.
func analyzeAbuseIPDBContent(ip string, content string) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_ABUSEIPDB,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"ip":     ip,
			"source": SOURCE_ABUSEIPDB,
		}).Error("Failed to parse HTML content")
		return result
	}

	hasRecentReports := false
	doc.Find(".alert.alert-warning").Each(func(i int, s *goquery.Selection) {
		text := s.Text()
		if strings.Contains(text, "Recent Reports") && strings.Contains(text, "within the last week") {
			hasRecentReports = true
		}
	})
	result.Details["hasRecentReports"] = hasRecentReports
	result.Details["isWhitelisted"] = false

	doc.Find(".well").Each(func(i int, s *goquery.Selection) {
		htmlContent, _ := s.Html()
		text := s.Text()

		if strings.Contains(strings.ToLower(text), "our whitelist") {
			result.Details["isWhitelisted"] = true
		}

		if matches := reAbuseScore.FindStringSubmatch(htmlContent); len(matches) >= 2 {
			if score, err := strconv.Atoi(matches[1]); err == nil {
				result.Details["abuseConfidenceScore"] = score
				result.Verdict = abuseIPDBVerdict(score, 0)
			}
		} else {
			if strings.Contains(text, "was not found in our database") {
				result.Verdict = "unknown"
				result.Details["status"] = "not_found"
			}
		}

		if matches := reAbuseReports.FindStringSubmatch(htmlContent); len(matches) >= 2 {
			if reports, err := strconv.Atoi(strings.ReplaceAll(matches[1], ",", "")); err == nil {
				result.Details["reportCount"] = reports
				// Re-apply verdict with both score and report count
				score, _ := result.Details["abuseConfidenceScore"].(int)
				result.Verdict = abuseIPDBVerdict(score, reports)
			}
		}

		s.Find("table.table tr").Each(func(i int, tr *goquery.Selection) {
			header := strings.TrimSpace(tr.Find("th").Text())
			value := strings.TrimSpace(tr.Find("td").Text())
			switch header {
			case "ISP":
				result.Details["isp"] = value
			case "Usage Type":
				result.Details["usageType"] = value
			case "ASN":
				result.Details["asn"] = value
			case "Domain Name":
				result.Details["domainName"] = value
			case "Country":
				result.Details["country"] = value
			case "City":
				result.Details["city"] = value
			}
		})

		log.WithFields(log.Fields{
			"details": result.Details,
		}).Info("Extracted AbuseIPDB details")
	})

	if hasRecentReports && (result.Verdict == "neutral" || result.Verdict == "unknown") {
		result.Verdict = "suspicious"
	}
	if wl, ok := result.Details["isWhitelisted"].(bool); ok && wl {
		result.Verdict = "neutral"
	}

	categories := []string{}
	doc.Find(".category-link").Each(func(i int, s *goquery.Selection) {
		categories = append(categories, strings.TrimSpace(s.Text()))
	})
	if len(categories) > 0 {
		result.Details["categories"] = categories
	}

	return result
}
