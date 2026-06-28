package api

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ma111e/fishbowl/internal/config"
	"github.com/ma111e/fishbowl/internal/pairing"
	log "github.com/sirupsen/logrus"
)

const (
	headerTimestamp  = "X-Fishbowl-Timestamp"
	headerSignature  = "X-Fishbowl-Signature"
	headerPubKey     = "X-Fishbowl-PubKey"
	headerPairCode   = "X-Fishbowl-Pair-Code"
	headerNeedPair   = "X-Fishbowl-Need-Pair"
	headerPairLocked = "X-Fishbowl-Pair-Locked"

	headerServerPubKey    = "X-Fishbowl-Server-PubKey"
	headerServerTimestamp = "X-Fishbowl-Server-Timestamp"
	headerServerSignature = "X-Fishbowl-Server-Signature"

	replayWindow    = 30 * time.Second
	maxRequestBytes = 32 << 20 // 32 MB; analyze-page sends full page HTML
)

// PubKeyFilePath returns the path where the enrolled extension public key is stored.
// The extension pubkey is non-secret and lives outside the vault by design.
func PubKeyFilePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "fishbowl", "pubkey"), nil
}

func loadPubKeyDER() ([]byte, error) {
	path, err := PubKeyFilePath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
}

func savePubKeyDER(der []byte) error {
	path, err := PubKeyFilePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(base64.StdEncoding.EncodeToString(der)), 0o600)
}

func parseECDSAPubKey(der []byte) (*ecdsa.PublicKey, error) {
	key, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, err
	}
	ec, ok := key.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("not an ECDSA key")
	}
	return ec, nil
}

// --- enrolled pubkey cache ---------------------------------------------------

var (
	pubKeyMu     sync.RWMutex
	cachedPubKey *ecdsa.PublicKey // nil = no key enrolled
)

// ensurePairingCode mints and logs a fresh pairing code when none is active, so
// the extension always has a code to enrol with. Best-effort.
func ensurePairingCode(reason string) {
	if pairing.Active() {
		return
	}
	code, expires, err := pairing.Issue()
	if err != nil {
		log.WithError(err).Warn("[FishBowl] Failed to issue pairing code")
		return
	}
	log.Infof("[FishBowl] %s Pairing code: %s (valid %s)", reason, code, time.Until(expires).Round(time.Second))
}

// InitAuth loads any existing enrolled pubkey into memory.
// Safe to call when no key is enrolled (cache stays nil).
func InitAuth() {
	der, err := loadPubKeyDER()
	if err != nil || len(der) == 0 {
		return
	}
	key, err := parseECDSAPubKey(der)
	if err != nil {
		log.WithError(err).Warn("[FishBowl] Enrolled pubkey is corrupt - re-enrollment required")
		return
	}
	pubKeyMu.Lock()
	cachedPubKey = key
	pubKeyMu.Unlock()
}

// HasEnrolledPubKey reports whether an extension pubkey is currently enrolled
// (in memory after InitAuth).
func HasEnrolledPubKey() bool {
	pubKeyMu.RLock()
	defer pubKeyMu.RUnlock()
	return cachedPubKey != nil
}

// ResetEnrollment clears the in-memory cache and deletes the pubkey file.
// The next valid extension connection will re-enroll via the pairing flow.
func ResetEnrollment() error {
	pubKeyMu.Lock()
	cachedPubKey = nil
	pubKeyMu.Unlock()
	path, err := PubKeyFilePath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// verifySignature checks the IEEE-P1363 ECDSA-P256-SHA256 signature over
// "<method>\n<path>\n<ts>\n<body>", binding the signature to the endpoint and freshness.
func verifySignature(key *ecdsa.PublicKey, method, path, tsStr, sigB64 string, body []byte) bool {
	tsMs, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil {
		return false
	}
	diff := time.Since(time.UnixMilli(tsMs))
	if diff < -replayWindow || diff > replayWindow {
		return false
	}

	sigBytes, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		return false
	}
	if len(sigBytes) != 64 {
		return false
	}
	r := new(big.Int).SetBytes(sigBytes[:32])
	s := new(big.Int).SetBytes(sigBytes[32:])

	hash := sha256.Sum256([]byte(method + "\n" + path + "\n" + tsStr + "\n" + string(body)))
	return ecdsa.Verify(key, hash[:], r, s)
}

