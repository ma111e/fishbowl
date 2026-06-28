/**
 * FishBowl Security Extension - Background Script
 * Handles messaging for opening IP dashboard and verdict services
 *
 * Note: Manifest V3 doesn't allow modification of headers in the way V2 did,
 * so we'll use a different approach to handle embedded content
 */

// Chrome MV3 uses a background service worker (manifest.chrome.json). In that mode,
// we must explicitly load split global helper libraries.
if (typeof importScripts === 'function') {
    importScripts(
        'browser-polyfill.min.js',
        'constants.js',
        'config.js',
        'settings.js',
        'contracts.js',
        'log-service.js',
        'fishbowl-net.js',
        'fishbowl-broadcast.js',
        'bg/message-router.js',
        'bg/reputation/state.js',
        'bg/reputation/services.js',
        'bg/inject-tools.js',
        'bg/reputation/shadow-dom-tools.js',
        'bg/reputation/dom-extract.js',
        'bg/reputation/tab-queue.js',
        'bg/reputation/tab-lifecycle.js',
        'bg/reputation/coordinator.js',
        'bg/dnr-rules.js',
        'bg/handlers/open-dashboard.js',
        'bg/handlers/proxy-analyze-page.js',
        'bg/handlers/get-extension-css-text.js',
        'bg/handlers/bypass-csp.js',
        'bg/handlers/analyze-reputation.js',
        'bg/handlers/analyze-reputation-single.js',
        'bg/handlers/dom-extracted.js',
        'bg/handlers/sandbox-data.js'
    );
}

// Eager keypair generation on first install; lazy generation covers all other cases.
// Also signal `fishbowl setup` (if running) so it can auto-start the backend.
browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        FishBowlNet.ensureKeypair().catch(() => {});
        // Best-effort, fire-and-forget. Plain fetch (NOT the signed channel): the
        // setup server does not ECDSA-sign responses. No custom headers keeps it a
        // CORS-simple request; a blocked/refused response is fine.
        fetch(FishBowlConfig.SETUP_INSTALLED_URL, { method: 'POST' }).catch(() => {});
    }
    // Probe pairing state on install AND update so the spawned pair window
    // appears without the user having to open the toolbar popup.
    if (details.reason === 'install' || details.reason === 'update') {
        probePairingState();
    }
});

// Browser-start probe: covers the case where the extension was already
// installed and the user starts the browser with the backend in pairing mode.
browser.runtime.onStartup.addListener(() => {
    probePairingState();
});

// --- Pair-window orchestration ------------------------------------------------
//
// The backend signals "pairing required" via a 401 + X-Fishbowl-Need-Pair: 1
// response, which fishbowl-net.js translates into the fishbowlNeedsPairing
// storage flag. We watch that flag and spawn a small dedicated popup window
// so the user doesn't have to click the toolbar icon to find the pair UI.

const PAIR_WINDOW_ID_KEY = 'fishbowlPairWindowId';
const PAIR_WINDOW_URL    = 'html/pair-window.html';

// Dedup window so back-to-back triggers (e.g. tabs.onActivated + tabs.onUpdated
// on a fast tab switch, or alarm aligning with a user interaction) don't
// double-POST. 2s is plenty given the events themselves are rare.
const PROBE_DEDUP_MS = 2000;
let lastProbeAt = 0;

async function probePairingState() {
    const now = Date.now();
    if (now - lastProbeAt < PROBE_DEDUP_MS) return;
    lastProbeAt = now;
    try {
        await FishBowlNet.ensureKeypair();
        await FishBowlNet.postJsonExpectJson(FishBowlConfig.PING_URL, {});
        // Success - no pairing required; fishbowl-net cleared the flag for us.
    } catch (e) {
        if (e && e.needsPairing) {
            // Directly spawn here in addition to relying on the storage listener:
            // storage.set fires onChanged even on no-op writes, but we want to be
            // robust even if the flag was already true (no transition).
            ensurePairWindow().catch(() => {});
        }
        // Other errors (backend offline, etc.) are silently ignored - there's
        // nothing useful to surface and we don't want spurious pair prompts.
    }
}

