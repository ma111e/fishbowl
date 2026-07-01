package verdict

import (
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/ma111e/fishbowl/internal/logsafe"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

// Ipinfo-specific analyzer
func analyzeIpinfoContent(ip string, content string) models.VerdictResult {
	result := models.VerdictResult{
		IP:      ip,
		Source:  SOURCE_IPINFO,
		Verdict: "unknown", // Default for Value privacy info
		Details: make(map[string]interface{}),
	}

	// Parse the HTML content
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		log.WithFields(logsafe.Fields(log.Fields{
			"error":  err,
			"source": SOURCE_IPINFO,
		}, log.Fields{
			"ip": ip,
		})).Error("Failed to parse HTML content")
		return result
	}

	// Parse summary block information
	parseIpinfoSummaryBlock(doc, &result)

	// Privacy features map to track which features are detected
	privacyFeatures := map[string]bool{
		"vpn":     false,
		"proxy":   false,
		"tor":     false,
		"relay":   false,
		"hosting": false,
	}

	// Look for privacy information in the restricted-element div
	doc.Find(".restricted-element .d-flex").Each(func(i int, s *goquery.Selection) {
		// Get the feature name
		featureName := strings.ToLower(strings.TrimSpace(s.Find(".ml-2").Text()))

		// Check if this is one of our tracked features
		if _, exists := privacyFeatures[featureName]; exists {
			// Check if the image has opacity-50 class (which means feature is disabled)
			imgSelection := s.Find("img")
			classValue, _ := imgSelection.Attr("class")
			isRightImg := strings.Contains(imgSelection.AttrOr("src", ""), "right-big.svg")

			// If it's a right image without opacity class, the feature is enabled
			privacyFeatures[featureName] = isRightImg && !strings.Contains(classValue, "opacity-50")
		}
	})

	// Add each privacy feature as a top-level key in Details
	for feature, value := range privacyFeatures {
		result.Details[feature] = value
	}

	// Parse tags from the tags section
	parseTags(doc, &result)

	return result
}

// parseTags extracts tags from the tags section on the Ipinfo page
func parseTags(doc *goquery.Document, result *models.VerdictResult) {
	// Find the tags list
	doc.Find("ul.tags.mb-0 a.tag").Each(func(i int, s *goquery.Selection) {
		// Extract the tag name from the label span
		tagName := strings.ToLower(strings.TrimSpace(s.Find("span.label").Text()))
		if tagName != "" {
			// Add tag to tags list if it doesn't exist
			tagsList, exists := result.Details["tags"]
			if !exists {
				tagsList = []string{}
			}

			// Append tag to list
			result.Details["tags"] = append(tagsList.([]string), tagName)

			// Also set the tag as a boolean flag at the top level
			// This makes it consistent with the privacy features
			result.Details[tagName] = true
		}
	})

	// Log the tags we found
	if tags, exists := result.Details["tags"]; exists && len(tags.([]string)) > 0 {
		log.WithFields(logsafe.Fields(log.Fields{
			"source": SOURCE_IPINFO,
			"tags":   tags,
		}, log.Fields{
			"ip": result.IP,
		})).Info("Extracted Ipinfo tags")
	}
}

// analyzeIpinfoAsnContent parses IPinfo ASN pages (e.g. https://ipinfo.io/AS43012).
// The page layout differs from IP pages: it has an ASN summary table with fields like
// Country, Website, Hosted domains, IPv4/IPv6 addresses, ASN type, Registry, Allocated, Updated.
func analyzeIpinfoAsnContent(asn string, content string) models.VerdictResult {
	result := models.VerdictResult{
		ASN:     asn,
		Source:  SOURCE_IPINFO,
		Verdict: "unknown",
		Details: make(map[string]interface{}),
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		log.WithFields(log.Fields{
			"error":  err,
			"asn":    asn,
			"source": SOURCE_IPINFO,
		}).Error("Failed to parse HTML content for ASN")
		return result
	}

	// Extract ASN name from the heading: "<h2>AS43012 - Gastabudstaden AB</h2>"
	heading := strings.TrimSpace(doc.Find("#summary h2").Text())
	if heading != "" {
		// Split on " - " (en-dash with surrounding spaces) or " - " (plain dash)
		for _, sep := range []string{" - ", " - "} {
			parts := strings.SplitN(heading, sep, 2)
			if len(parts) == 2 {
				result.Details["asnName"] = strings.TrimSpace(parts[1])
				break
			}
		}
	}

	// Parse the ASN summary table
	parseIpinfoAsnSummaryBlock(doc, &result)

	// Parse tags (reuses the same tags section structure as IP pages)
	parseTags(doc, &result)

	// Extract country from the location tag link (first <a> in .tags with a flag)
	doc.Find("div.tags > a.tag").Each(func(i int, s *goquery.Selection) {
		flagEl := s.Find("i.flag")
		if flagEl.Length() == 0 {
			return
		}
		// Extract country code from the flag class (e.g. "flag flag-se")
		flagClass, _ := flagEl.Attr("class")
		for _, cls := range strings.Fields(flagClass) {
			if strings.HasPrefix(cls, "flag-") {
				code := strings.TrimPrefix(cls, "flag-")
				if code != "" {
					result.Details["countryCode"] = strings.ToUpper(code)
				}
			}
		}
	})

	log.WithFields(log.Fields{
		"asn":     asn,
		"source":  SOURCE_IPINFO,
		"details": result.Details,
	}).Info("IPinfo ASN analysis complete")

	return result
}

