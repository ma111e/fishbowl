package models

// DomAnalysisRequest represents a request to analyze DOM content for Value reputation
type DomAnalysisRequest struct {
	Value      string `json:"value"`      // Value address to analyze
	EntityType string `json:"entityType"` // Entity type (ip, domain, asn, ...)
	Source     string `json:"source"`     // Source service name (e.g., virustotal, greynoise)
	Content    string `json:"content"`    // DOM content to analyze
}

// DomAnalysisResponse represents the result of DOM analysis for IP reputation
type DomAnalysisResponse struct {
	Success          bool                   `json:"success"`
	Value            string                 `json:"value"`
	Source           string                 `json:"source"`
	Verdict          string                 `json:"verdict"` // malicious, suspicious, neutral, benign, unknown
	Details          map[string]interface{} `json:"details"` // Source-specific details
	ProcessingTimeMs int64                  `json:"processingTimeMs"`
	Timestamp        int64                  `json:"timestamp"`
}

// VerdictResult represents reputation data from an external service
type VerdictResult struct {
	IP      string                 `json:"ip,omitempty"`
	ASN     string                 `json:"asn,omitempty"`
	Verdict string                 `json:"level"`
	Details map[string]interface{} `json:"details"`
	Source  string                 `json:"source"`
}