// Detection on reload: the pair window appears as soon as the active tab
// finishes a navigation/reload. Paired with the user-facing reload hint in the
// backend log on enrollment reset, this is sufficient - no periodic probing.
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!tab || tab.active !== true) return;
    probePairingState();
});

// In-memory mutex: storage-id check + windows.create are async, so concurrent
// triggers (tabs.onUpdated + storage.onChanged + toolbar PAIR_NOW) can all
// pass the stored-id check and race into create(), spawning duplicates. The
// stored id remains the cross-restart guard (service worker may be killed).
let pairWindowInFlight = null;
async function ensurePairWindow() {
    if (pairWindowInFlight) return pairWindowInFlight;
    pairWindowInFlight = (async () => {
        try {
            const stored = await browser.storage.local.get(PAIR_WINDOW_ID_KEY);
            const existingId = stored[PAIR_WINDOW_ID_KEY];
            if (typeof existingId === 'number') {
                try {
                    await browser.windows.get(existingId);
                    // Window still alive - bring it forward instead of spawning a duplicate.
                    await browser.windows.update(existingId, { focused: true });
                    return;
                } catch (e) {
                    // Stored id is stale; fall through and create a fresh window.
                    console.debug('[FB:Background] Stored pair window id is stale; recreating', e);
                    await browser.storage.local.remove(PAIR_WINDOW_ID_KEY);
                }
            }
            const win = await browser.windows.create({
                type: 'popup',
                url: browser.runtime.getURL(PAIR_WINDOW_URL),
                width: 480,
                height: 380,
                focused: true,
            });
            if (win && typeof win.id === 'number') {
                await browser.storage.local.set({ [PAIR_WINDOW_ID_KEY]: win.id });
            }
        } catch (e) {
            // Best-effort. The toolbar popup pair panel still works as a fallback.
            if (typeof localStorage !== 'undefined' && localStorage.getItem('fishbowlDebug') === '1') {
                console.warn('[FB:Background] ensurePairWindow failed:', e);
            }
        }
    })().finally(() => { pairWindowInFlight = null; });
    return pairWindowInFlight;
}

async function closePairWindow() {
    try {
        const stored = await browser.storage.local.get(PAIR_WINDOW_ID_KEY);
        const id = stored[PAIR_WINDOW_ID_KEY];
        await browser.storage.local.remove(PAIR_WINDOW_ID_KEY);
        if (typeof id === 'number') {
            try { await browser.windows.remove(id); } catch (e) { console.debug('[FB:Background] Pair window already closed', e); }
        }
    } catch (e) { console.debug('[FB:Background] closePairWindow failed', e); }
}

// Storage listener: react to true↔false transitions of fishbowlNeedsPairing.
// Filter on oldValue !== newValue because storage.set fires onChanged even when
// the value is unchanged, and we don't want to focus the window on every 401.
browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('fishbowlNeedsPairing' in changes)) return;
    const { oldValue, newValue } = changes.fishbowlNeedsPairing;
    if (oldValue === newValue) return;
    if (newValue === true)  ensurePairWindow().catch(() => {});
    if (newValue === false) {
        closePairWindow().catch(() => {});
        // Pairing just succeeded. Re-run analysis on the user's active tab from
        // here (the persistent background) rather than the ephemeral pair UI,
        // which closes before the async inject/rescan can finish. rescanActiveTabs
        // sends fishbowl_rescan, falling back to injecting the content-script
        // bundle for tabs that predate install (initial-pairing case).
        FishBowlNet.rescanActiveTabs?.().catch(() => {});
    }
});