// --- replay protection -------------------------------------------------------

type nonceCache struct {
	mu   sync.Mutex
	seen map[string]time.Time
}

func (c *nonceCache) checkAndAdd(sig string) bool {
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, exp := range c.seen {
		if now.After(exp) {
			delete(c.seen, k)
		}
	}
	if _, ok := c.seen[sig]; ok {
		return false
	}
	c.seen[sig] = now.Add(replayWindow)
	return true
}

var nonces = &nonceCache{seen: make(map[string]time.Time)}

// --- server response signing (key lives in the vault) -----------------------

var (
	serverKeyOnce sync.Once
	serverKey     *ecdsa.PrivateKey
	serverKeyErr  error
	serverPubB64  string
)

// loadOrCreateServerKey returns the cached private key, generating + storing
// a fresh one through the vault on first use.
func loadOrCreateServerKey() (*ecdsa.PrivateKey, error) {
	serverKeyOnce.Do(func() {
		serverKey, serverKeyErr = doLoadOrCreateServerKey()
		if serverKeyErr == nil && serverKey != nil {
			if spki, err := x509.MarshalPKIXPublicKey(&serverKey.PublicKey); err == nil {
				serverPubB64 = base64.StdEncoding.EncodeToString(spki)
			}
		}
	})
	return serverKey, serverKeyErr
}

func doLoadOrCreateServerKey() (*ecdsa.PrivateKey, error) {
	if config.HasServerKey() {
		var parsed *ecdsa.PrivateKey
		err := config.LoadServerKey(func(der []byte) error {
			k, err := x509.ParsePKCS8PrivateKey(der)
			if err != nil {
				return err
			}
			ec, ok := k.(*ecdsa.PrivateKey)
			if !ok {
				return fmt.Errorf("server key is not ECDSA")
			}
			parsed = ec
			return nil
		})
		if err == nil {
			return parsed, nil
		}
		log.WithError(err).Warn("[FishBowl] Existing server key unreadable - regenerating")
	}
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return nil, err
	}
	if err := config.StoreServerKey(der); err != nil {
		return nil, err
	}
	// Zero the marshalled bytes; the parsed *ecdsa.PrivateKey retains the secret
	// inside math/big.Int values, which we can't reach.
	for i := range der {
		der[i] = 0
	}
	log.Info("[FishBowl] Server response-signing keypair generated")
	return priv, nil
}

