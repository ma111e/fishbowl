package api

import (
	"encoding/json"
	"io"
	"net/http"
)

func handleCORSAndPreflight(w http.ResponseWriter, r *http.Request) bool {
	EnableCORS(&w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return true
	}
	return false
}

func decodeJSON[T any](r *http.Request) (T, []byte, error) {
	var v T
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return v, nil, err
	}
	if err := json.Unmarshal(body, &v); err != nil {
		return v, body, err
	}
	return v, body, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, err = w.Write(append(b, '\n'))
	return err
}
