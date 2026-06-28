package engines

import (
	"regexp"
	"strings"

	"github.com/ma111e/fishbowl/internal/data"
	"github.com/ma111e/fishbowl/internal/models"
)

// DomainsEngine implements the Engine interface for domains analysis
type DomainsEngine struct{}

// Name returns the unique name of the engine
func (e *DomainsEngine) Name() string {
	return "domains"
}

// Analyze extracts domains into a typed patch.
func (e *DomainsEngine) Analyze(textContent string) ResultPatch {
	extractedDomains := ExtractDomains(textContent)
	return ResultPatch{Domains: AnalyzeDomains(extractedDomains)}
}

// Process preserves the legacy concrete-engine API used by older tests/callers.
func (e *DomainsEngine) Process(textContent string) interface{} {
	return e.Analyze(textContent).Domains
}

// init registers the Domains engine on package initialization
func init() {
	RegisterEngine(&DomainsEngine{})
}

// ExtractDomains extracts domain names from the provided HTML content
func ExtractDomains(html string) []string {
	// Normalize defanged separators first. This reduces regex ambiguity and helps the engine
	// prefer the longest match (e.g. "cdncheck.it[.]com" -> "cdncheck.it.com" instead of also matching "cdncheck.it").
	normalized := strings.ReplaceAll(html, "[.]", ".")

	// Regex for domain extraction
	// Matches common domain patterns with TLDs
	domainRegex := regexp.MustCompile(`\b([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b`)
	matches := domainRegex.FindAllString(normalized, -1)

	// Deduplicate domains
	uniqueDomains := make(map[string]bool)
	var result []string

	for _, domain := range matches {
		// Convert to lowercase for case-insensitive comparison
		lowerDomain := strings.ToLower(domain)

		if !isAllowedDomainTLD(lowerDomain) {
			continue
		}

		if !uniqueDomains[lowerDomain] {
			uniqueDomains[lowerDomain] = true
			result = append(result, lowerDomain)
		}
	}

	return result
}

func isAllowedDomainTLD(domain string) bool {
	if len(data.AllowedDomainTLDSet) == 0 {
		return true
	}

	// Domain is already expected to be lowercase.
	lastDot := strings.LastIndex(domain, ".")
	if lastDot < 0 || lastDot == len(domain)-1 {
		return false
	}

	tld := domain[lastDot+1:]
	_, ok := data.AllowedDomainTLDSet[tld]
	return ok
}

// AnalyzeDomains creates Domain objects from extracted domain names
func AnalyzeDomains(domains []string) []models.Domain {
	var results []models.Domain

	for _, domain := range domains {
		// Create a basic domain object
		// In a real implementation, this would query domain reputation services
		result := models.Domain{
			Name:     domain,
			Verdict:  "",
			Category: "",
		}

		results = append(results, result)
	}

	return results
}
