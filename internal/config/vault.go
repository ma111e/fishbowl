package config

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Mode identifies how the KEK is derived.
type Mode string

const (
	ModeSeed       Mode = "seed"
	ModePassphrase Mode = "passphrase"

	vaultVersion = 1

	metaFile      = "vault.json"
	seedFile      = "vault.seed" // seed mode only
	apikeysFile   = "apikeys.enc"
	serverKeyFile = "server_key.enc"
)

// ErrKeyNotConfigured is returned by APIKeyInto when neither env nor vault has the key.
var ErrKeyNotConfigured = errors.New("api key not configured")

// ErrLocked is returned when the vault needs unlocking before a sensitive operation.
var ErrLocked = errors.New("vault is locked - run a command that opens it or set the passphrase")

// PassphrasePrompter asks the user (or test) for the unlock passphrase.
// Returning a non-nil error aborts the open.
type PassphrasePrompter func() ([]byte, error)

type vaultMeta struct {
	Version     int    `json:"version"`
	Mode        Mode   `json:"mode"`
	SaltB64     string `json:"salt"`
	VerifierB64 string `json:"verifier"` // AEAD(KEK, kekCanary); validates passphrase without needing apikeys.enc
}

// kekCanary is a fixed plaintext sealed under the KEK at vault creation time.
// On unlock we re-decrypt it; failure proves the KEK is wrong. The string
// itself isn't secret - only the AES-GCM authentication tag matters.
var kekCanary = []byte("fishbowl-vault-kek-v1")

// sealVerifier returns base64(nonce||ciphertext+tag) for the canary under kek.
func sealVerifier(kek []byte) (string, error) {
	blob, err := encrypt(kek, kekCanary)
	if err != nil {
		return "", err
	}
	return encodeBase64(blob), nil
}

// verifyKEK returns nil if verifierB64 decrypts cleanly to kekCanary under kek.
func verifyKEK(kek []byte, verifierB64 string) error {
	if verifierB64 == "" {
		// Pre-verifier vaults (none in the wild) - accept and rely on
		// payload decryption to catch wrong keys.
		return nil
	}
	blob, err := decodeBase64(verifierB64)
	if err != nil {
		return fmt.Errorf("verifier corrupt: %w", err)
	}
	got, err := decrypt(kek, blob)
	if err != nil {
		return fmt.Errorf("wrong passphrase")
	}
	if string(got) != string(kekCanary) {
		return fmt.Errorf("verifier mismatch")
	}
	return nil
}

type vaultEntry struct {
	Key         string `json:"key"`
	Fingerprint string `json:"fp"`
	CreatedAt   string `json:"created_at"`
	LastUsed    string `json:"last_used,omitempty"`
}

type vaultPayload struct {
	Entries map[string]vaultEntry `json:"entries"`
}

// runtime state
var (
	stateMu sync.Mutex
	cached  struct {
		opened bool
		mode   Mode
		salt   []byte
		kek    []byte
		dir    string
	}
)

// dirPath returns the fishbowl config directory. The directory is created
// (mode 0700) when missing.
func dirPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(base, "fishbowl")
	if err := os.MkdirAll(p, 0o700); err != nil {
		return "", err
	}
	return p, nil
}

// VaultPath returns the absolute path of a vault-managed file. Exported so
// callers (CLI, tests) can show a remediation hint without rebuilding the path.
func VaultPath(name string) (string, error) {
	d, err := dirPath()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, name), nil
}

// requirePrivate refuses to read a file whose perms or owner don't match a
// strict 0600/owned-by-current-uid policy. The parent dir is checked for 0700.
func requirePrivate(path string) error {
	if err := requirePrivateDir(filepath.Dir(path)); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%s: not a regular file", path)
	}
	if err := checkFilePerm(info.Mode(), path); err != nil {
		return err
	}
	if err := requireOwner(info, path); err != nil {
		return err
	}
	return nil
}

func requirePrivateDir(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("%s: not a directory", path)
	}
	if err := checkDirPerm(info.Mode(), path); err != nil {
		return err
	}
	if err := requireOwner(info, path); err != nil {
		return err
	}
	return nil
}

