package analyzer

import (
	"html"
	"regexp"
	"strings"
	"time"

	"github.com/ma111e/fishbowl/internal/engines"
	"github.com/ma111e/fishbowl/internal/models"
)

// AnalyzePage performs the core analysis (HTML -> text -> engines -> response).
// HTTP concerns (decode/validate/encode) are handled in internal/api.
func AnalyzePage(htmlContent string, url string, timestamp int64) (models.AnalysisResponse, error) {
	// Extract only text content from HTML (no scripts, no CSS)
	textContent := extractTextContent(htmlContent)

	// Create analysis response
	response := models.AnalysisResponse{
		Success:          true,
		Timestamp:        time.Now(),
		ProcessingTimeMs: 0, // Will be updated by the HTTP handler
		URL:              url,
		IpAddresses:      []models.IpAddress{},
		WindowsEvents:    []models.WindowsEvent{},
		Domains:          []models.Domain{},
		SID:              []models.SID{},
		Hashes:           []models.Hash{},
		Files:            []models.FileEntity{},
	}

	// Run all registered engines against the text content.
	for _, engine := range engines.GetAllEngines() {
		engine.Analyze(textContent).ApplyTo(&response)
	}

	_ = timestamp

	return response, nil
}

var (
	// Pre-compile regex patterns for better performance
	htmlCommentRegex  = regexp.MustCompile(`(?s)<!--.*?-->`)
	scriptStyleRegex  = regexp.MustCompile(`(?is)<(script|style|noscript|template)(?:\s+[^>]*)?>.*?<\/(?:script|style|noscript|template)>`)
	tagRegex          = regexp.MustCompile(`<[^>]*>`)
	whitespaceRegex   = regexp.MustCompile(`[\s\p{Zs}]+`)
	lineBreakElements = []string{"br", "wbr", "br/"}
)

// blockElements contains all HTML block-level elements that should be replaced with spaces
var blockElements = []string{
	"p", "div", "section", "article", "header", "footer", "nav", "aside",
	"main", "figure", "figcaption", "address", "blockquote", "pre", "ul",
	"ol", "li", "dl", "dt", "dd", "table", "tr", "td", "th", "h1", "h2",
	"h3", "h4", "h5", "h6", "form", "fieldset", "legend", "details",
	"summary", "menu", "menuitem", "hr", "tbody", "thead", "tfoot",
}

// extractTextContent removes all HTML tags and returns only the text content
// while preserving HTML that appears as text content within elements.
// It handles malformed HTML gracefully and is safe to use with any input.
func extractTextContent(htmlContent string) string {
	// Handle empty input
	if htmlContent == "" {
		return ""
	}

	// Make a copy to avoid modifying the original string
	content := strings.Clone(htmlContent)

	// First pass: handle HTML entities
	content = handleHTMLEntities(content)

	// Remove HTML comments
	content = htmlCommentRegex.ReplaceAllString(content, "")

	// Remove script, style, and template tags completely
	content = scriptStyleRegex.ReplaceAllString(content, "")

	// Handle block elements
	content = replaceBlockElements(content)

	// Handle line breaks
	content = replaceLineBreaks(content)

	// Remove all remaining HTML tags
	content = tagRegex.ReplaceAllString(content, "")

	// Normalize whitespace and clean up
	content = normalizeWhitespace(content)

	return content
}

// handleHTMLEntities processes HTML entities in the content
func handleHTMLEntities(content string) string {
	// First, unescape all standard HTML entities
	result := html.UnescapeString(content)

	// Handle any remaining entities that might have been missed
	// This is a fallback for non-standard or malformed entities
	result = strings.NewReplacer(
		"&lt;", "<",
		"&gt;", ">",
		"&amp;", "&",
		"&quot;", "\"",
		"&#39;", "'",
		"&nbsp;", " ",
	).Replace(result)

	return result
}

// replaceBlockElements replaces block-level HTML elements with spaces
func replaceBlockElements(content string) string {
	result := content
	for _, el := range blockElements {
		openTagPattern := regexp.MustCompile(`(?i)<` + el + `(?:\s+[^>]*)?>`)
		closeTagPattern := regexp.MustCompile(`(?i)</` + el + `>`)
		result = openTagPattern.ReplaceAllString(result, " ")
		result = closeTagPattern.ReplaceAllString(result, " ")
	}
	return result
}

// replaceLineBreaks replaces line break elements with spaces
func replaceLineBreaks(content string) string {
	result := content
	for _, el := range lineBreakElements {
		pattern := regexp.MustCompile(`(?i)<` + el + `(?:\s+[^>]*)?>`)
		result = pattern.ReplaceAllString(result, " ")
	}
	return result
}

// normalizeWhitespace normalizes all whitespace in the content
func normalizeWhitespace(content string) string {
	result := whitespaceRegex.ReplaceAllString(content, " ")
	return strings.TrimSpace(result)
}
