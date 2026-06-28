/**
 * Check if an input field is currently focused
 * @returns {Boolean} True if an input field is focused
 */
function isInputFocused() {
    const activeElement = document.activeElement;
    return (
        activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable
        )
    );
}

/**
 * Collect all entities currently displayed in the HUD panels by reading
 * the DOM panel item elements (data-type / data-content attributes set by panels.js).
 * @returns {Object} entities map { ip: [], domain: [], hash: [], ... }
 */
function collectEntitiesFromPage() {
    const TYPE_MAP = {
        'ip-list': 'ip',
        'asn-list': 'asn',
        'domain-list': 'domain',
        'file-list': 'file',
        'event-list': 'event',
        'sid-list': 'sid',
        'hash-list': 'hash',
    };

    const result = { ip: [], domain: [], hash: [], file: [], event: [], sid: [], asn: [] };

    // Read from the FishBowl HUD shadow root or regular DOM
    const hudRoot = window.fishTankHUD?.hudShadowRoot || document;

    Object.entries(TYPE_MAP).forEach(([listId, type]) => {
        const container = hudRoot.getElementById
            ? hudRoot.getElementById(listId)
            : document.getElementById(listId);
        if (!container) return;

        // Using querySelectorAll to get the actual items, bypassing wrapper divs like .info-group
        const items = container.querySelectorAll(`[data-${type}], [data-content]`);
        Array.from(items).forEach(el => {
            const val = el.getAttribute('data-content') || el.getAttribute(`data-${type}`) || el.textContent?.trim();
            if (!val) return;
            const verdictClass = Array.from(el.classList).find(c => c.startsWith('fishbowl-verdict-'));
            const verdict = verdictClass ? verdictClass.replace('fishbowl-verdict-', '') : 'unknown';
            result[type].push({ value: val, verdict, results: [], notes: '' });
        });
    });

    return result;
}

/**
 * Handle global keyboard shortcuts
 * @param {KeyboardEvent} event The keyboard event
 */
