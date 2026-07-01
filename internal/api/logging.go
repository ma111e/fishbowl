package api

import (
	"github.com/ma111e/fishbowl/internal/config"
	log "github.com/sirupsen/logrus"
)

// logFields returns base, merged with sensitive only when FISHBOWL_DEBUG is on.
// Use it to keep user data (visited URLs, analyzed values) out of the logs by
// default. See config.DebugEnvVar for the security rationale.
func logFields(base, sensitive log.Fields) log.Fields {
	if base == nil {
		base = log.Fields{}
	}
	if config.DebugEnabled() {
		for k, v := range sensitive {
			base[k] = v
		}
	}
	return base
}
