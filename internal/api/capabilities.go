package api

import (
	"net/http"

	"github.com/ma111e/fishbowl/internal/config"
)

// HandleCapabilities reports which API-key-compatible services have a key configured,
// so the extension can decide API mode vs scrape mode without ever seeing the keys.
func HandleCapabilities(w http.ResponseWriter, r *http.Request) {
	if handleCORSAndPreflight(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
		return
	}

	caps := make(map[string]bool, len(config.APIKeyServices))
	for _, s := range config.APIKeyServices {
		caps[s] = config.HasAPIKey(s)
	}
	_ = writeJSON(w, http.StatusOK, caps)
}
