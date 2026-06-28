// Package pairing owns the short-lived enrollment code shared by setup, cli,
// and api/auth. A code authorizes exactly one extension enrollment within a
// 30-second window; the API layer requires it instead of the older TOFU branch.
//
// Invariant: at most one code is valid at any moment. Issue() overwrites any
// pending code, and Consume()/VerifyAttempt lockout clear it - all code
// issuance must go through Issue() to preserve this.
package pairing

import (
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"math/big"
	"sync"
	"time"
)

const (
	codeDigits = 6
	codeTTL    = 30 * time.Second

	// Brute-force lockout: 5 failed attempts within a sliding 30s window
	// invalidates the active code.
	maxFailures   = 5
	failureWindow = 30 * time.Second
)

type state struct {
	code     string
	expires  time.Time
	failures []time.Time
}

var (
	mu      sync.Mutex
	current state
)

// Issue generates a fresh single-use code and replaces any pending one.
func Issue() (code string, expires time.Time, err error) {
	c, err := generate()
	if err != nil {
		return "", time.Time{}, err
	}
	exp := time.Now().Add(codeTTL)

	mu.Lock()
	current = state{code: c, expires: exp}
	mu.Unlock()
	return c, exp, nil
}

// VerifyAttempt reports whether code matches the active, unexpired code, and
// whether the rate-limit lockout fired. On a match the failure counter resets.
// On the fifth miss within the sliding window the active code is consumed and
// locked=true is returned so callers can signal the client to give up.
// Constant-time compare avoids leaking match progress to a local attacker.
func VerifyAttempt(code string) (ok bool, locked bool) {
	mu.Lock()
	defer mu.Unlock()

	if current.code == "" || time.Now().After(current.expires) {
		return false, false
	}
	if subtle.ConstantTimeCompare([]byte(current.code), []byte(code)) == 1 {
		current.failures = nil
		return true, false
	}

	now := time.Now()
	cutoff := now.Add(-failureWindow)
	kept := current.failures[:0]
	for _, t := range current.failures {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	current.failures = append(kept, now)
	if len(current.failures) >= maxFailures {
		current = state{}
		return false, true
	}
	return false, false
}

// Consume clears the current code after a successful enrollment.
func Consume() {
	mu.Lock()
	current = state{}
	mu.Unlock()
}

// Active reports whether an unexpired code exists.
func Active() bool {
	mu.Lock()
	defer mu.Unlock()
	return current.code != "" && time.Now().Before(current.expires)
}

// Snapshot returns the active code and its expiry, or ("", zero) if none.
// Intended for the setup page to render the panel.
func Snapshot() (string, time.Time) {
	mu.Lock()
	defer mu.Unlock()
	if current.code == "" || time.Now().After(current.expires) {
		return "", time.Time{}
	}
	return current.code, current.expires
}

func generate() (string, error) {
	const max = 1_000_000 // 6 digits, leading zeros preserved
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%0*d", codeDigits, n.Int64()), nil
}
