package verdict

import (
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

// DomainTools WHOIS-specific analyzer
func analyzeWhoisContent(ip string, content string) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_WHOIS,
		Verdict: "unknown", // Default for WHOIS data
		Details: make(map[string]interface{}),
	}

	// Parse the HTML content
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"ip":     ip,
			"source": SOURCE_WHOIS,
		}).Error("Failed to parse HTML content")
		return result
	}

	// Find the raw WHOIS block div with class "raw well well-sm"
	rawWhoisBlock := doc.Find(".raw.well.well-sm").First()
	if rawWhoisBlock.Length() == 0 {
		log.WithFields(log.Fields{
			"ip":     ip,
			"source": SOURCE_WHOIS,
		}).Error("WHOIS block not found")
		return result
	}

	// Get the HTML content of the first block
	whoisHTML, err := rawWhoisBlock.Html()
	if err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"ip":     ip,
			"source": SOURCE_WHOIS,
		}).Error("Failed to extract WHOIS HTML")
		return result
	}

	// Split by double <br> tags to get the first block
	blocks := strings.Split(whoisHTML, "<br><br>")
	if len(blocks) == 0 {
		log.WithFields(log.Fields{
			"ip":     ip,
			"source": SOURCE_WHOIS,
		}).Error("No WHOIS blocks found")
		return result
	}

	// Process the first block
	firstBlock := blocks[0]
	// Create a new document for just this block
	blockDoc, err := goquery.NewDocumentFromReader(strings.NewReader(firstBlock))
	if err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"ip":     ip,
			"source": SOURCE_WHOIS,
		}).Error("Failed to parse first block")
		return result
	}

	// Extract text from the block and clean it
	whoisText := blockDoc.Text()

	// Process the text by splitting into lines and parsing key:value pairs
	lines := strings.Split(whoisText, "\n")
	for _, line := range lines {
		// Skip empty lines
		if strings.TrimSpace(line) == "" {
			continue
		}

		// Check for Value range in first line (Abuse contact line)
		if strings.Contains(line, "Abuse contact for") {
			// Try to extract Value range with regex
			ipRangeRegex := regexp.MustCompile(`'([\d.]+)\s*-\s*([\d.]+)'`)
			ipRangeMatches := ipRangeRegex.FindStringSubmatch(line)

			if len(ipRangeMatches) >= 3 {
				result.Details["ipRangeStart"] = ipRangeMatches[1]
				result.Details["ipRangeEnd"] = ipRangeMatches[2]
			}

			// Try to extract abuse contact email if present in this line
			// Note: In the example, email is an image with MD5 hash, so we can't extract it directly

			continue
		}

		// For other lines, try to split by first colon
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			key := strings.ToLower(strings.TrimSpace(parts[0]))
			value := strings.TrimSpace(parts[1])

			switch key {
			case "inetnum":
				// Extract Value range
				ipRangeRegex := regexp.MustCompile(`([\d.]+)\s*-\s*([\d.]+)`)
				ipRangeMatches := ipRangeRegex.FindStringSubmatch(value)
				if len(ipRangeMatches) >= 3 {
					result.Details["ipRangeStart"] = ipRangeMatches[1]
					result.Details["ipRangeEnd"] = ipRangeMatches[2]
				}

			case "netname":
				result.Details["netname"] = value

			case "descr":
				// There might be multiple description lines, append them
				if existingDescr, ok := result.Details["description"]; ok {
					result.Details["description"] = existingDescr.(string) + "; " + value
				} else {
					result.Details["description"] = value
				}

			case "country":
				result.Details["country"] = value

			case "status":
				result.Details["status"] = value

			case "created":
				result.Details["created"] = value

			case "last-modified":
				result.Details["lastModified"] = value

			case "source":
				result.Details["whoisSource"] = value
			}
		}
	}

	// Look for ASN in the whole content (outside the specific parsing)
	asnRegex := regexp.MustCompile(`\b(AS\d+)\b`)
	asnMatches := asnRegex.FindStringSubmatch(whoisHTML)
	if len(asnMatches) > 1 {
		result.Details["asn"] = asnMatches[1]
	}

	// Set verdict based on available information
	if country, ok := result.Details["country"].(string); ok {
		// Just store the country info, no verdict decisions
		result.Details["countryCode"] = country
	}

	return result
}
