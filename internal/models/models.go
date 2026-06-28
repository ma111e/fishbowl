package models

import (
	"time"
)

type SID struct {
	SID         string `json:"sid"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// WindowsEvent represents a Windows Event log entry
type WindowsEvent struct {
	EventID     int    `json:"eventId"`
	Description string `json:"description"`
}

// AnalysisRequest represents the request from the extension
type AnalysisRequest struct {
	HTML      string `json:"html"`
	URL       string `json:"url"`
	Timestamp int64  `json:"timestamp"`
}

// IpAddress represents IP analysis results
type IpAddress struct {
	IP          string   `json:"ip"`
	Verdict     string   `json:"verdict"`  // good, bad, suspicious, unknown, private
	Score       int      `json:"score"`    // 0-100
	Category    string   `json:"category"` // residential, datacenter, mobile, vpn, tor, malware, etc.
	Country     string   `json:"country"`
	ASN         string   `json:"asn"`
	ThreatTypes []string `json:"threatTypes"`
}

// Domain represents Value analysis results
type Domain struct {
	Name        string   `json:"domain"`
	Verdict     string   `json:"verdict"`  // good, bad, suspicious, unknown, private
	Category    string   `json:"category"` // residential, datacenter, mobile, vpn, tor, malware, etc.
	Country     string   `json:"country"`
	ThreatTypes []string `json:"threatTypes"`
}

// ASNumber represents ASN analysis results
type ASNumber struct {
	Number      string  `json:"number"`
	Name        *string `json:"name,omitempty"` // Using pointer for optional values
	Country     *string `json:"country,omitempty"`
	Description *string `json:"description,omitempty"`
	Domain      *string `json:"domain,omitempty"`
}

type Hash struct {
	Kind   string   `json:"kind"`
	Value  string   `json:"value"`
	Badges []string `json:"badges,omitempty"`
}

type FileEntity struct {
	File   string   `json:"file"`
	Badges []string `json:"badges,omitempty"`
}

// AnalysisResponse represents the complete analysis response
type AnalysisResponse struct {
	Success          bool           `json:"success"`
	Timestamp        time.Time      `json:"timestamp"`
	ProcessingTimeMs int64          `json:"processingTimeMs"`
	URL              string         `json:"url"`
	IpAddresses      []IpAddress    `json:"ipAddresses"`
	ASNumbers        []ASNumber     `json:"asNumbers"`
	WindowsEvents    []WindowsEvent `json:"windowsEvents"`
	Domains          []Domain       `json:"domains"`
	SID              []SID          `json:"sids"`
	Hashes           []Hash         `json:"hashes"`
	Files            []FileEntity   `json:"files"`
}