function handleKeyDown(event) {
    // Skip handling if input field is focused
    if (isInputFocused()) {
        return;
    }

    // Check for Ctrl+X combination to toggle execution mode
    if (event.ctrlKey && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        window.FishBowlUiManager.toggleExecutionMode();
        return;
    }

    // In execution mode, shortcuts don't require Alt+Shift
    if (window.FishBowlUiManager?.executionModeManager?.executionMode) {
        // If entity search overlay is open, let it handle its own keys
        if (window.FishBowlUiManager?.entitySearch?.isOpen) {
            return;
        }

        const consumeExecutionShortcutEvent = () => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        };

        const runExecutionActionAndExit = (actionFn) => {
            consumeExecutionShortcutEvent();
            if (typeof actionFn === 'function') {
                actionFn();
            }
            window.FishBowlUiManager.toggleExecutionMode();
        };

        if (event.key.toLowerCase() === 't') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleTheme === 'function') {
                    window.FishBowlUiManager.toggleTheme();
                }
            });
            return;
        }

        if (event.key.toLowerCase() === 'a') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlUiManager && typeof window.FishBowlUiManager.resetHUD === 'function') {
                    window.FishBowlUiManager.resetHUD();
                }
            });
            return;
        }

        // Simple 's' key press for region selection in execution mode
        if (event.key.toLowerCase() === 's') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlRegionSelector) {
                    window.FishBowlRegionSelector.toggleRegionSelectionMode();
                }
            });
            return;
        }

        // 'R' key to perform security scan in execution mode
        // Allow Ctrl+R to pass through for page reload
        if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
            runExecutionActionAndExit(() => {
                if (window.fishTankHUD) {
                    window.fishTankHUD.performAnalysis();
                }
            });
            return;
        }

        if (event.key.toLowerCase() === 'p') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlUiManager && typeof window.FishBowlUiManager.togglePanelsDisabled === 'function') {
                    window.FishBowlUiManager.togglePanelsDisabled();
                }
            });
            return;
        }

        if (event.key.toLowerCase() === 'h') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleHudDisabled === 'function') {
                    window.FishBowlUiManager.toggleHudDisabled();
                }
            });
            return;
        }

        if (event.key.toLowerCase() === 'e') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlUiManager && typeof window.FishBowlUiManager.openEntityInspector === 'function') {
                    window.FishBowlUiManager.openEntityInspector();
                }
            });
            return;
        }

        if (event.key.toLowerCase() === 'c') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlDraggablePanels && typeof window.FishBowlDraggablePanels.resetCurrentDomainPositions === 'function') {
                    window.FishBowlDraggablePanels.resetCurrentDomainPositions();
                }
            });
            return;
        }

        // 'V' - show/hide textarea overlays (no-op when the feature is disabled)
        if (event.key.toLowerCase() === 'v') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleTextareaOverlays === 'function') {
                    window.FishBowlUiManager.toggleTextareaOverlays();
                }
            });
            return;
        }

        // 'O' - open investigation sandbox tab
        if (event.key.toLowerCase() === 'o') {
            runExecutionActionAndExit(() => {
                browser.runtime.sendMessage({ action: 'openSandbox' }).catch(() => { });
            });
            return;
        }

        // 'N' - create new investigation and import current page entities
        if (event.key.toLowerCase() === 'n') {
            runExecutionActionAndExit(async () => {
                const entities = collectEntitiesFromPage();
                await browser.runtime.sendMessage({
                    action: 'importEntitiesToInvestigation',
                    investigationId: null, // force-create new
                    autoAddAnalyzed: true, // place analyzed entities on the canvas
                    name: `Investigation - ${window.location.hostname} ${new Date().toLocaleString()}`,
                    entities
                }).catch(() => { });
                browser.runtime.sendMessage({ action: 'openSandbox' }).catch(() => { });
            });
            return;
        }

        // 'I' - import current page entities into the active investigation
        if (event.key.toLowerCase() === 'i') {
            runExecutionActionAndExit(async () => {
                const entities = collectEntitiesFromPage();
                await browser.runtime.sendMessage({
                    action: 'importEntitiesToInvestigation',
                    entities
                }).catch(() => { });
            });
            return;
        }

        // ':' - open entity search
        if (event.key === ':') {
            runExecutionActionAndExit(() => {
                if (window.FishBowlUiManager && typeof window.FishBowlUiManager.openEntitySearch === 'function') {
                    window.FishBowlUiManager.openEntitySearch();
                }
            });
            return;
        }
    }

    // Cancel region selection with Escape
    if (event.key === 'Escape') {
        event.preventDefault();
        if (window.FishBowlRegionSelector && window.FishBowlRegionSelector.isActive) {
            window.FishBowlRegionSelector.cancelRegionSelection();
        } else if (window.FishBowlUiManager?.executionModeManager?.executionMode) {
            window.FishBowlUiManager.toggleExecutionMode(); // Exit execution mode with Escape
        }
    }
}

async function isDomainWhitelisted() {
    try {
        const settings = await FishBowlSettings.loadGlobal(browser.storage);
        return FishBowlSettings.isHostAllowed(settings, window.location.hostname);

    } catch (error) {
        console.error('Error checking domain whitelist:', error);
        return false;
    }
}

function requireFishBowlContentModules() {
    const requiredModules = [
        ['FishBowlSettings', window.FishBowlSettings],
        ['FishBowlShadowDomTools', window.FishBowlShadowDomTools],
        ['FishBowlHudAnalysis', window.FishBowlHudAnalysis],
    ];

    const missing = requiredModules
        .filter(([, module]) => !module)
        .map(([name]) => name);

    if (missing.length > 0) {
        throw new Error(`FishBowl content module load contract failed: missing ${missing.join(', ')}`);
    }
}

