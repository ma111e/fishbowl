package api

import "net/http"

// EnableCORS sets CORS headers. No Access-Control-Allow-Origin/Allow-Headers are
// emitted: the only legitimate caller is the extension background service worker,
// which is CORS-exempt via host_permissions. Omitting the wildcard prevents any
// web page from reading responses from localhost:7158.
func EnableCORS(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
}
