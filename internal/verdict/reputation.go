package verdict

import (
	"errors"
	"strings"

	"github.com/ma111e/fishbowl/internal/config"
	"github.com/ma111e/fishbowl/internal/logsafe"
	"github.com/ma111e/fishbowl/internal/models"
	log "github.com/sirupsen/logrus"
)

const anyEntityType = "*"

type reputationParserKey struct {
	entityType string
	source     string
}

type reputationRequest struct {
	value      string
	entityType string
	source     string
	domContent string
}

type reputationParser func(reputationRequest) models.VerdictResult

var reputationParsers = map[reputationParserKey]reputationParser{
	{entityType: anyEntityType, source: SOURCE_ABUSEIPDB}: func(request reputationRequest) models.VerdictResult {
		var apiResult models.VerdictResult
		err := config.APIKeyInto(SOURCE_ABUSEIPDB, func(key []byte) error {
			apiResult = analyzeAbuseIPDBAPI(request.value, key)
			return nil
		})
		if err == nil {
			return apiResult
		}
		if !errors.Is(err, config.ErrKeyNotConfigured) {
			log.WithError(err).WithField("source", SOURCE_ABUSEIPDB).Warn("Vault read failed, falling back to DOM parser")
		}
		return analyzeAbuseIPDBContent(request.value, request.domContent)
	},
	{entityType: anyEntityType, source: SOURCE_VIRUSTOTAL}: func(request reputationRequest) models.VerdictResult {
		if !vtSupportsAPIMode(request.entityType) {
			return analyzeVirusTotalContent(request.value, request.domContent)
		}
		var apiResult models.VerdictResult
		err := config.APIKeyInto(SOURCE_VIRUSTOTAL, func(key []byte) error {
			apiResult = analyzeVirusTotalAPI(request.value, request.entityType, key)
			return nil
		})
		if err == nil {
			return apiResult
		}
		if !errors.Is(err, config.ErrKeyNotConfigured) {
			log.WithError(err).WithField("source", SOURCE_VIRUSTOTAL).Warn("Vault read failed, falling back to DOM parser")
		}
		return analyzeVirusTotalContent(request.value, request.domContent)
	},
	{entityType: anyEntityType, source: SOURCE_ALIENVAULT}: func(request reputationRequest) models.VerdictResult {
		return analyzeAlienVaultContent(request.value, request.domContent)
	},
	{entityType: anyEntityType, source: SOURCE_GREYNOISE}: func(request reputationRequest) models.VerdictResult {
		return analyzeGreyNoiseContent(request.value, request.domContent)
	},
	{entityType: "asn", source: SOURCE_IPINFO}: func(request reputationRequest) models.VerdictResult {
		return analyzeIpinfoAsnContent(request.value, request.domContent)
	},
	{entityType: anyEntityType, source: SOURCE_IPINFO}: func(request reputationRequest) models.VerdictResult {
		return analyzeIpinfoContent(request.value, request.domContent)
	},
	{entityType: anyEntityType, source: SOURCE_WHOIS}: func(request reputationRequest) models.VerdictResult {
		return analyzeWhoisContent(request.value, request.domContent)
	},
	{entityType: anyEntityType, source: SOURCE_SPUR}: func(request reputationRequest) models.VerdictResult {
		return analyzeSpurContent(request.value, request.domContent)
	},
	{entityType: anyEntityType, source: SOURCE_BAZAAR}: func(request reputationRequest) models.VerdictResult {
		var apiResult models.VerdictResult
		err := config.APIKeyInto(SOURCE_BAZAAR, func(key []byte) error {
			apiResult = analyzeBazaarAPI(request.value, key)
			return nil
		})
		if err == nil {
			return apiResult
		}
		if errors.Is(err, config.ErrKeyNotConfigured) {
			// Bazaar accepts unauthenticated requests for some endpoints.
			return analyzeBazaarAPI(request.value, nil)
		}
		log.WithError(err).WithField("source", SOURCE_BAZAAR).Warn("Vault read failed, calling unauthenticated")
		return analyzeBazaarAPI(request.value, nil)
	},
	{entityType: anyEntityType, source: SOURCE_SHODAN}: func(request reputationRequest) models.VerdictResult {
		var apiResult models.VerdictResult
		err := config.APIKeyInto(SOURCE_SHODAN, func(key []byte) error {
			apiResult = analyzeShodanAPI(request.value, key)
			return nil
		})
		if err == nil {
			return apiResult
		}
		// Shodan is API-only (no DOM-scraping fallback); without a key there
		// is nothing to query, so report the result as unknown.
		if !errors.Is(err, config.ErrKeyNotConfigured) {
			log.WithError(err).WithField("source", SOURCE_SHODAN).Warn("Vault read failed")
		}
		return models.VerdictResult{
			Source:  SOURCE_SHODAN,
			IP:      request.value,
			Verdict: "unknown",
			Details: map[string]interface{}{"status": "key_not_configured"},
		}
	},
}

// AnalyzeReputation analyzes the DOM content to extract reputation data for a value.
// entityType is currently advisory (ip, domain, ...). Most parsers operate on DOM content
// and do not need to differentiate by entity type yet.
// API keys for services that call external APIs are read from the server config, not the request.
func AnalyzeReputation(value string, entityType string, source string, domContent string) models.VerdictResult {
	t := strings.TrimSpace(strings.ToLower(entityType))
	if t == "" {
		log.WithFields(logsafe.Fields(log.Fields{
			"source": source,
		}, log.Fields{
			"value": value,
		})).Warn("Missing entityType for reputation analysis")
	}

	log.WithFields(logsafe.Fields(log.Fields{
		"entity_type": t,
		"source":      source,
	}, log.Fields{
		"value": value,
	})).Info("Analyzing for reputation")

	src := strings.TrimSpace(strings.ToLower(source))
	request := reputationRequest{
		value:      value,
		entityType: t,
		source:     src,
		domContent: domContent,
	}

	if parser, ok := reputationParsers[reputationParserKey{entityType: t, source: src}]; ok {
		return parser(request)
	}
	if parser, ok := reputationParsers[reputationParserKey{entityType: anyEntityType, source: src}]; ok {
		return parser(request)
	}

	return models.VerdictResult{
		Source:  source,
		Verdict: "unknown",
		Details: map[string]interface{}{
			"value":      value,
			"entityType": t,
		},
	}
}