// If the user dismisses the pair window manually, drop the stored id so the
// next pairing event spawns a fresh one.
browser.windows.onRemoved.addListener(async (windowId) => {
    try {
        const stored = await browser.storage.local.get(PAIR_WINDOW_ID_KEY);
        if (stored[PAIR_WINDOW_ID_KEY] === windowId) {
            await browser.storage.local.remove(PAIR_WINDOW_ID_KEY);
        }
    } catch (e) { console.debug('[FB:Background] Failed to clear stored pair window id on remove', e); }
});

// Startup breadcrumb - intentionally kept, gated behind debug level
if (typeof localStorage !== 'undefined' && localStorage.getItem('fishbowlDebug') === '1') {
    console.debug('[FB:Background] loading - browser API:', typeof browser !== 'undefined');
}

async function initSettings() {
    await FishBowlSettings.loadGlobal(browser.storage);
}

// Make sure we wait for DOM before initializing
async function initializeBackgroundScript() {

    await initSettings()

    const dnrManager = FishBowlBgDnrRules.createManager(browser, FishBowlConfig, FishBowlConsts);
    const setupHeaderModificationRules = dnrManager.setupHeaderModificationRules;
    dnrManager.registerTabCloseCleanup();
    dnrManager.reconcileOrphanedRules().catch(() => {});

    const reputationCoordinator = FishBowlBgReputationCoordinator.create(browser, FishBowlConfig, FishBowlConsts);

    const ACTIONS = globalThis.FishBowlContracts?.ACTIONS || {};
    const rejectMessage = (sendResponse, error) => {
        sendResponse({ success: false, error });
        return true;
    };
    const actionHandlers = {
        [ACTIONS.OPEN_DASHBOARD || 'openDashboard']: (request, sender, sendResponse) =>
            request.value ? FishBowlBgHandlers.handleOpenDashboard(browser, request, sendResponse) : rejectMessage(sendResponse, 'missing_value'),
        [ACTIONS.PROXY_ANALYZE_PAGE || 'proxyAnalyzePage']: async (request, sender, sendResponse) => {
            if (!request.payload) return rejectMessage(sendResponse, 'missing_payload');
            // Defence-in-depth: even though handleProxyAnalyzePage's fetch has its
            // own AbortController, this outer race guarantees sendResponse always
            // fires - otherwise the content script's sendMessage resolves with
            // undefined and the HUD shows the misleading "Analysis request failed".
            const safetyMs = (globalThis.FishBowlConstants?.TIMING.POST_JSON_TIMEOUT_MS ?? 20_000) + 2_000;
            let safetyTimer;
            const safetyPromise = new Promise((resolve) => {
                safetyTimer = setTimeout(
                    () => resolve({ ok: false, error: `proxyAnalyzePage timed out after ${safetyMs}ms` }),
                    safetyMs
                );
            });
            try {
                const resp = await Promise.race([
                    FishBowlBgHandlers.handleProxyAnalyzePage(request, FishBowlConfig),
                    safetyPromise
                ]);
                sendResponse(resp);
            } finally {
                clearTimeout(safetyTimer);
            }
            return true;
        },
        [ACTIONS.GET_EXTENSION_CSS_TEXT || 'getExtensionCssText']: async (request, sender, sendResponse) => {
            if (!Array.isArray(request.paths)) return rejectMessage(sendResponse, 'missing_paths');
            const resp = await FishBowlBgHandlers.handleGetExtensionCssText(browser, request);
            sendResponse(resp);
            return true;
        },
        [ACTIONS.BYPASS_CSP || 'bypassCSP']: (request, sender, sendResponse) =>
            request.url && request.target
                ? FishBowlBgHandlers.handleBypassCSP(browser, request, sender, sendResponse, { setupHeaderModificationRules })
                : rejectMessage(sendResponse, 'missing_bypass_target'),
        [ACTIONS.ANALYZE_REPUTATION || 'analyze-reputation']: (request, sender, sendResponse) =>
            request.value
                ? FishBowlBgHandlers.handleAnalyzeReputation(browser, request, sendResponse, {
                    inFlightReputationAnalyses: reputationCoordinator.inFlightReputationAnalyses,
                    getEnabledServicesCount: reputationCoordinator.getEnabledServicesCount,
                    startReputationAnalysis: reputationCoordinator.startReputationAnalysis
                })
                : rejectMessage(sendResponse, 'missing_value'),
        [ACTIONS.ANALYZE_REPUTATION_SINGLE || 'analyze-reputation-single']: (request, sender, sendResponse) =>
            request.value && request.serviceId
                ? FishBowlBgHandlers.handleAnalyzeReputationSingle(browser, request, sendResponse, {
                    inFlightReputationAnalyses: reputationCoordinator.inFlightReputationAnalyses,
                    getEnabledServicesCount: reputationCoordinator.getEnabledServicesCount,
                    startReputationAnalysis: reputationCoordinator.startReputationAnalysis
                })
                : rejectMessage(sendResponse, request.value ? 'missing_service_id' : 'missing_value'),
        [ACTIONS.DOM_EXTRACTED || 'domExtracted']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handleDomExtracted(request, sendResponse, {
                analyzeContent: reputationCoordinator.analyzeContent
            }),
        [ACTIONS.OPEN_SANDBOX || 'openSandbox']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handleOpenSandbox(browser, request, sendResponse),
        [ACTIONS.GET_INVESTIGATIONS || 'getInvestigations']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handleGetInvestigations(browser, request, sendResponse),
        [ACTIONS.SAVE_INVESTIGATION || 'saveInvestigation']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handleSaveInvestigation(browser, request, sendResponse),
        [ACTIONS.DELETE_INVESTIGATION || 'deleteInvestigation']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handleDeleteInvestigation(browser, request, sendResponse),
        [ACTIONS.SET_ACTIVE_INVESTIGATION || 'setActiveInvestigation']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handleSetActiveInvestigation(browser, request, sendResponse),
        [ACTIONS.IMPORT_ENTITIES_TO_INVESTIGATION || 'importEntitiesToInvestigation']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handleImportEntitiesToInvestigation(browser, request, sendResponse),
        [ACTIONS.ADD_ENTITY_TO_WORKSPACE || 'addEntityToWorkspace']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handleAddEntityToWorkspace(browser, request, sendResponse),
        [ACTIONS.PATCH_INVESTIGATION_RESULTS || 'patchInvestigationResults']: (request, sender, sendResponse) =>
            FishBowlBgHandlers.handlePatchInvestigationResults(browser, request, sendResponse),
        [ACTIONS.PAIR_NOW || 'fishbowl_pair_now']: (request, sender, sendResponse) => {
            ensurePairWindow().catch(() => {});
            sendResponse({ ok: true, success: true });
            return true;
        }
    };

    // Listen for messages from content scripts
    const messageListener = async (request, sender, sendResponse) => {

        if (!request || typeof request.action !== 'string') {
            sendResponse(globalThis.FishBowlContracts?.respondError('invalid_request', 'Missing or non-string action') || { success: false, error: 'invalid_request' });
            return true;
        }

        const handler = actionHandlers[request.action];
        if (handler) {
            return handler(request, sender, sendResponse);
        }

        console.warn('[FB:Background] Unhandled message type:', request.action);
        sendResponse(globalThis.FishBowlContracts?.respondError('unknown_action') || { success: false, error: 'unknown_action' });
        return true;
    };

    // Hand off to the early listener (registered at module load)
    globalThis.__fishbowlBgMessageListener = messageListener;

}

try {
    FishBowlBgMessageRouter.registerEarlyListener(browser.runtime, initializeBackgroundScript);
} catch (e) {
    console.error('[FB:Background] Failed to register early message listener:', e);
}

try {
    globalThis.__fishbowlBgInitPromise = globalThis.__fishbowlBgInitPromise || initializeBackgroundScript();
} catch (e) {
    console.error('[FB:Background] Failed to start background initialization:', e);
}
