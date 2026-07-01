package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/ma111e/fishbowl/internal/models"
	"github.com/ma111e/fishbowl/internal/verdict"
	log "github.com/sirupsen/logrus"
)

// HandleIPVerdictFromDOM handles requests to analyze DOM content for Value verdict
func HandleIPVerdictFromDOM(w http.ResponseWriter, r *http.Request) {
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

	request, body, err := decodeJSON[models.DomAnalysisRequest](r)
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

	log.WithFields(log.Fields{
		"source": request.Source,
	}).Info("Analyzing DOM content for Value reputation")

	entityType := strings.TrimSpace(strings.ToLower(request.EntityType))
	if entityType == "" {
		log.WithFields(log.Fields{
			"remote_addr": r.RemoteAddr,
			"source":      request.Source,
		}).Warn("Missing entityType")
		http.Error(w, "Missing entityType", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(request.Value) == "" {
		log.WithFields(log.Fields{
			"remote_addr": r.RemoteAddr,
			"entity_type": entityType,
			"source":      request.Source,
		}).Warn("Missing value")
		http.Error(w, "Missing value", http.StatusBadRequest)
		return
	}

	// Perform DOM analysis for Value reputation
	response := analyzeReputationFromDom(request, entityType, startTime)

	if err := writeJSON(w, http.StatusOK, response); err != nil {
		log.WithFields(logFields(log.Fields{
			"error": err,
		}, log.Fields{
			"value": request.Value,
		})).Error("Error encoding response")
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}

	log.WithFields(logFields(log.Fields{
		"entity_type":        request.EntityType,
		"source":             request.Source,
		"processing_time_ms": response.ProcessingTimeMs,
		"verdict":            response.Verdict,
	}, log.Fields{
		"value": request.Value,
	})).Info("DOM analysis completed")
}

// analyzeReputationFromDom analyzes the DOM content for Value reputation
func analyzeReputationFromDom(request models.DomAnalysisRequest, entityType string, startTime time.Time) models.DomAnalysisResponse {
	// Use the full DOM content for Value reputation analysis
	// This provides more context for the analysis, including HTML structure and attributes
	domContent := request.Content

	// Create response object
	response := models.DomAnalysisResponse{
		Success:          true,
		Value:            request.Value,
		Source:           request.Source,
		Verdict:          "unknown",
		Details:          make(map[string]interface{}),
		ProcessingTimeMs: 0,
		Timestamp:        time.Now().Unix(),
	}

	// Analyze Value reputation based on source using the full DOM content
	verdictResult := verdict.AnalyzeReputation(request.Value, entityType, request.Source, domContent)

	// Update response with verdict data
	response.Verdict = verdictResult.Verdict
	response.Details = verdictResult.Details

	// Update the processing time
	response.ProcessingTimeMs = time.Since(startTime).Milliseconds()

	return response
}
