package verdict

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

const shodanHostURL = "https://api.shodan.io/shodan/host/"

// shodanHostResponse represents the subset of fields we surface from the
// Shodan host endpoint (GET /shodan/host/{ip}).
type shodanHostResponse struct {
	IPStr       string   `json:"ip_str"`
	Ports       []int    `json:"ports"`
	Hostnames   []string `json:"hostnames"`
	Org         string   `json:"org"`
	ISP         string   `json:"isp"`
	ASN         string   `json:"asn"`
	CountryCode string   `json:"country_code"`
	CountryName string   `json:"country_name"`
	OS          string   `json:"os"`
	Tags        []string `json:"tags"`
	// Vulns is decoded defensively: Shodan returns either an object keyed by
	// CVE id or, for some plans, a JSON array of CVE ids.
	Vulns json.RawMessage `json:"vulns"`
}

// shodanError represents Shodan's JSON error envelope, e.g. {"error": "..."}.
type shodanError struct {
	Error string `json:"error"`
}

// parseShodanVulns extracts CVE identifiers from the vulns field regardless of
// whether Shodan returned an object (keyed by CVE) or a flat array of strings.
func parseShodanVulns(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}

	var asObject map[string]json.RawMessage
	if err := json.Unmarshal(raw, &asObject); err == nil {
		if len(asObject) == 0 {
			return nil
		}
		cves := make([]string, 0, len(asObject))
		for cve := range asObject {
			cves = append(cves, cve)
		}
		sort.Strings(cves)
		return cves
	}

	var asArray []string
	if err := json.Unmarshal(raw, &asArray); err == nil {
		if len(asArray) == 0 {
			return nil
		}
		sort.Strings(asArray)
		return asArray
	}

	return nil
}

// analyzeShodanAPI queries the Shodan host endpoint for IP enrichment data.
// The result is always informational (verdict "neutral" on success); Shodan
// does not provide a malicious/benign judgment.
func analyzeShodanAPI(ip string, apiKey []byte) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_SHODAN,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	ipAddr := strings.TrimSpace(ip)
	if ipAddr == "" {
		result.Details["error"] = "empty_ip"
		log.WithField("source", SOURCE_SHODAN).Warn("Shodan API received empty IP")
		return result
	}

	params := url.Values{}
	params.Set("key", string(apiKey))
	reqURL := fmt.Sprintf("%s%s?%s", shodanHostURL, url.PathEscape(ipAddr), params.Encode())

	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		result.Details["error"] = "request_build_failed"
		log.WithError(err).WithField("source", SOURCE_SHODAN).Error("Failed to build Shodan API request")
		return result
	}
	req.Header.Set("Accept", "application/json")

	resp, err := verdictHTTPClient.Do(req)
	if err != nil {
		result.Details["error"] = "api_request_failed"
		log.WithError(err).WithField("source", SOURCE_SHODAN).Error("Shodan API request failed")
		return result
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Details["error"] = "read_body_failed"
		log.WithError(err).WithField("source", SOURCE_SHODAN).Error("Failed to read Shodan API response body")
		return result
	}

	if resp.StatusCode == http.StatusNotFound {
		// Shodan has no information about this IP.
		result.Verdict = "unknown"
		result.Details["status"] = "not_found"
		return result
	}

	if resp.StatusCode != http.StatusOK {
		result.Details["error"] = fmt.Sprintf("http_%d", resp.StatusCode)
		var apiErr shodanError
		if json.Unmarshal(body, &apiErr) == nil && apiErr.Error != "" {
			result.Details["message"] = apiErr.Error
		}
		log.WithFields(log.Fields{
			"source":      SOURCE_SHODAN,
			"status_code": resp.StatusCode,
		}).Error("Shodan API returned non-200 status")
		return result
	}

	var host shodanHostResponse
	if err := json.Unmarshal(body, &host); err != nil {
		result.Details["error"] = "json_parse_failed"
		log.WithError(err).WithField("source", SOURCE_SHODAN).Error("Failed to parse Shodan API JSON response")
		return result
	}

	// Informational: Shodan returns enrichment, not a risk judgment.
	result.Verdict = "neutral"

	if len(host.Ports) > 0 {
		sort.Ints(host.Ports)
		result.Details["ports"] = host.Ports
	}
	if len(host.Hostnames) > 0 {
		result.Details["hostnames"] = host.Hostnames
	}
	if host.Org != "" {
		result.Details["org"] = host.Org
	}
	if host.ISP != "" {
		result.Details["isp"] = host.ISP
	}
	if host.ASN != "" {
		result.Details["asn"] = host.ASN
		result.ASN = host.ASN
	}
	if host.CountryName != "" {
		result.Details["country"] = host.CountryName
	} else if host.CountryCode != "" {
		result.Details["country"] = host.CountryCode
	}
	if host.OS != "" {
		result.Details["os"] = host.OS
	}
	if len(host.Tags) > 0 {
		result.Details["tags"] = host.Tags
	}
	if cves := parseShodanVulns(host.Vulns); len(cves) > 0 {
		result.Details["vulns"] = cves
	}

	log.WithFields(log.Fields{
		"ip":     ip,
		"source": SOURCE_SHODAN,
		"ports":  len(host.Ports),
		"vulns":  len(parseShodanVulns(host.Vulns)),
	}).Info("Shodan API analysis complete")

	return result
}
