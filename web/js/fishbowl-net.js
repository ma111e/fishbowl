(function () {
    globalThis.FishBowlNet = globalThis.FishBowlNet || {};

    // Pairing code is held only in memory - once enrollment succeeds, the
    // backend persists the public key and this isn't needed again.
    let pendingPairingCode = null;

    FishBowlNet.setPairingCode = function (code) {
        pendingPairingCode = (typeof code === 'string') ? code.trim() : null;
    };

    FishBowlNet.clearPairingCode = function () {
        pendingPairingCode = null;
    };

    async function flagNeedsPairing() {
        try { await browser.storage.local.set({ fishbowlNeedsPairing: true }); } catch (e) { console.debug('[FB:Net] Failed to set fishbowlNeedsPairing flag', e); }
    }
    async function clearNeedsPairing() {
        try { await browser.storage.local.set({ fishbowlNeedsPairing: false }); } catch (e) { console.debug('[FB:Net] Failed to clear fishbowlNeedsPairing flag', e); }
    }

    function bytesToB64(buf) {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function b64ToBytes(b64) {
        const binary = atob(b64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    }

    FishBowlNet.ensureKeypair = async function ensureKeypair() {
        const existing = await browser.storage.local.get(['fishbowlPrivKeyJwk', 'fishbowlPubKeySpki']);
        if (existing.fishbowlPrivKeyJwk && existing.fishbowlPubKeySpki) return existing;
        const kp = await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
        );
        const fishbowlPrivKeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
        const spkiBuf = await crypto.subtle.exportKey('spki', kp.publicKey);
        const fishbowlPubKeySpki = bytesToB64(spkiBuf);
        await browser.storage.local.set({ fishbowlPrivKeyJwk, fishbowlPubKeySpki });
        const log = globalThis.FishBowlLog?.for?.('Security');
        if (log) log.info('ECDSA keypair generated');
        else console.debug('[FB:Security] ECDSA keypair generated');
        return { fishbowlPrivKeyJwk, fishbowlPubKeySpki };
    };

    FishBowlNet.getAuthHeaders = async function getAuthHeaders(method, path, bodyStr) {
        const { fishbowlPrivKeyJwk, fishbowlPubKeySpki } = await FishBowlNet.ensureKeypair();
        const privKey = await crypto.subtle.importKey(
            'jwk', fishbowlPrivKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
        );
        const ts = String(Date.now());
        const msg = new TextEncoder().encode(method + '\n' + path + '\n' + ts + '\n' + bodyStr);
        const sigBuf = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, privKey, msg);
        const headers = {
            'X-Fishbowl-Timestamp': ts,
            'X-Fishbowl-Signature': bytesToB64(sigBuf),
            'X-Fishbowl-PubKey': fishbowlPubKeySpki
        };
        if (pendingPairingCode) {
            headers['X-Fishbowl-Pair-Code'] = pendingPairingCode;
        }
        return headers;
    };

    // verifyServerResponse enforces mutual auth: the server's response must be signed
    // by the TOFU-pinned server key, bound to this request's signature.
    FishBowlNet.verifyServerResponse = async function verifyServerResponse(reqSig, srvPub, srvTs, srvSig, text) {
        if (!srvPub || !srvTs || !srvSig) throw new Error('Unsigned server response');
        const stored = await browser.storage.local.get('fishbowlServerPubKeySpki');
        let pinned = stored.fishbowlServerPubKeySpki;
        if (!pinned) {
            pinned = srvPub;
            await browser.storage.local.set({ fishbowlServerPubKeySpki: pinned });
        } else if (pinned !== srvPub) {
            throw new Error('Server key mismatch (possible MITM); clear fishbowlServerPubKeySpki to re-pin');
        }
        const pubKey = await crypto.subtle.importKey(
            'spki', b64ToBytes(pinned), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
        );
        const msg = new TextEncoder().encode(reqSig + '\n' + srvTs + '\n' + text);
        const ok = await crypto.subtle.verify(
            { name: 'ECDSA', hash: { name: 'SHA-256' } }, pubKey, b64ToBytes(srvSig), msg
        );
        if (!ok) throw new Error('Server response signature verification failed');
    };

    // rescanActiveTabs nudges the active tab in every normal browser window to
    // re-run its analysis. Called after a successful pairing so the user gets
    // immediate visible feedback (verdict badges refresh) instead of having to
    // navigate or press 'R' in the HUD. windowType: 'normal' excludes the
    // spawned pair-window (type: 'popup') and devtools.
    FishBowlNet.rescanActiveTabs = async function () {
        if (!globalThis.browser?.tabs?.query) return;
        const action = (globalThis.FishBowlContracts?.ACTIONS?.RESCAN) || 'fishbowl_rescan';
        try {
            const tabs = await browser.tabs.query({ active: true, windowType: 'normal' });
            await Promise.all(tabs.map(async (t) => {
                try {
                    // Fast path: a tab that already has the content script just
                    // re-runs analysis on message (the post-'r'-reload case).
                    await browser.tabs.sendMessage(t.id, { action });
                } catch {
                    // No listener yet - happens on initial pairing for tabs that
                    // were open before install. Inject the content-script bundle
                    // so it loads and runs analysis, matching the re-pair
                    // behaviour without forcing a page reload.
                    await injectContentScript(t.id).catch(() => {});
                }
            }));
        } catch (e) {
            // Tab queries can fail in restricted contexts; rescan is best-effort.
            console.debug('[FB:Net] Best-effort rescan of active tabs failed', e);
        }
    };

    // injectContentScript loads the declarative <all_urls> content-script bundle
    // into a tab that doesn't have it yet. File lists come from the live
    // manifest so they stay in lockstep with content_scripts.
    async function injectContentScript(tabId) {
        if (!globalThis.browser?.scripting?.executeScript) return;
        const cs = browser.runtime.getManifest().content_scripts?.[0];
        if (!cs) return;
        if (cs.css?.length && browser.scripting.insertCSS) {
            await browser.scripting.insertCSS({ target: { tabId }, files: cs.css });
        }
        if (cs.js?.length) {
            await browser.scripting.executeScript({ target: { tabId }, files: cs.js });
        }
    }

    // submitPairingCode arms the code and sends a signed POST to /pair so the
    // backend can verify+consume the code and enroll our pubkey.
    // Resolves { ok, locked }: ok=true on success; locked=true when the server
    // has rate-limited further attempts (popup should close itself).
    FishBowlNet.submitPairingCode = async function (code) {
        const cleaned = (code || '').replace(/\D/g, '');
        if (cleaned.length !== 6) return { ok: false, locked: false };
        pendingPairingCode = cleaned;
        const url = (globalThis.FishBowlConfig && globalThis.FishBowlConfig.PAIR_URL)
            || 'http://localhost:7158/pair';
        try {
            await FishBowlNet.postJsonExpectJson(url, {});
            return { ok: true, locked: false };
        } catch (e) {
            if (e && e.needsPairing) return { ok: false, locked: !!e.pairLocked };
            throw e;
        }
    };

    // requestNewPairingCode probes /ping with no code so the backend mints a
    // fresh pairing code (printed in its terminal) when none is active. Best-effort;
    // the expected 401 (need-pair) is swallowed.
    FishBowlNet.requestNewPairingCode = async function () {
        pendingPairingCode = null; // pure probe, no X-Fishbowl-Pair-Code header
        const url = (globalThis.FishBowlConfig && globalThis.FishBowlConfig.PING_URL)
            || 'http://localhost:7158/ping';
        try { await FishBowlNet.postJsonExpectJson(url, {}); } catch { /* expected need-pair */ }
    };

    FishBowlNet.postJsonExpectJson = async function postJsonExpectJson(url, payload, extra = {}) {
        const bodyStr = JSON.stringify(payload);
        const path = new URL(url).pathname;
        const authHeaders = await FishBowlNet.getAuthHeaders('POST', path, bodyStr);
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(extra && extra.headers ? extra.headers : {}),
            ...authHeaders
        };

        // Bounded deadline: without this, a backend stall holds the background
        // worker alive past its idle window; it then gets killed mid-fetch,
        // sendResponse is never called, and the content script's sendMessage
        // resolves with undefined (surfaced as the misleading "Analysis request
        // failed" fallback).
        const controller = new AbortController();
        const timeoutMs = (extra && Number.isFinite(extra.timeoutMs))
            ? extra.timeoutMs
            : (globalThis.FishBowlConstants?.TIMING.POST_JSON_TIMEOUT_MS ?? 20_000);
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response, text;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers,
                body: bodyStr,
                signal: controller.signal,
                ...(extra && extra.fetchOptions ? extra.fetchOptions : {})
            });
            text = await response.text();
        } catch (e) {
            if (e && e.name === 'AbortError') {
                throw new Error(`Request timed out after ${timeoutMs}ms`);
            }
            throw e;
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            if (response.status === 401 && response.headers.get('X-Fishbowl-Need-Pair') === '1') {
                await flagNeedsPairing();
                pendingPairingCode = null;
                const err = new Error('Pairing required');
                err.needsPairing = true;
                err.pairLocked = response.headers.get('X-Fishbowl-Pair-Locked') === '1';
                throw err;
            }
            throw new Error(`HTTP error ${response.status}`);
        }
        // Successful signed exchange - clear any lingering pairing prompt.
        if (pendingPairingCode) {
            pendingPairingCode = null;
            await clearNeedsPairing();
        }

        await FishBowlNet.verifyServerResponse(
            authHeaders['X-Fishbowl-Signature'],
            response.headers.get('X-Fishbowl-Server-PubKey'),
            response.headers.get('X-Fishbowl-Server-Timestamp'),
            response.headers.get('X-Fishbowl-Server-Signature'),
            text
        );

        return JSON.parse(text);
    };
})();