// writePrivate atomically writes data to path with mode 0600 + fsync.
func writePrivate(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

// EnsureOpen unlocks the vault for the current process. Safe to call repeatedly.
// In passphrase mode it calls prompter once (or up to 3 times on a wrong passphrase).
func EnsureOpen(prompter PassphrasePrompter) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if cached.opened {
		return nil
	}

	dir, err := dirPath()
	if err != nil {
		return err
	}
	cached.dir = dir

	meta, err := loadMeta()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			// No vault yet — auto-init a seed vault so every vault-backed operation
			// (including server key storage on first request) works immediately.
			return initSeedVault()
		}
		// Metadata exists but is unreadable (corrupt JSON, bad version, bad
		// permissions). Surface it loudly instead of leaving the vault silently
		// closed — otherwise the next vault-backed call fails with a confusing
		// "vault is locked" far from the real cause.
		metaPath, _ := VaultPath(metaFile)
		return fmt.Errorf("vault metadata at %s is unreadable (%w) - delete this file to reset to a fresh seed vault", metaPath, err)
	}

	salt, err := decodeBase64(meta.SaltB64)
	if err != nil || len(salt) != kdfSaltLen {
		return fmt.Errorf("vault metadata corrupt (bad salt)")
	}

	switch meta.Mode {
	case ModeSeed:
		seed, err := readSeedFile()
		if err != nil {
			return fmt.Errorf("read seed: %w", err)
		}
		defer zero(seed)
		kek := deriveSeedKEK(seed, salt)
		if err := verifyKEK(kek, meta.VerifierB64); err != nil {
			zero(kek)
			return fmt.Errorf("seed-mode KEK rejected by verifier - vault may be corrupt or seed file was replaced: %w", err)
		}
		cached.kek = kek
	case ModePassphrase:
		if prompter == nil {
			return ErrLocked
		}
		if err := unlockWithPrompt(prompter, salt, meta.VerifierB64); err != nil {
			return err
		}
	default:
		return fmt.Errorf("vault metadata corrupt (unknown mode %q)", meta.Mode)
	}

	cached.opened = true
	cached.mode = meta.Mode
	cached.salt = salt
	return nil
}

func unlockWithPrompt(prompter PassphrasePrompter, salt []byte, verifierB64 string) error {
	const attempts = 3
	for i := 0; i < attempts; i++ {
		pass, err := prompter()
		if err != nil {
			return err
		}
		kek := derivePassKEK(pass, salt)
		zero(pass)
		if err := verifyKEK(kek, verifierB64); err != nil {
			zero(kek)
			if i == attempts-1 {
				return fmt.Errorf("wrong passphrase")
			}
			fmt.Fprintln(os.Stderr, "wrong passphrase, try again")
			continue
		}
		cached.kek = kek
		return nil
	}
	return fmt.Errorf("wrong passphrase")
}

func loadMeta() (vaultMeta, error) {
	path, err := VaultPath(metaFile)
	if err != nil {
		return vaultMeta{}, err
	}
	if err := requirePrivate(path); err != nil {
		return vaultMeta{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return vaultMeta{}, err
	}
	var m vaultMeta
	if err := json.Unmarshal(data, &m); err != nil {
		return vaultMeta{}, err
	}
	if m.Version != vaultVersion {
		return vaultMeta{}, fmt.Errorf("unsupported vault version %d", m.Version)
	}
	return m, nil
}

func saveMeta(m vaultMeta) error {
	path, err := VaultPath(metaFile)
	if err != nil {
		return err
	}
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return writePrivate(path, data)
}

func readSeedFile() ([]byte, error) {
	path, err := VaultPath(seedFile)
	if err != nil {
		return nil, err
	}
	if err := requirePrivate(path); err != nil {
		return nil, err
	}
	return os.ReadFile(path)
}

// initSeedVault creates the metadata + seed file for a fresh seed-mode vault.
// Caller must hold stateMu.
func initSeedVault() error {
	salt := make([]byte, kdfSaltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	seed := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, seed); err != nil {
		return err
	}
	defer zero(seed)

	kek := deriveSeedKEK(seed, salt)
	verifier, err := sealVerifier(kek)
	if err != nil {
		zero(kek)
		return err
	}
	if err := saveMeta(vaultMeta{
		Version:     vaultVersion,
		Mode:        ModeSeed,
		SaltB64:     encodeBase64(salt),
		VerifierB64: verifier,
	}); err != nil {
		zero(kek)
		return err
	}
	sp, err := VaultPath(seedFile)
	if err != nil {
		zero(kek)
		return err
	}
	if err := writePrivate(sp, seed); err != nil {
		zero(kek)
		return err
	}
	cached.kek = kek
	cached.salt = salt
	cached.mode = ModeSeed
	cached.opened = true
	return nil
}

// loadPayload reads + decrypts the API-keys payload. Returns an empty payload
// (not an error) if no apikeys.enc exists yet.
func loadPayload() (vaultPayload, error) {
	path, err := VaultPath(apikeysFile)
	if err != nil {
		return vaultPayload{}, err
	}
	blob, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return vaultPayload{Entries: map[string]vaultEntry{}}, nil
	}
	if err != nil {
		return vaultPayload{}, err
	}
	if err := requirePrivate(path); err != nil {
		return vaultPayload{}, err
	}
	if len(cached.kek) == 0 {
		return vaultPayload{}, ErrLocked
	}
	plain, err := decrypt(cached.kek, blob)
	if err != nil {
		return vaultPayload{}, fmt.Errorf("decrypt apikeys: %w", err)
	}
	defer zero(plain)
	var p vaultPayload
	if err := json.Unmarshal(plain, &p); err != nil {
		return vaultPayload{}, err
	}
	if p.Entries == nil {
		p.Entries = map[string]vaultEntry{}
	}
	return p, nil
}

