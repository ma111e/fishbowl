package verdict

import (
	"net/http"
	"time"
)

// verdictHTTPClient is a shared HTTP client with a reasonable timeout for all outbound API calls.
var verdictHTTPClient = &http.Client{Timeout: 15 * time.Second}

// Known reputation sources
const (
	SOURCE_VIRUSTOTAL = "virustotal"
	SOURCE_ABUSEIPDB  = "abuseipdb"
	SOURCE_ALIENVAULT = "alienvault"
	SOURCE_GREYNOISE  = "greynoise"
	SOURCE_IPINFO     = "ipinfo"
	SOURCE_WHOIS      = "whois"
	SOURCE_SPUR       = "spur"
	SOURCE_BAZAAR     = "bazaar"
	SOURCE_SHODAN     = "shodan"
)
