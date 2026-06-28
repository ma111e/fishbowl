package verdict

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

// bazaarAPIResponse represents the JSON response from MalwareBazaar's query API.
type bazaarAPIResponse struct {
	QueryStatus string         `json:"query_status"`
	Data        []bazaarSample `json:"data"`
}

type bazaarSample struct {
	SHA256Hash    string   `json:"sha256_hash"`
	SHA384Hash    string   `json:"sha3_384_hash"`
	SHA1Hash      string   `json:"sha1_hash"`
	MD5Hash       string   `json:"md5_hash"`
	FirstSeen     string   `json:"first_seen"`
	LastSeen      string   `json:"last_seen"`
	FileName      string   `json:"file_name"`
	FileSize      int      `json:"file_size"`
	FileTypeMime  string   `json:"file_type_mime"`
	FileType      string   `json:"file_type"`
	Signature     string   `json:"signature"`
	Tags          []string `json:"tags"`
	OriginCountry string   `json:"origin_country"`
}

const bazaarAPIURL = "https://mb-api.abuse.ch/api/v1/"

// analyzeBazaarAPI queries the MalwareBazaar API for hash reputation data.
func analyzeBazaarAPI(value string, apiKey []byte) models.VerdictResult {
	result := models.VerdictResult{
		IP:      value,
		Source:  SOURCE_BAZAAR,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	hash := strings.TrimSpace(value)
	if hash == "" {
		result.Details["error"] = "empty_hash"
		log.WithField("source", SOURCE_BAZAAR).Warn("Bazaar API received empty hash")
		return result
	}

	// Build form data
	form := url.Values{}
	form.Set("query", "get_info")
	form.Set("hash", hash)

	req, err := http.NewRequest(http.MethodPost, bazaarAPIURL, strings.NewReader(form.Encode()))
	if err != nil {
		result.Details["error"] = "request_build_failed"
		log.WithError(err).WithField("source", SOURCE_BAZAAR).Error("Failed to build request")
		return result
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if len(apiKey) != 0 {
		req.Header.Set("Auth-Key", string(apiKey))
	}

	resp, err := verdictHTTPClient.Do(req)
	if err != nil {
		result.Details["error"] = "api_request_failed"
		log.WithError(err).WithField("source", SOURCE_BAZAAR).Error("MalwareBazaar API request failed")
		return result
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		result.Details["error"] = fmt.Sprintf("http_%d", resp.StatusCode)
		log.WithFields(log.Fields{
			"source":      SOURCE_BAZAAR,
			"status_code": resp.StatusCode,
		}).Error("MalwareBazaar API returned non-200 status")
		return result
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Details["error"] = "read_body_failed"
		log.WithError(err).WithField("source", SOURCE_BAZAAR).Error("Failed to read API response body")
		return result
	}

	var apiResp bazaarAPIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		result.Details["error"] = "json_parse_failed"
		log.WithError(err).WithField("source", SOURCE_BAZAAR).Error("Failed to parse API JSON response")
		return result
	}

	switch apiResp.QueryStatus {
	case "hash_not_found":
		result.Verdict = "unknown"
		result.Details["status"] = "not_found"
		log.WithFields(log.Fields{
			"value":  value,
			"source": SOURCE_BAZAAR,
		}).Info("Hash not found in MalwareBazaar")
		return result

	case "illegal_hash":
		result.Details["error"] = "illegal_hash"
		log.WithField("source", SOURCE_BAZAAR).Warn("MalwareBazaar reported illegal hash format")
		return result

	case "no_hash_provided":
		result.Details["error"] = "no_hash_provided"
		log.WithField("source", SOURCE_BAZAAR).Warn("MalwareBazaar reported no hash provided")
		return result

	case "ok":
		// Proceed to parse the sample data below

	default:
		result.Details["error"] = "unexpected_status"
		result.Details["queryStatus"] = apiResp.QueryStatus
		log.WithFields(log.Fields{
			"source":       SOURCE_BAZAAR,
			"query_status": apiResp.QueryStatus,
		}).Warn("Unexpected query_status from MalwareBazaar")
		return result
	}

	if len(apiResp.Data) == 0 {
		result.Verdict = "unknown"
		result.Details["status"] = "not_found"
		return result
	}

	sample := apiResp.Data[0]

	// Present in MalwareBazaar → known malware sample
	result.Verdict = "malicious"
	result.Details["status"] = "found"

	if sample.SHA256Hash != "" {
		result.Details["sha256"] = sample.SHA256Hash
	}
	if sample.SHA1Hash != "" {
		result.Details["sha1"] = sample.SHA1Hash
	}
	if sample.MD5Hash != "" {
		result.Details["md5"] = sample.MD5Hash
	}
	if sample.FileType != "" {
		result.Details["fileType"] = sample.FileType
	}
	if sample.FileSize > 0 {
		result.Details["fileSize"] = sample.FileSize
	}
	if sample.Signature != "" {
		result.Details["signature"] = sample.Signature
	}
	if sample.FirstSeen != "" {
		result.Details["firstSeen"] = sample.FirstSeen
	}
	if sample.LastSeen != "" {
		result.Details["lastSeen"] = sample.LastSeen
	}
	if sample.FileName != "" {
		result.Details["fileName"] = sample.FileName
	}
	if sample.FileTypeMime != "" {
		result.Details["mimeType"] = sample.FileTypeMime
	}
	if sample.OriginCountry != "" {
		result.Details["originCountry"] = sample.OriginCountry
	}
	if len(sample.Tags) > 0 {
		result.Details["tags"] = sample.Tags
	}

	log.WithFields(log.Fields{
		"value":   value,
		"source":  SOURCE_BAZAAR,
		"verdict": result.Verdict,
	}).Info("Bazaar API analysis complete")

	return result
}