func savePayload(p vaultPayload) error {
	if len(cached.kek) == 0 {
		return ErrLocked
	}
	plain, err := json.Marshal(p)
	if err != nil {
		return err
	}
	defer zero(plain)
	blob, err := encrypt(cached.kek, plain)
	if err != nil {
		return err
	}
	path, err := VaultPath(apikeysFile)
	if err != nil {
		return err
	}
	return writePrivate(path, blob)
}

// LoadServerKey decrypts ~/.config/fishbowl/server_key.enc and hands the
// raw PKCS8 bytes to fn, zeroing them on return.
// Returns os.ErrNotExist if no server key is provisioned yet.
func LoadServerKey(fn func([]byte) error) error {
	stateMu.Lock()
	if !cached.opened {
		stateMu.Unlock()
		return ErrLocked
	}
	kek := append([]byte{}, cached.kek...)
	stateMu.Unlock()
	defer zero(kek)

	path, err := VaultPath(serverKeyFile)
	if err != nil {
		return err
	}
	blob, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := requirePrivate(path); err != nil {
		return err
	}
	plain, err := decrypt(kek, blob)
	if err != nil {
		return fmt.Errorf("decrypt server key: %w", err)
	}
	defer zero(plain)
	return fn(plain)
}

// StoreServerKey writes der under the vault KEK.
func StoreServerKey(der []byte) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if !cached.opened {
		return ErrLocked
	}
	blob, err := encrypt(cached.kek, der)
	if err != nil {
		return err
	}
	path, err := VaultPath(serverKeyFile)
	if err != nil {
		return err
	}
	return writePrivate(path, blob)
}

// HasServerKey reports whether the encrypted server key file exists.
func HasServerKey() bool {
	path, err := VaultPath(serverKeyFile)
	if err != nil {
		return false
	}
	_, err = os.Stat(path)
	return err == nil
}

// VaultExists reports whether a vault metadata file is present on disk.
// Used by the CLI to decide between "switch modes" and "initialise fresh".
func VaultExists() bool {
	path, err := VaultPath(metaFile)
	if err != nil {
		return false
	}
	_, err = os.Stat(path)
	return err == nil
}

// InitPassphraseVault creates a brand-new vault in passphrase mode. Errors if
// any vault metadata already exists. Caller must hold no other locks.
func InitPassphraseVault(passphrase []byte) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if cached.opened {
		return fmt.Errorf("vault is already open in this process")
	}
	if _, err := loadMeta(); err == nil {
		return fmt.Errorf("vault already exists - use `vault lock` to switch modes, or `vault passwd` to change passphrase")
	}
	if _, err := dirPath(); err != nil {
		return err
	}
	salt := make([]byte, kdfSaltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	kek := derivePassKEK(passphrase, salt)
	verifier, err := sealVerifier(kek)
	if err != nil {
		zero(kek)
		return err
	}
	if err := saveMeta(vaultMeta{Version: vaultVersion, Mode: ModePassphrase, SaltB64: encodeBase64(salt), VerifierB64: verifier}); err != nil {
		zero(kek)
		return err
	}
	cached.kek = kek
	cached.salt = salt
	cached.mode = ModePassphrase
	cached.opened = true
	return nil
}

// Lock converts a seed-mode vault to passphrase-mode. The seed file is removed.
func Lock(passphrase []byte) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if !cached.opened {
		return ErrLocked
	}
	if cached.mode == ModePassphrase {
		return fmt.Errorf("vault is already passphrase-protected (use `fishbowl api passwd` to change)")
	}
	salt := make([]byte, kdfSaltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	newKEK := derivePassKEK(passphrase, salt)
	if err := reencrypt(newKEK); err != nil {
		zero(newKEK)
		return err
	}
	verifier, err := sealVerifier(newKEK)
	if err != nil {
		zero(newKEK)
		return err
	}
	if err := saveMeta(vaultMeta{Version: vaultVersion, Mode: ModePassphrase, SaltB64: encodeBase64(salt), VerifierB64: verifier}); err != nil {
		zero(newKEK)
		return err
	}
	if sp, err := VaultPath(seedFile); err == nil {
		_ = os.Remove(sp)
	}
	zero(cached.kek)
	cached.kek = newKEK
	cached.mode = ModePassphrase
	cached.salt = salt
	return nil
}

