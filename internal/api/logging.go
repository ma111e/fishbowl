package api

import (
	"github.com/ma111e/fishbowl/internal/logsafe"
	log "github.com/sirupsen/logrus"
)

// logFields keeps sensitive user data (visited URLs) out of the logs unless
// FISHBOWL_DEBUG is set. It delegates to logsafe.Fields; see that package for
// the security rationale.
func logFields(base, sensitive log.Fields) log.Fields {
	return logsafe.Fields(base, sensitive)
}
