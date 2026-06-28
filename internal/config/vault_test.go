package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// withTempVault redirects UserConfigDir to a fresh tmp dir, resets cached state,
// and restores everything on cleanup.
func withTempVault(t *testing.T) string {
	t.Helper()
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)
	// macOS uses HOME/Library/Application Support; Setenv HOME covers it too.
	t.Setenv("HOME", tmp)

	stateMu.Lock()
	cached.opened = false
	cached.mode = ""
	cached.salt = nil
	zero(cached.kek)
	cached.kek = nil
	cached.dir = ""
	stateMu.Unlock()

	return tmp
}

func TestSetKeyAutoInitsSeedVault(t *testing.T) {
	withTempVault(t)
	if err := SetKey("virustotal", "test-key-1"); err != nil {
		t.Fatalf("SetKey: %v", err)
	}
	if !HasAPIKey("virustotal") {
		t.Fatal("HasAPIKey false after SetKey")
	}
	// File should be encrypted - raw bytes must not contain the key.
	path, _ := VaultPath(apikeysFile)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if containsBytes(raw, []byte("test-key-1")) {
		t.Fatal("apikeys.enc contains the plaintext key - encryption broken")
	}
	// Seed file and meta file should exist with mode 0600.
	for _, f := range []string{metaFile, seedFile, apikeysFile} {
		p, _ := VaultPath(f)
		info, err := os.Stat(p)
		if err != nil {
			t.Fatalf("stat %s: %v", f, err)
		}
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("%s mode = %o, want 0600", f, info.Mode().Perm())
		}
	}
}

