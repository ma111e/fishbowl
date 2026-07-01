package api

import (
	"net/http"
	"time"

	"github.com/ma111e/fishbowl/internal/analyzer"
	"github.com/ma111e/fishbowl/internal/models"

	log "github.com/sirupsen/logrus"
)

// HandleAnalysis handles security analysis requests
func HandleAnalyzePage(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()
	if handleCORSAndPreflight(w, r) {
		return
	}

	if r.Method != http.MethodPost {
		log.WithFields(log.Fields{
			"remote_addr": r.RemoteAddr,
			"method":      r.Method,
		}).Warn("Method not allowed")
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
		return
	}

	request, body, err := decodeJSON[models.AnalysisRequest](r)
	if err != nil {
		if body == nil {
			log.WithFields(log.Fields{
				"error":       err,
				"remote_addr": r.RemoteAddr,
			}).Error("Failed to read request body")
			http.Error(w, "Failed to read request body", http.StatusBadRequest)
			return
		}
		log.WithFields(log.Fields{
			"error":       err,
			"remote_addr": r.RemoteAddr,
			"body_length": len(body),
		}).Error("Invalid JSON payload")
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	log.WithFields(logFields(nil, log.Fields{
		"url": request.URL,
	})).Info("Analyzing website")

	// Perform comprehensive analysis
	response, err := analyzer.AnalyzePage(request.HTML, request.URL, request.Timestamp)
	if err != nil {
		log.WithFields(logFields(log.Fields{
			"error": err,
		}, log.Fields{
			"url": request.URL,
		})).Error("Analysis failed")
		http.Error(w, "Analysis failed", http.StatusInternalServerError)
		return
	}
	// Preserve the existing server-side timing metric used in logs/response
	response.ProcessingTimeMs = time.Since(startTime).Milliseconds()

	if err := writeJSON(w, http.StatusOK, response); err != nil {
		log.WithFields(logFields(log.Fields{
			"error": err,
		}, log.Fields{
			"url": request.URL,
		})).Error("Error encoding response")
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}

	log.WithFields(logFields(log.Fields{
		"processing_time_ms":   response.ProcessingTimeMs,
		"ip_count":             len(response.IpAddresses),
		"windows_events_count": len(response.WindowsEvents),
		"domains_count":        len(response.Domains),
	}, log.Fields{
		"url": request.URL,
	})).Info("Analysis completed")
}
