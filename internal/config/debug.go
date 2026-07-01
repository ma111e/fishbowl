package config

import (
	"os"
	"strings"
)

// DebugEnvVar toggles verbose debug logging in the backend.
//
// SECURITY WARNING: when enabled, the backend logs sensitive user data at
// debug level, including the full URL of every page the extension analyzes -
// i.e. the user's browsing history - and analyzed entity values. These logs go
// to stdout/stderr and may be captured by the terminal, system journals, or
// log-forwarding agents. Enable FISHBOWL_DEBUG only for local troubleshooting;
// never in shared, multi-user, or production environments.
const DebugEnvVar = "FISHBOWL_DEBUG"

// DebugEnabled reports whether FISHBOWL_DEBUG requests verbose debug logging.
// Any non-empty value other than "0"/"false" (case-insensitive) enables it.
func DebugEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(DebugEnvVar)))
	return v != "" && v != "0" && v != "false"
}
