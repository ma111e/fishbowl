// Package config persists per-service API keys inside an authenticated
// envelope (AES-256-GCM). The KEK comes from either a machine-bound seed
// file (default, non-interactive) or a user passphrase (opt-in).
//
// See [internal/config/vault.go] for the on-disk format and the EnsureOpen
// lifecycle. Public API:
//
//   - APIKeyServices  - the list of services that accept a key.
//   - HasAPIKey       - presence check (works once the vault is unlocked).
//   - APIKeyInto      - delivers the key bytes to a callback, zeroing on return.
//   - SetKey/DeleteKey - mutate the vault (auto-creates a seed-mode vault if absent).
//   - List            - per-service metadata for `fishbowl api list` (no secret bytes).
//
// Env vars (FISHBOWL_*_KEY) continue to win over the vault - convenient for CI.
package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"
)

// APIKeyServices is the single source of truth for services that accept an API key.
var APIKeyServices = []string{"abuseipdb", "bazaar", "shodan", "virustotal"}

var envOverrides = map[string]string{
	"abuseipdb":  "FISHBOWL_ABUSEIPDB_KEY",
	"bazaar":     "FISHBOWL_BAZAAR_KEY",
	"shodan":     "FISHBOWL_SHODAN_KEY",
	"virustotal": "FISHBOWL_VIRUSTOTAL_KEY",
}

// HasAPIKey reports whether a non-empty key is configured for source.
// Env vars are checked first; otherwise the vault must already be unlocked.
func HasAPIKey(source string) bool {
	if env, ok := envOverrides[source]; ok {
		if strings.TrimSpace(os.Getenv(env)) != "" {
			return true
		}
	}
	p, err := loadPayload()
	if err != nil {
		return false
	}
	entry, ok := p.Entries[source]
	return ok && entry.Key != ""
}

// APIKeyInto runs fn with the decrypted key bytes for source, then zeros the
// buffer. Returns ErrKeyNotConfigured if no env var and no vault entry exists.
// On success it updates the entry's last_used timestamp.
func APIKeyInto(source string, fn func([]byte) error) error {
	if env, ok := envOverrides[source]; ok {
		if v := strings.TrimSpace(os.Getenv(env)); v != "" {
			buf := []byte(v)
			defer zero(buf)
			return fn(buf)
		}
	}
	stateMu.Lock()
	opened := cached.opened
	stateMu.Unlock()
	if !opened {
		// No vault file → treat as "not configured" so callers can fall back.
		if _, err := loadMeta(); errors.Is(err, os.ErrNotExist) {
			return ErrKeyNotConfigured
		}
		return ErrLocked
	}

	p, err := loadPayload()
	if err != nil {
		return err
	}
	entry, ok := p.Entries[source]
	if !ok || entry.Key == "" {
		return ErrKeyNotConfigured
	}
	buf := []byte(entry.Key)
	defer zero(buf)

	// Mark used asynchronously to the caller: we re-save with an updated
	// timestamp. A failure here is logged-but-not-fatal at the caller level —
	// the verdict call should still complete.
	entry.LastUsed = nowTimestamp()
	p.Entries[source] = entry
	if err := savePayload(p); err != nil {
		// Surface but don't block the caller's primary work.
		fmt.Fprintf(os.Stderr, "vault: warning: could not update last_used for %s: %v\n", source, err)
	}

	return fn(buf)
}

// SetKey writes value into the vault under source. If no vault exists yet,
// a fresh seed-mode vault is initialised. value must be non-empty - use
// DeleteKey to remove.
func SetKey(source, value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return fmt.Errorf("api key is empty (use DeleteKey to remove)")
	}
	stateMu.Lock()
	defer stateMu.Unlock()
	if !cached.opened {
		if _, err := loadMeta(); errors.Is(err, os.ErrNotExist) {
			if err := initSeedVault(); err != nil {
				return err
			}
		} else {
			// Vault file exists but isn't open - caller must EnsureOpen first.
			return ErrLocked
		}
	}
	p, err := loadPayload()
	if err != nil {
		return err
	}
	now := nowTimestamp()
	entry := p.Entries[source]
	if entry.CreatedAt == "" {
		entry.CreatedAt = now
	}
	entry.Key = value
	entry.Fingerprint = "sha256:" + fingerprint([]byte(value))
	p.Entries[source] = entry
	return savePayload(p)
}

// DeleteKey removes source's entry. Returns nil if the entry didn't exist.
func DeleteKey(source string) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if !cached.opened {
		return ErrLocked
	}
	p, err := loadPayload()
	if err != nil {
		return err
	}
	if _, ok := p.Entries[source]; !ok {
		return nil
	}
	delete(p.Entries, source)
	return savePayload(p)
}

// KeyInfo is the public, secret-free view of a vault entry - used by `api list`.
type KeyInfo struct {
	Source      string
	Fingerprint string
	CreatedAt   string
	LastUsed    string
}

// List returns one KeyInfo per service in APIKeyServices, with empty fields
// for unset services. Never includes the secret bytes.
func List() ([]KeyInfo, error) {
	p, err := loadPayload()
	if err != nil {
		return nil, err
	}
	out := make([]KeyInfo, 0, len(APIKeyServices))
	for _, s := range APIKeyServices {
		entry := p.Entries[s]
		out = append(out, KeyInfo{
			Source:      s,
			Fingerprint: entry.Fingerprint,
			CreatedAt:   entry.CreatedAt,
			LastUsed:    entry.LastUsed,
		})
	}
	return out, nil
}

// EnvOverride returns the env var name for source, or "" if none.
func EnvOverride(source string) string { return envOverrides[source] }

// --- base64 helpers (RFC 4648 std encoding, no padding fiddling) -------------

func encodeBase64(b []byte) string          { return base64.StdEncoding.EncodeToString(b) }
func decodeBase64(s string) ([]byte, error) { return base64.StdEncoding.DecodeString(s) }