// Unlock converts a passphrase-mode vault back to seed-mode.
func Unlock() error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if !cached.opened {
		return ErrLocked
	}
	if cached.mode == ModeSeed {
		return fmt.Errorf("vault is already seed-mode")
	}
	salt := make([]byte, kdfSaltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	seed := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, seed); err != nil {
		return err
	}
	defer zero(seed)
	newKEK := deriveSeedKEK(seed, salt)
	if err := reencrypt(newKEK); err != nil {
		zero(newKEK)
		return err
	}
	verifier, err := sealVerifier(newKEK)
	if err != nil {
		zero(newKEK)
		return err
	}
	if err := saveMeta(vaultMeta{Version: vaultVersion, Mode: ModeSeed, SaltB64: encodeBase64(salt), VerifierB64: verifier}); err != nil {
		zero(newKEK)
		return err
	}
	sp, err := VaultPath(seedFile)
	if err != nil {
		zero(newKEK)
		return err
	}
	if err := writePrivate(sp, seed); err != nil {
		zero(newKEK)
		return err
	}
	zero(cached.kek)
	cached.kek = newKEK
	cached.mode = ModeSeed
	cached.salt = salt
	return nil
}

// ChangePassphrase rotates the passphrase (passphrase mode only).
func ChangePassphrase(newPass []byte) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if !cached.opened {
		return ErrLocked
	}
	if cached.mode != ModePassphrase {
		return fmt.Errorf("vault is not in passphrase mode")
	}
	salt := make([]byte, kdfSaltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	newKEK := derivePassKEK(newPass, salt)
	if err := reencrypt(newKEK); err != nil {
		zero(newKEK)
		return err
	}
	verifier, err := sealVerifier(newKEK)
	if err != nil {
		zero(newKEK)
		return err
	}
	if err := saveMeta(vaultMeta{Version: vaultVersion, Mode: ModePassphrase, SaltB64: encodeBase64(salt), VerifierB64: verifier}); err != nil {
		zero(newKEK)
		return err
	}
	zero(cached.kek)
	cached.kek = newKEK
	cached.salt = salt
	return nil
}

// reencrypt re-wraps every vault-managed file under newKEK while the lock is held.
// Caller must hold stateMu and ensure cached.kek is still the *current* KEK.
func reencrypt(newKEK []byte) error {
	// API keys
	if payload, err := loadPayload(); err == nil && len(payload.Entries) > 0 {
		plain, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		blob, err := encrypt(newKEK, plain)
		zero(plain)
		if err != nil {
			return err
		}
		p, err := VaultPath(apikeysFile)
		if err != nil {
			return err
		}
		if err := writePrivate(p, blob); err != nil {
			return err
		}
	}
	// Server key — inline decrypt/reencrypt; caller holds stateMu so we cannot
	// call LoadServerKey (it would deadlock trying to re-acquire the mutex).
	if HasServerKey() {
		p, err := VaultPath(serverKeyFile)
		if err != nil {
			return err
		}
		blob, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		if err := requirePrivate(p); err != nil {
			return err
		}
		plain, err := decrypt(cached.kek, blob)
		if err != nil {
			return fmt.Errorf("reencrypt server key: %w", err)
		}
		newBlob, err := encrypt(newKEK, plain)
		zero(plain)
		if err != nil {
			return err
		}
		if err := writePrivate(p, newBlob); err != nil {
			return err
		}
	}
	return nil
}

// ModeNow returns the current vault mode (Seed, Passphrase) or empty if not opened.
func ModeNow() Mode {
	stateMu.Lock()
	defer stateMu.Unlock()
	if !cached.opened {
		return ""
	}
	return cached.mode
}

// fingerprint returns the first 12 hex chars of sha256(key) - non-reversible,
// non-comparable across keys, but stable enough to identify a key for rotation.
func fingerprint(key []byte) string {
	sum := sha256.Sum256(key)
	return hex.EncodeToString(sum[:6])
}

// nowTimestamp is overridable in tests.
var nowTimestamp = func() string { return time.Now().UTC().Format(time.RFC3339) }
