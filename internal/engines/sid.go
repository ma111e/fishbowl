package engines

import (
	"regexp"
	"strings"

	"github.com/ma111e/fishbowl/internal/data"

	log "github.com/sirupsen/logrus"

	"github.com/ma111e/fishbowl/internal/models"
)

// SIDEngine implements the Engine interface for Security Identifier (SID) analysis
type SIDEngine struct{}

// Name returns the unique name of the engine
func (e *SIDEngine) Name() string {
	return "sid"
}

// Analyze extracts SIDs into a typed patch.
func (e *SIDEngine) Analyze(textContent string) ResultPatch {
	// SID pattern regex - matches common SID patterns
	// More specific implementation to avoid false positives with incomplete SIDs
	// Requires S-1- followed by digit(s), then at least one more section with dash and digits
	// The pattern ensures complete SID formats like S-1-5-xxx or S-1-5-32-xxx
	// sidRegex := regexp.MustCompile(`S-1-\d+(-\d+){1,8}$`)
	// Updated regex to allow alphanumeric characters in SID segments (e.g. S-1-5-domain01-572)
	sidRegex := regexp.MustCompile(`S-1-\d(-[a-zA-Z0-9]+)+`)

	matches := sidRegex.FindAllString(textContent, -1)

	// Deduplicate matches
	uniqueSIDs := make(map[string]bool)
	for _, match := range matches {
		uniqueSIDs[match] = true
	}

	// Create result objects
	var results []models.SID
	for uniqueSID := range uniqueSIDs {
		// Look up the SID in the well-known SIDs maps
		sidInfo, found := data.WellKnownSIDs[uniqueSID]
		if !found {
			// Try universal SIDs if not found in well-known
			sidInfo, found = data.UniversalWellKnownSIDs[uniqueSID]
		}

		// If SID wasn't an exact match, try pattern matching for variable SIDs
		if !found {
			// Handle SIDs with variable components like S-1-5-domain-x
			for patternSID, info := range data.WellKnownSIDs {
				if strings.Contains(patternSID, "-domain-") || strings.Contains(patternSID, "-root domain-") || strings.Contains(patternSID, "X-Y") {
					log.WithFields(log.Fields{
						"patternSID": patternSID,
						"uniqueSID":  uniqueSID,
					}).Info("Matching variable SID")
					// Create a regex pattern from the template
					pattern := strings.ReplaceAll(patternSID, "X-Y", `\d+-\d+`)
					pattern = strings.ReplaceAll(pattern, "-domain-", "-[a-zA-Z0-9]+-")
					pattern = strings.ReplaceAll(pattern, "-root domain-", "-[a-zA-Z0-9]+-")
					patternRegex, err := regexp.Compile(pattern)
					if err == nil && patternRegex.MatchString(uniqueSID) {
						sidInfo = info
						sidInfo.SID = uniqueSID // Use the actual SID value
						found = true
						break
					}
				}
			}
		}

		if found {
			results = append(results, models.SID{
				SID:         uniqueSID,
				Description: sidInfo.Name + ": " + sidInfo.Description,
			})
		} else {
			// Generic result for unknown SIDs
			results = append(results, models.SID{
				SID:         uniqueSID,
				Description: "Unknown SID detected",
			})
		}
	}

	return ResultPatch{SID: results}
}

// Process preserves the legacy concrete-engine API used by older tests/callers.
func (e *SIDEngine) Process(textContent string) interface{} {
	return e.Analyze(textContent).SID
}

// init registers the SID engine on package initialization
func init() {
	RegisterEngine(&SIDEngine{})
}
