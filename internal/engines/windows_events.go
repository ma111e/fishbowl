package engines

import (
	"regexp"
	"strconv"

	"github.com/ma111e/fishbowl/internal/data"
	"github.com/ma111e/fishbowl/internal/models"
)

// WindowsEventsEngine implements the Engine interface for Windows event analysis
type WindowsEventsEngine struct{}

// Name returns the unique name of the engine
func (e *WindowsEventsEngine) Name() string {
	return "windows_events"
}

// Analyze extracts Windows event IDs into a typed patch.
func (e *WindowsEventsEngine) Analyze(textContent string) ResultPatch {
	return ResultPatch{WindowsEvents: AnalyseWindowsEvents(textContent)}
}

// Process preserves the legacy concrete-engine API used by older tests/callers.
func (e *WindowsEventsEngine) Process(textContent string) interface{} {
	return e.Analyze(textContent).WindowsEvents
}

// init registers the Windows Events engine on package initialization
func init() {
	RegisterEngine(&WindowsEventsEngine{})
}

// AnalyseWindowsEvents extracts Windows Event IDs from the provided HTML content
func AnalyseWindowsEvents(html string) []models.WindowsEvent {
	var events []models.WindowsEvent

	// Define regex to find potential Windows event IDs in the HTML
	// Looking for patterns like "Event ID: 4624" or "EventID=4688" or similar formats
	eventRegex := regexp.MustCompile(`(?i)([0-9]{4})`)
	matches := eventRegex.FindAllStringSubmatchIndex(html, -1)

	// Track unique event IDs to avoid duplicates
	uniqueEvents := make(map[int]struct{})

	for _, match := range matches {
		// FindAllStringSubmatchIndex returns pairs of indices.
		// match[0],match[1] = full match range, match[2],match[3] = first capturing group range.
		if len(match) >= 4 {
			start := match[2]
			end := match[3]
			if start < 0 || end < 0 || start >= end {
				continue
			}

			// Exclude cases like "-4624-" or ":4624:" (immediately surrounded by '-' or ':').
			if start-1 >= 0 {
				prev := html[start-1]
				if prev == '-' || prev == ':' {
					continue
				}
			}
			if end < len(html) {
				next := html[end]
				if next == '-' || next == ':' {
					continue
				}
			}

			// Convert the matched ID to integer
			eventID, err := strconv.Atoi(html[start:end])
			if err != nil {
				continue
			}

			// Skip if we've already added this event ID
			if _, exists := uniqueEvents[eventID]; exists {
				continue
			}
			uniqueEvents[eventID] = struct{}{}

			// Convert the event ID to string for lookup in the WindowsEvent map
			eventIDStr := strconv.Itoa(eventID)

			// Get the event description from the WindowsEvent map if available
			if eventDesc, exists := data.WindowsEventCodes[eventIDStr]; exists {
				events = append(events, models.WindowsEvent{
					EventID:     eventID,
					Description: eventDesc,
				})
			}
		}
	}

	return events
}
