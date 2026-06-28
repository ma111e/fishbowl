package engines

import (
	"regexp"

	"github.com/ma111e/fishbowl/internal/models"
)

// ASNEngine implements the Engine interface for ASN analysis
type ASNEngine struct{}

// Name returns the unique name of the engine
func (e *ASNEngine) Name() string {
	return "asn"
}

// Analyze extracts ASN numbers into a typed patch.
func (e *ASNEngine) Analyze(textContent string) ResultPatch {
	extractedASNs := ExtractASNs(textContent)
	return ResultPatch{ASNumbers: AnalyzeASNs(extractedASNs)}
}

// Process preserves the legacy concrete-engine API used by older tests/callers.
func (e *ASNEngine) Process(textContent string) interface{} {
	return e.Analyze(textContent).ASNumbers
}

// init registers the ASN engine on package initialization
func init() {
	RegisterEngine(&ASNEngine{})
}

// ExtractASNs extracts ASN numbers from the provided HTML content
// ASN format is AS followed by a number (e.g., AS123)
func ExtractASNs(html string) []string {
	// Regex to match ASN (AS followed by a number)
	asnRegex := regexp.MustCompile(`\bAS\s?\d{1,6}\b`)
	matches := asnRegex.FindAllString(html, -1)

	// Deduplicate ASNs
	uniqueASNs := make(map[string]bool)
	var result []string

	for _, asn := range matches {
		if !uniqueASNs[asn] {
			uniqueASNs[asn] = true
			result = append(result, asn)
		}
	}

	return result
}

// AnalyzeASNs processes ASN numbers and returns enriched data
func AnalyzeASNs(asns []string) []models.ASNumber {
	var results []models.ASNumber

	for _, asn := range asns {
		// Keep the full ASN including the AS prefix
		// Using pointers for nullable fields as per user requirements
		result := models.ASNumber{
			Number: asn, // Store the full ASN (e.g. "AS12345")
			// Name, Country, Description, and Domain would typically be populated
			// by a lookup service or database. For now they're left as nil pointers
		}

		results = append(results, result)
	}

	return results
}