// Initialize FishBowl when DOM is ready
async function initializeFishBowl() {
    if (window.__FB_CONTENT_INITED__) return;
    window.__FB_CONTENT_INITED__ = true;

    try {
        // Check if this is an analysis tab created by the extension
        if (window.location.search.includes('fishbowl_analysis=true')) {
            return;
        }

        // Check if current domain is whitelisted
        const isDomainAllowed = await isDomainWhitelisted();

        // If domain is not whitelisted and whitelist is active, don't initialize
        if (!isDomainAllowed) {
            return;
        }

        requireFishBowlContentModules();

        // Initialize listeners first
        document.addEventListener('keydown', handleKeyDown);

        try {
            browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
                if (message?.action === 'toggleExecutionMode') {
                    try {
                        if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleExecutionMode === 'function') {
                            window.FishBowlUiManager.toggleExecutionMode();
                            sendResponse({
                                success: true,
                                executionMode: !!window.FishBowlUiManager.executionMode
                            });
                            return true;
                        }
                    } catch (e) {
                        console.warn('[FishBowl Content] Failed to toggle execution mode from message', e);
                    }
                    sendResponse({ success: false });
                    return true;
                }

                // Post-pair rescan: triggered by FishBowlNet.rescanActiveTabs from
                // the pair UI controllers after a successful enrollment. Reuses the
                // same entry point as the 'R' keystroke and SPA-navigation hooks.
                if (message?.action === (globalThis.FishBowlContracts?.ACTIONS?.RESCAN || 'fishbowl_rescan')) {
                    try {
                        window.fishTankHUD?.performAnalysis?.();
                        sendResponse({ success: true });
                    } catch (e) {
                        sendResponse({ success: false, error: e?.message || String(e) });
                    }
                    return true;
                }

                // Sandbox: return all entities currently shown in the HUD panels
                if (message?.action === 'getExtractedEntities') {
                    try {
                        sendResponse({ success: true, entities: collectEntitiesFromPage() });
                    } catch (e) {
                        console.warn('[FishBowl Content] Failed to collect entities for getExtractedEntities', e);
                        sendResponse({ success: false, entities: {} });
                    }
                    return true;
                }

                if (message?.action === 'runExecutionModeAction') {
                    try {
                        const cmd = (message?.command || '').toString();

                        const run = (actionFn) => {
                            if (typeof actionFn === 'function') {
                                actionFn();
                            }
                        };

                        switch (cmd) {
                            case 'regionSelection':
                                run(() => {
                                    if (window.FishBowlRegionSelector && typeof window.FishBowlRegionSelector.toggleRegionSelectionMode === 'function') {
                                        window.FishBowlRegionSelector.toggleRegionSelectionMode();
                                    }
                                });
                                break;

                            case 'rescan':
                                run(() => {
                                    if (window.fishTankHUD && typeof window.fishTankHUD.performAnalysis === 'function') {
                                        window.fishTankHUD.performAnalysis();
                                    }
                                });
                                break;

                            case 'togglePanels':
                                run(() => {
                                    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.togglePanelsDisabled === 'function') {
                                        window.FishBowlUiManager.togglePanelsDisabled();
                                    }
                                });
                                break;

                            case 'toggleHighlights':
                                run(() => {
                                    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleHighlightsDisabled === 'function') {
                                        window.FishBowlUiManager.toggleHighlightsDisabled();
                                    }
                                });
                                break;

                            case 'toggleHud':
                                run(() => {
                                    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleHudDisabled === 'function') {
                                        window.FishBowlUiManager.toggleHudDisabled();
                                    }
                                });
                                break;

                            case 'toggleTextareaOverlays':
                                run(() => {
                                    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleTextareaOverlays === 'function') {
                                        window.FishBowlUiManager.toggleTextareaOverlays();
                                    }
                                });
                                break;

                            case 'resetPanelPositions':
                                run(() => {
                                    if (window.FishBowlDraggablePanels && typeof window.FishBowlDraggablePanels.resetCurrentDomainPositions === 'function') {
                                        window.FishBowlDraggablePanels.resetCurrentDomainPositions();
                                    }
                                    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.resetHUD === 'function') {
                                        window.FishBowlUiManager.resetHUD();
                                    }
                                });
                                break;

                            case 'remountOverlay':
                                run(() => {
                                    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.resetHUD === 'function') {
                                        window.FishBowlUiManager.resetHUD();
                                    }
                                });
                                break;

                            case 'toggleTheme':
                                run(() => {
                                    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleTheme === 'function') {
                                        window.FishBowlUiManager.toggleTheme();
                                    }
                                });
                                break;

                            case 'cancel':
                                run(() => {
                                    if (window.FishBowlRegionSelector && window.FishBowlRegionSelector.isActive && typeof window.FishBowlRegionSelector.cancelRegionSelection === 'function') {
                                        window.FishBowlRegionSelector.cancelRegionSelection();
                                        return;
                                    }
                                    if (window.FishBowlUiManager && window.FishBowlUiManager.executionMode && typeof window.FishBowlUiManager.toggleExecutionMode === 'function') {
                                        window.FishBowlUiManager.toggleExecutionMode();
                                    }
                                });
                                break;

                            case 'entitySearch':
                                run(() => {
                                    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.openEntitySearch === 'function') {
                                        window.FishBowlUiManager.openEntitySearch();
                                    }
                                });
                                break;
                        }

                        sendResponse({ success: true });
                        return true;
                    } catch (e) {
                        console.warn('[FishBowl Content] Failed to run execution mode action command', e);
                        sendResponse({ success: false });
                        return true;
                    }
                }
            });
        } catch (e) {
            console.warn('[FishBowl Content] Failed to register runtime message listener', e);
        }

        // Initialize the region selector
        window.FishBowlRegionSelector = new FishBowlRegionSelector();

        // Initialize DOM Highlighter
        window.FishBowlDomHighlighter = new FishBowlDomHighlighter();

        // Initialize UI Manager
        window.FishBowlUiManager = new FishBowlUiManager();

        // Initialize Log Service
        window.FishBowlLogService = new FishBowlLogService();

        // // Initialize API Service
        // window.FishBowlApiService = new FishBowlApiService();

        // Initialize Security HUD
        window.fishTankHUD = new FishBowlSecurityHUD({
            analysis: window.FishBowlHudAnalysis
        });

    } catch (error) {
        console.error('[FB:Content] Failed to initialize:', error);
    }
}

