package api

import (
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/ma111e/fishbowl/internal/pairing"
	log "github.com/sirupsen/logrus"
)

// HandlePair enrolls the extension's public key. It is the only endpoint that
// turns a valid pairing code into a trusted key: the caller must present a
// candidate pubkey, a fresh pairing code, and a signature over this request
// (proof of possession). Wrapped by SignResponses so the 200 is server-signed.
func HandlePair(w http.ResponseWriter, r *http.Request) {
	if handleCORSAndPreflight(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
		return
	}
	body, ok := readLimitedBody(w, r)
	if !ok {
		return
	}

	ts := r.Header.Get(headerTimestamp)
	sig := r.Header.Get(headerSignature)
	pubKeyHdr := r.Header.Get(headerPubKey)
	pairCode := strings.TrimSpace(r.Header.Get(headerPairCode))

	if pubKeyHdr == "" || ts == "" || sig == "" || pairCode == "" {
		log.Debug("[FishBowl] Enrollment rejected: missing pubkey/signature/pairing-code headers")
		rejectNeedPair(w)
		return
	}

	okCode, locked := pairing.VerifyAttempt(pairCode)
	if !okCode {
		if locked {
			log.Warn("[FishBowl] Pairing locked: too many bad attempts - code invalidated")
			rejectPairLocked(w)
		} else {
			log.Warn("[FishBowl] Pairing rejected: wrong or expired pairing code")
			rejectNeedPair(w)
		}
		return
	}

	candidateDER, err := base64.StdEncoding.DecodeString(pubKeyHdr)
	if err != nil {
		log.Warn("[FishBowl] Pairing rejected: invalid pubkey encoding")
		rejectNeedPair(w)
		return
	}
	candidateKey, err := parseECDSAPubKey(candidateDER)
	if err != nil {
		log.WithError(err).Warn("[FishBowl] Pairing rejected: invalid pubkey")
		rejectNeedPair(w)
		return
	}
	if !verifySignature(candidateKey, r.Method, r.URL.Path, ts, sig, body) {
		log.Warn("[FishBowl] Pairing rejected: signature verification failed during enrollment")
		rejectNeedPair(w)
		return
	}

	pairing.Consume()
	pubKeyMu.Lock()
	cachedPubKey = candidateKey
	pubKeyMu.Unlock()
	if err := savePubKeyDER(candidateDER); err != nil {
		log.WithError(err).Error("[FishBowl] Failed to persist extension public key")
	} else {
		log.Infof("[FishBowl] Extension enrolled via pairing: %.16s…", pubKeyHdr)
	}
	_ = writeJSON(w, http.StatusOK, map[string]bool{"paired": true})
}

// HandlePing is the pairing-state probe. It reports whether the caller is the
// enrolled extension and, when it isn't, makes sure a pairing code is available
// for the user to enter. A stale/foreign enrolled key (extension reinstall,
// profile reset, key rotation) is cleared here so re-pairing can proceed without
// any terminal interaction. Wrapped by SignResponses so the 200 is server-signed.
func HandlePing(w http.ResponseWriter, r *http.Request) {
	if handleCORSAndPreflight(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
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

	if key != nil {
		if ts != "" && sig != "" && verifySignature(key, r.Method, r.URL.Path, ts, sig, body) {
			_ = writeJSON(w, http.StatusOK, map[string]bool{"paired": true})
			return
		}
		// The signature didn't match the enrolled key: it's stale or foreign.
		// Drop it so the unpaired path below can re-issue and re-enroll.
		if err := ResetEnrollment(); err != nil {
			log.WithError(err).Warn("[FishBowl] Failed to clear stale enrollment")
		} else {
			log.Info("[FishBowl] Enrolled key no longer matches the extension - reset for re-pairing")
		}
	}

	// Unpaired: ensure a code exists for the user to enter, then signal need-pair.
	ensurePairingCode("Pairing required.")
	rejectNeedPair(w)
}