// parseIpinfoAsnSummaryBlock extracts fields from the ASN summary table on the IPinfo ASN page
func parseIpinfoAsnSummaryBlock(doc *goquery.Document, result *models.VerdictResult) {
	doc.Find("#summary table tbody tr").Each(func(i int, row *goquery.Selection) {
		field := strings.TrimSpace(row.Find("td:first-child span.peer").Text())
		valueTd := row.Find("td:last-child")
		value := strings.TrimSpace(valueTd.Text())

		switch strings.ToLower(field) {
		case "name":
			if value != "" {
				result.Details["asnName"] = value
			}

		case "country":
			if a := valueTd.Find("a[href*='/countries/']"); a.Length() > 0 {
				if name := strings.TrimSpace(a.Text()); name != "" {
					result.Details["country"] = name
				}
				if href, ok := a.Attr("href"); ok {
					parts := strings.Split(href, "/")
					if code := parts[len(parts)-1]; code != "" {
						result.Details["countryCode"] = strings.ToUpper(code)
					}
				}
			}

		case "website":
			// Extract the domain text from the link
			linkText := strings.TrimSpace(valueTd.Find("a span, a").First().Text())
			if linkText != "" {
				result.Details["website"] = linkText
			} else if value != "" {
				result.Details["website"] = value
			}

		case "hosted domains":
			cleaned := strings.ReplaceAll(value, ",", "")
			hostCount, err := strconv.Atoi(strings.TrimSpace(cleaned))
			if err == nil {
				result.Details["hostedDomains"] = hostCount
			} else {
				result.Details["hostedDomains"] = value
			}

		case "ipv4 addresses":
			cleaned := strings.ReplaceAll(value, ",", "")
			count, err := strconv.Atoi(strings.TrimSpace(cleaned))
			if err == nil {
				result.Details["ipv4Count"] = count
			} else {
				result.Details["ipv4Count"] = value
			}

		case "ipv6 addresses":
			// IPv6 count can be very large (scientific notation in display).
			// Store the raw display text.
			result.Details["ipv6Count"] = value

		case "as type":
			result.Details["asnType"] = value

		case "registry":
			result.Details["registry"] = strings.ToUpper(strings.TrimSpace(value))

		case "allocated":
			result.Details["allocated"] = value

		case "updated":
			result.Details["updated"] = value
		}
	})
}

// parseIpinfoSummaryBlock extracts information from the summary block on the Ipinfo page
func parseIpinfoSummaryBlock(doc *goquery.Document, result *models.VerdictResult) {
	doc.Find("#summary table tbody tr").Each(func(i int, row *goquery.Selection) {
		// Label is in span.peer (the tooltip-trigger span), not the surrounding tooltip divs
		field := strings.TrimSpace(row.Find("td:first-child span.peer").Text())
		valueTd := row.Find("td:last-child")
		value := strings.TrimSpace(valueTd.Text())

		switch strings.ToLower(field) {
		case "location":
			// Extract country code from the /countries/<code> link
			if a := valueTd.Find("a[href*='/countries/']"); a.Length() > 0 {
				if href, ok := a.Attr("href"); ok {
					parts := strings.Split(href, "/")
					if code := parts[len(parts)-1]; code != "" {
						result.Details["countryCode"] = strings.ToUpper(code)
					}
				}
			}
			result.Details["location"] = value

		case "asn":
			// Remove inline tooltips (e.g. RPKI validity tooltip) before reading text
			valueTdClone := valueTd.Clone()
			valueTdClone.Find("[role='tooltip']").Remove()
			cleanValue := strings.TrimSpace(valueTdClone.Text())

			if asnLink := valueTd.Find("a").First(); asnLink.Length() > 0 {
				result.Details["asn"] = strings.TrimSpace(asnLink.Text())
			}
			// Name follows the em dash separator " - "
			if _, after, found := strings.Cut(cleanValue, "—"); found {
				result.Details["asnName"] = strings.TrimSpace(after)
			}

		case "hostname":
			// "—" indicates no hostname in the new layout
			if value != "—" && value != "" {
				result.Details["hostname"] = value
			} else {
				result.Details["hostname"] = ""
			}

		case "range":
			result.Details["ipRange"] = value

		case "company":
			result.Details["company"] = value

		case "hosted domains":
			cleaned := strings.ReplaceAll(value, ",", "")
			if hostCount, err := strconv.Atoi(strings.TrimSpace(cleaned)); err == nil {
				result.Details["hostedDomains"] = hostCount
			} else {
				result.Details["hostedDomains"] = 0
			}

		case "privacy":
			result.Details["isPrivate"] = strings.Contains(strings.ToLower(value), "true")

		case "anycast":
			result.Details["anycast"] = strings.Contains(strings.ToLower(value), "true")

		case "as type":
			result.Details["asnType"] = value

		case "abuse contact":
			if abuseMail := strings.TrimSpace(valueTd.Find("a").Text()); abuseMail != "" {
				result.Details["abuseContact"] = abuseMail
			} else {
				result.Details["abuseContact"] = value
			}
		}
	})
}