// Wait for DOM to be fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFishBowl);
} else {
    // DOM already loaded, initialize immediately
    initializeFishBowl();
}

// SPA navigation: trigger a fresh analysis when the URL changes without a
// full page reload. The HUD and overlays stay mounted; only the scan reruns.
(function wireSpaBehavior() {
    let _lastHref = window.location.href;

    function onNavigate() {
        const href = window.location.href;
        if (href === _lastHref) return;
        _lastHref = href;

        // Re-run page analysis for the new URL; HUD clears stale results.
        try {
            if (window.fishTankHUD && typeof window.fishTankHUD.performAnalysis === 'function') {
                window.fishTankHUD.performAnalysis();
            }
        } catch (e) {
            console.warn('[FB:Content] SPA navigation re-analysis failed', e);
        }
    }

    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);

    // Pause textarea overlay rendering when the tab is hidden to avoid
    // per-keystroke innerHTML assignments running in the background.
    document.addEventListener('visibilitychange', () => {
        const hidden = document.hidden;
        try {
            if (window.FishBowlDomHighlighter?.textareaInspectOverlay) {
                window.FishBowlDomHighlighter.textareaInspectOverlay.setEnabled(!hidden);
            }
            if (window.FishBowlDomHighlighter?.tinyMceInspectOverlay) {
                window.FishBowlDomHighlighter.tinyMceInspectOverlay.setEnabled(!hidden);
            }
        } catch (e) {
            console.debug('[FishBowl Content] Failed to toggle overlay rendering on visibilitychange', e);
        }
    });
})();
