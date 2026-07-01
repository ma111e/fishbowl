// Package logsafe helps keep sensitive user data out of the logs unless
// verbose debugging is explicitly enabled.
//
// SECURITY: the backend handles data that reconstructs what a user is doing -
// the URLs of the pages they read and the indicator values (IPs, domains,
// hashes) they investigate. Logging that data by default would leak the user's
// browsing and investigation history to stdout/stderr, system journals, or any
// log-forwarding agent. Route such fields through Fields so they are only
// emitted when config.DebugEnvVar (FISHBOWL_DEBUG) is set.
package logsafe

import (
	"github.com/ma111e/fishbowl/internal/config"
	log "github.com/sirupsen/logrus"
)

// Fields returns base, merged with sensitive only when FISHBOWL_DEBUG is on.
// base carries non-sensitive context (source, verdict, counts, errors) that is
// always safe to log; sensitive carries user data (visited URLs, analyzed
// indicator values) that must stay out of the logs unless debugging.
func Fields(base, sensitive log.Fields) log.Fields {
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
