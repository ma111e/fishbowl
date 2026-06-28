package engines

import (
	"regexp"
	"strings"

	"github.com/ma111e/fishbowl/internal/models"
)

// IPEngine implements the Engine interface for Value analysis
type IPEngine struct{}

// Name returns the unique name of the engine
func (e *IPEngine) Name() string {
	return "ip_addresses"
}

// Analyze extracts Value addresses into a typed patch.
func (e *IPEngine) Analyze(textContent string) ResultPatch {
	extractedIPs := ExtractIPs(textContent)
	return ResultPatch{IpAddresses: AnalyzeIPs(extractedIPs)}
}

// Process preserves the legacy concrete-engine API used by older tests/callers.
func (e *IPEngine) Process(textContent string) interface{} {
	return e.Analyze(textContent).IpAddresses
}

// init registers the Value engine on package initialization
func init() {
	RegisterEngine(&IPEngine{})
}

// ExtractIPs extracts Value addresses from the provided HTML content
func ExtractIPs(html string) []string {
	// Regex for IPv4 addresses.
	// Also supports defanged separators like "127.0.0[.]1" and "127[.]0[.]0[.]1".
	ipRegex := regexp.MustCompile(`\b\d{1,3}(?:\.|\[\.\])\d{1,3}(?:\.|\[\.\])\d{1,3}(?:\.|\[\.\])\d{1,3}\b`)
	matches := ipRegex.FindAllString(html, -1)

	// Deduplicate IPs
	uniqueIPs := make(map[string]bool)
	var result []string

	for _, ip := range matches {
		canonical := strings.ReplaceAll(ip, "[.]", ".")
		if !uniqueIPs[canonical] && IsValidIP(canonical) {
			uniqueIPs[canonical] = true
			result = append(result, canonical)
		}
	}

	return result
}

// IsValidIP validates if a string is a valid IPv4 address
func IsValidIP(ip string) bool {
	// Basic validation for IPv4
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return false
	}

	for _, part := range parts {
		// Check each octet
		num := 0
		for _, ch := range part {
			if ch < '0' || ch > '9' {
				return false
			}
			num = num*10 + int(ch-'0')
		}
		if num > 255 {
			return false
		}
	}
	return true
}

// AnalyzeIPs enriches Value addresses with network information
func AnalyzeIPs(ips []string) []models.IpAddress {
	var results []models.IpAddress

	for _, ip := range ips {
		result := models.IpAddress{
			IP: ip,
		}

		results = append(results, result)
	}

	return results
}