func signRaw(priv *ecdsa.PrivateKey, hash []byte) (string, error) {
	r, s, err := ecdsa.Sign(rand.Reader, priv, hash)
	if err != nil {
		return "", err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return base64.StdEncoding.EncodeToString(sig), nil
}

type respCapture struct {
	header      http.Header
	body        bytes.Buffer
	status      int
	wroteHeader bool
}

func (c *respCapture) Header() http.Header { return c.header }
func (c *respCapture) WriteHeader(status int) {
	if !c.wroteHeader {
		c.status = status
		c.wroteHeader = true
	}
}
func (c *respCapture) Write(b []byte) (int, error) {
	if !c.wroteHeader {
		c.WriteHeader(http.StatusOK)
	}
	return c.body.Write(b)
}

func serveSigned(w http.ResponseWriter, r *http.Request, next http.Handler, reqSig string) {
	priv, err := loadOrCreateServerKey()
	if err != nil {
		log.WithError(err).Error("[FishBowl] Failed to load server signing key")
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	rec := &respCapture{header: http.Header{}}
	next.ServeHTTP(rec, r)
	respBody := rec.body.Bytes()
	status := rec.status
	if status == 0 {
		status = http.StatusOK
	}

	// Only successful responses are signed: the client verifies the server
	// signature only on 2xx (it throws on 4xx/5xx before checking), and error
	// paths like 401 + need-pair must stay reachable pre-enrollment. Pass
	// non-2xx through verbatim, preserving any headers the handler set.
	if status < 200 || status >= 300 {
		dst := w.Header()
		for k, vs := range rec.header {
			for _, v := range vs {
				dst.Add(k, v)
			}
		}
		w.WriteHeader(status)
		_, _ = w.Write(respBody)
		return
	}

	respTs := strconv.FormatInt(time.Now().UnixMilli(), 10)
	hash := sha256.Sum256([]byte(reqSig + "\n" + respTs + "\n" + string(respBody)))
	sigB64, err := signRaw(priv, hash[:])
	if err != nil {
		log.WithError(err).Error("[FishBowl] Failed to sign response")
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	dst := w.Header()
	for k, vs := range rec.header {
		for _, v := range vs {
			dst.Add(k, v)
		}
	}
	dst.Set(headerServerPubKey, serverPubB64)
	dst.Set(headerServerTimestamp, respTs)
	dst.Set(headerServerSignature, sigB64)

	w.WriteHeader(status)
	_, _ = w.Write(respBody)
}

// --- enrollment + auth middleware -------------------------------------------

// rejectNeedPair sends a 401 with the X-Fishbowl-Need-Pair header so the
// extension popup can show its pairing UI. Callers choose their own log level:
// expected pre-pair probe traffic logs at Debug, real anomalies at Warn.
func rejectNeedPair(w http.ResponseWriter) {
	w.Header().Set(headerNeedPair, "1")
	http.Error(w, "Unauthorized - pairing required", http.StatusUnauthorized)
}

// rejectPairLocked is the lockout variant: the rate limiter tripped, the
// active code has been consumed, and the client should close its popup.
func rejectPairLocked(w http.ResponseWriter) {
	w.Header().Set(headerNeedPair, "1")
	w.Header().Set(headerPairLocked, "1")
	http.Error(w, "Unauthorized - too many pairing attempts", http.StatusUnauthorized)
}

// readLimitedBody reads the request body under the size limit and restores it so
// downstream handlers can read it again. Returns (body, false) and writes the
// error response when the limit is exceeded.
func readLimitedBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Warn("[FishBowl] Request rejected: body exceeds limit")
		http.Error(w, "Request too large", http.StatusRequestEntityTooLarge)
		return nil, false
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	return body, true
}

// AuthMiddleware gates the protected data routes: it requires a valid signature
// from the enrolled extension key, enforces single-use (anti-replay), and signs
// the response for mutual auth. It performs no pairing side effects - an
// unenrolled or stale request simply gets 401 + need-pair, and the extension
// recovers through the dedicated /pair and /ping endpoints.
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		body, ok := readLimitedBody(w, r)
		if !ok {
			return
		}

		ts := r.Header.Get(headerTimestamp)
		sig := r.Header.Get(headerSignature)

		pubKeyMu.RLock()
		key := cachedPubKey
		pubKeyMu.RUnlock()

		if key == nil || ts == "" || sig == "" || !verifySignature(key, r.Method, r.URL.Path, ts, sig, body) {
			// Not authenticated: tell the extension to pair. No enrollment, no
			// reset, no minting happens on data routes - that lives in /ping.
			log.Debug("[FishBowl] Request rejected: not paired or signature invalid - need pairing")
			rejectNeedPair(w)
			return
		}

		if !nonces.checkAndAdd(sig) {
			log.Warn("[FishBowl] Request rejected: replay detected")
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		serveSigned(w, r, next, sig)
	})
}

// SignResponses wraps the pairing endpoints (/pair, /ping) so their successful
// responses are server-signed (mutual auth / TOFU) without requiring an enrolled
// signature first. The handlers do their own pairing-specific validation.
func SignResponses(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		serveSigned(w, r, next, r.Header.Get(headerSignature))
	})
}