func TestAPIKeyIntoRoundTripAndZero(t *testing.T) {
	withTempVault(t)
	if err := SetKey("abuseipdb", "secret-value-xyz"); err != nil {
		t.Fatal(err)
	}

	var snapshot []byte
	err := APIKeyInto("abuseipdb", func(b []byte) error {
		if string(b) != "secret-value-xyz" {
			t.Fatalf("got %q want secret-value-xyz", b)
		}
		snapshot = b // capture the slice header so we can inspect it after defer zero
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for i, by := range snapshot {
		if by != 0 {
			t.Fatalf("byte %d not zeroed: %x", i, by)
		}
	}
}

func TestAPIKeyIntoEnvPrecedence(t *testing.T) {
	withTempVault(t)
	if err := SetKey("virustotal", "from-vault"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("FISHBOWL_VIRUSTOTAL_KEY", "from-env")
	err := APIKeyInto("virustotal", func(b []byte) error {
		if string(b) != "from-env" {
			t.Fatalf("got %q, want env value", b)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestAPIKeyIntoNotConfigured(t *testing.T) {
	withTempVault(t)
	if err := APIKeyInto("virustotal", func(b []byte) error { return nil }); !errors.Is(err, ErrKeyNotConfigured) {
		t.Fatalf("got %v, want ErrKeyNotConfigured", err)
	}
}

func TestDeleteKey(t *testing.T) {
	withTempVault(t)
	if err := SetKey("bazaar", "k"); err != nil {
		t.Fatal(err)
	}
	if err := DeleteKey("bazaar"); err != nil {
		t.Fatal(err)
	}
	if HasAPIKey("bazaar") {
		t.Fatal("key still present after DeleteKey")
	}
}

func TestPermissionDriftRejected(t *testing.T) {
	withTempVault(t)
	if err := SetKey("virustotal", "k"); err != nil {
		t.Fatal(err)
	}
	path, _ := VaultPath(apikeysFile)
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := loadPayload(); err == nil {
		t.Fatal("loadPayload accepted 0644 file - perm check failed")
	}
}

func TestList(t *testing.T) {
	withTempVault(t)
	if err := SetKey("virustotal", "vk"); err != nil {
		t.Fatal(err)
	}
	if err := SetKey("abuseipdb", "ak"); err != nil {
		t.Fatal(err)
	}
	infos, err := List()
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]KeyInfo{}
	for _, i := range infos {
		byName[i.Source] = i
	}
	if got := byName["virustotal"].Fingerprint; got == "" || got == byName["abuseipdb"].Fingerprint {
		t.Fatalf("virustotal fp=%q abuseipdb fp=%q - collision or empty", got, byName["abuseipdb"].Fingerprint)
	}
	if byName["bazaar"].Fingerprint != "" {
		t.Fatalf("bazaar should be empty, got %+v", byName["bazaar"])
	}
}

func TestLockUnlockRoundTrip(t *testing.T) {
	withTempVault(t)
	if err := SetKey("virustotal", "rotated-key"); err != nil {
		t.Fatal(err)
	}
	pass := []byte("hunter2-correct-horse")

	if err := Lock(append([]byte{}, pass...)); err != nil {
		t.Fatal(err)
	}
	if ModeNow() != ModePassphrase {
		t.Fatalf("mode after Lock = %q", ModeNow())
	}
	// Seed file must be gone.
	if sp, _ := VaultPath(seedFile); fileExists(sp) {
		t.Fatal("seed file still present after Lock")
	}

	// Simulate restart: clear cache then reopen with the passphrase.
	stateMu.Lock()
	cached.opened = false
	zero(cached.kek)
	cached.kek = nil
	stateMu.Unlock()
	prompter := func() ([]byte, error) { return append([]byte{}, pass...), nil }
	if err := EnsureOpen(prompter); err != nil {
		t.Fatalf("EnsureOpen passphrase: %v", err)
	}
	// Verify decrypted contents.
	err := APIKeyInto("virustotal", func(b []byte) error {
		if string(b) != "rotated-key" {
			t.Fatalf("got %q after passphrase unlock", b)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	// Switch back to seed.
	if err := Unlock(); err != nil {
		t.Fatal(err)
	}
	if ModeNow() != ModeSeed {
		t.Fatalf("mode after Unlock = %q", ModeNow())
	}
	err = APIKeyInto("virustotal", func(b []byte) error {
		if string(b) != "rotated-key" {
			t.Fatalf("got %q", b)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestWrongPassphraseRejectedOnEmptyVault(t *testing.T) {
	withTempVault(t)
	// Initialise a passphrase-only vault with no API keys yet.
	if err := InitPassphraseVault([]byte("correct-pass")); err != nil {
		t.Fatal(err)
	}
	stateMu.Lock()
	cached.opened = false
	zero(cached.kek)
	cached.kek = nil
	stateMu.Unlock()
	attempts := 0
	err := EnsureOpen(func() ([]byte, error) {
		attempts++
		return []byte("nope-not-this"), nil
	})
	if err == nil {
		t.Fatal("EnsureOpen accepted wrong passphrase on empty vault - KEK verifier missing")
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
}

func TestWrongPassphraseRejected(t *testing.T) {
	withTempVault(t)
	if err := SetKey("virustotal", "k"); err != nil {
		t.Fatal(err)
	}
	if err := Lock([]byte("right")); err != nil {
		t.Fatal(err)
	}
	stateMu.Lock()
	cached.opened = false
	zero(cached.kek)
	cached.kek = nil
	stateMu.Unlock()
	attempts := 0
	err := EnsureOpen(func() ([]byte, error) {
		attempts++
		return []byte("wrong"), nil
	})
	if err == nil {
		t.Fatal("EnsureOpen accepted wrong passphrase")
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
}

func TestServerKeyRoundTrip(t *testing.T) {
	withTempVault(t)
	// Need an opened vault to store a server key.
	if err := SetKey("virustotal", "anchor"); err != nil {
		t.Fatal(err)
	}
	original := []byte("PKCS8-DER-bytes-placeholder")
	if err := StoreServerKey(original); err != nil {
		t.Fatal(err)
	}
	// Encrypted file must not leak the plaintext.
	p, _ := VaultPath(serverKeyFile)
	raw, _ := os.ReadFile(p)
	if containsBytes(raw, original) {
		t.Fatal("server_key.enc contains plaintext")
	}
	var got []byte
	if err := LoadServerKey(func(b []byte) error {
		got = append([]byte{}, b...)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if string(got) != string(original) {
		t.Fatalf("round-trip mismatch: %q vs %q", got, original)
	}
}

// TestLockUnlockWithServerKey exercises Lock/Unlock/ChangePassphrase when a
// server key is present. Without the fix, reencrypt calls LoadServerKey which
// re-acquires the already-held stateMu and deadlocks.
// TestEnsureOpenAutoInitsSeedVault verifies that EnsureOpen on a fresh install
// (no vault.json) creates a seed vault so subsequent operations — including
// server key storage — work immediately without a separate init step.
func TestEnsureOpenAutoInitsSeedVault(t *testing.T) {
	withTempVault(t)
	if err := EnsureOpen(nil); err != nil {
		t.Fatalf("EnsureOpen on fresh install: %v", err)
	}
	if ModeNow() != ModeSeed {
		t.Fatalf("mode after EnsureOpen = %q, want seed", ModeNow())
	}
	// Vault-backed operations must work right after EnsureOpen.
	if err := StoreServerKey([]byte("pkcs8-bytes")); err != nil {
		t.Fatalf("StoreServerKey after EnsureOpen: %v", err)
	}
	if err := SetKey("virustotal", "k"); err != nil {
		t.Fatalf("SetKey after EnsureOpen: %v", err)
	}
}

// TestEnsureOpenSurfacesCorruptMeta verifies that unreadable vault metadata
// makes EnsureOpen fail loudly instead of returning nil-success while leaving
// the vault closed (which previously surfaced as a confusing "vault is locked"
// on the first signed request after startup).
func TestEnsureOpenSurfacesCorruptMeta(t *testing.T) {
	withTempVault(t)
	// Force the config dir to exist, then drop a corrupt vault.json into it.
	if _, err := dirPath(); err != nil {
		t.Fatal(err)
	}
	metaPath, _ := VaultPath(metaFile)
	if err := os.WriteFile(metaPath, []byte("{ this is not valid json"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := EnsureOpen(nil)
	if err == nil {
		t.Fatal("EnsureOpen returned nil on corrupt metadata - should surface the error")
	}
	if ModeNow() != "" {
		t.Fatalf("vault reported open (mode %q) despite corrupt metadata", ModeNow())
	}
}

func TestLockUnlockWithServerKey(t *testing.T) {
	withTempVault(t)

	if err := SetKey("virustotal", "key-for-server-key-test"); err != nil {
		t.Fatal(err)
	}
	serverKeyData := []byte("fake-pkcs8-der-bytes")
	if err := StoreServerKey(serverKeyData); err != nil {
		t.Fatal(err)
	}

	pass1 := []byte("first-passphrase-abc")
	if err := Lock(append([]byte{}, pass1...)); err != nil {
		t.Fatalf("Lock (seed→passphrase) with server key: %v", err)
	}
	if ModeNow() != ModePassphrase {
		t.Fatalf("mode after Lock = %q, want passphrase", ModeNow())
	}

	// Verify server key still readable after Lock.
	if err := LoadServerKey(func(b []byte) error {
		if string(b) != string(serverKeyData) {
			t.Fatalf("server key after Lock: got %q want %q", b, serverKeyData)
		}
		return nil
	}); err != nil {
		t.Fatalf("LoadServerKey after Lock: %v", err)
	}

	// Simulate restart, reopen with passphrase.
	stateMu.Lock()
	cached.opened = false
	zero(cached.kek)
	cached.kek = nil
	stateMu.Unlock()
	prompter := func() ([]byte, error) { return append([]byte{}, pass1...), nil }
	if err := EnsureOpen(prompter); err != nil {
		t.Fatalf("EnsureOpen after Lock: %v", err)
	}

	// ChangePassphrase must not deadlock.
	pass2 := []byte("second-passphrase-xyz")
	if err := ChangePassphrase(append([]byte{}, pass2...)); err != nil {
		t.Fatalf("ChangePassphrase with server key: %v", err)
	}

	// Verify server key still readable after ChangePassphrase.
	if err := LoadServerKey(func(b []byte) error {
		if string(b) != string(serverKeyData) {
			t.Fatalf("server key after ChangePassphrase: got %q", b)
		}
		return nil
	}); err != nil {
		t.Fatalf("LoadServerKey after ChangePassphrase: %v", err)
	}

	// Unlock must not deadlock.
	if err := Unlock(); err != nil {
		t.Fatalf("Unlock with server key: %v", err)
	}
	if ModeNow() != ModeSeed {
		t.Fatalf("mode after Unlock = %q, want seed", ModeNow())
	}

	// Verify server key still readable after Unlock.
	if err := LoadServerKey(func(b []byte) error {
		if string(b) != string(serverKeyData) {
			t.Fatalf("server key after Unlock: got %q", b)
		}
		return nil
	}); err != nil {
		t.Fatalf("LoadServerKey after Unlock: %v", err)
	}

	// Verify API key survived all the re-encryptions.
	if err := APIKeyInto("virustotal", func(b []byte) error {
		if string(b) != "key-for-server-key-test" {
			t.Fatalf("api key after all re-encryptions: got %q", b)
		}
		return nil
	}); err != nil {
		t.Fatalf("APIKeyInto after all re-encryptions: %v", err)
	}
}

func fileExists(p string) bool { _, err := os.Stat(p); return err == nil }

func containsBytes(haystack, needle []byte) bool {
	if len(needle) == 0 {
		return true
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := range needle {
			if haystack[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

// Ensure tests don't accidentally write to the real config dir.
func TestUserConfigDirIsTmp(t *testing.T) {
	tmp := withTempVault(t)
	dir, err := dirPath()
	if err != nil {
		t.Fatal(err)
	}
	abs, _ := filepath.Abs(tmp)
	if filepath.Dir(dir) != abs && !strings.HasPrefix(dir, abs) {
		t.Fatalf("dirPath %s not under tmp %s", dir, abs)
	}
}
