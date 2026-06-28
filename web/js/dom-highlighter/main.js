/**
 * FishBowl Security Extension - DOM Highlighter
 * Handles highlighting elements in the DOM based on analysis results
 */

class FishBowlDomHighlighter {
    /**
     * Constructor for the DOM Highlighter
     */
    constructor() {
        // Track highlighted elements in the page by type and value
        this.highlightedElements = new Map();

        this.badgeManager = new window.FishBowlBadgeManager();

        this.resultModal = new window.FishBowlResultModal();

        this.gestureHandler = new window.FishBowlGestureHandler({
            onTrigger: (ip, results, verdict) => {
                this.showResultModal(ip, results, verdict);
            },
            onMissingResults: (ip) => {
                if (window.FishBowlUiManager && window.FishBowlUiManager.addFeedEntry) {
                    window.FishBowlUiManager.addFeedEntry(
                        `Modal not availale. Please run analysis on ${ip} first`, "error"
                    );
                }
            }
        });

        // Flag to track if we're in the process of a double-click
        this.processingDoubleClick = false;

        // Mouse tracking for pull-down gesture
        this.mouseTracker = {
            isMouseDown: false,
            startElement: null,
            startY: 0,
            currentY: 0,
            minPullDistance: 30, // Minimum distance in pixels to consider a pull-down
            minTravelThreshold: 5, // Minimum travel threshold in pixels to start tracking the gesture
            isTracking: false,
            isPulling: false, // Flag to indicate if we're in an active pull-down gesture
            targetIp: null
        };

        // Cache of indicator values from the latest scan for reuse in textarea overlay rendering
        this.overlayIndicatorRegex = null;
        this.overlayIndicatorLookup = null;

        this.textareaInspectOverlay = null;
        this.tinyMceInspectOverlay = null;
        this.textareaInspectOverlayEnabled = false;
        this.textareaInspectOverlayHoldToShow = false;

        this.shadowHighlightStylesCssText = '';
        this.shadowHighlightStylesLoadPromise = null;
        this.shadowStyledRoots = new WeakSet();
        this.highlightUtils = this.resolveHighlightUtils();

        this.loadShadowHighlightStylesCssText().catch(e => {
            console.warn('[FishBowl DomHighlighter] Failed to pre-load highlight styles for shadow roots', e);
        });

        this.init()

        console.debug('FishBowl DOM Highlighter initialized');
    }

    ensureTextareaInspectOverlay() {
        if (this.textareaInspectOverlay) return;
        if (!(window.FishBowlTextareaInspectOverlay && typeof window.FishBowlTextareaInspectOverlay === 'function')) return;

        this.textareaInspectOverlay = new window.FishBowlTextareaInspectOverlay({
            renderTextWithIndicators: (text) => this.renderTextWithIndicators(text),
            escapeHtml: (text) => this.escapeHtml(text),
            isTextareaEligible: (t) => {
                try {
                    const computed = window.getComputedStyle(t);
                    if (!computed) return false;
                    if (computed.display === 'none' || computed.visibility === 'hidden') return false;
                    if (t.offsetParent === null) return false;
                    const rect = t.getBoundingClientRect();
                    return !!rect && rect.width > 0 && rect.height > 0;
                } catch (e) {
                    console.warn('[FishBowl DomHighlighter] Failed to evaluate textarea eligibility', e);
                    return false;
                }
            },
            hasEntities: (text) => {
                try {
                    if (!text || !this.overlayIndicatorRegex) return false;
                    this.overlayIndicatorRegex.lastIndex = 0;
                    return this.overlayIndicatorRegex.test(text);
                } catch (e) {
                    console.debug('[FishBowl DomHighlighter] hasEntities regex test failed', e);
                    return false;
                }
            }
        });

        this.textareaInspectOverlay.setDefaultEnabled(!!this.textareaInspectOverlayDefault);
    }

    ensureTinyMceInspectOverlay() {
        if (this.tinyMceInspectOverlay) return;
        if (!(window.FishBowlTinyMceInspectOverlay && typeof window.FishBowlTinyMceInspectOverlay === 'function')) return;

        this.tinyMceInspectOverlay = new window.FishBowlTinyMceInspectOverlay({
            renderTextWithIndicators: (text) => this.renderTextWithIndicators(text),
            escapeHtml: (text) => this.escapeHtml(text),
            hasEntities: (text) => {
                try {
                    if (!text || !this.overlayIndicatorRegex) return false;
                    this.overlayIndicatorRegex.lastIndex = 0;
                    return this.overlayIndicatorRegex.test(text);
                } catch (e) {
                    console.debug('[FishBowl DomHighlighter] hasEntities regex test failed', e);
                    return false;
                }
            },
            getOverlayRegex: () => this.overlayIndicatorRegex,
            getOverlayLookup: () => this.overlayIndicatorLookup,
            getHighlightCssClass: (type) => this.getHighlightCssClass(type)
        });

        this.tinyMceInspectOverlay.setDefaultEnabled(!!this.textareaInspectOverlayDefault);
    }

    refreshActiveTinyMceOverlays() {
        try {
            this.ensureTinyMceInspectOverlay();
            if (!this.tinyMceInspectOverlay || typeof this.tinyMceInspectOverlay.refreshActiveOverlays !== 'function') {
                return;
            }
            this.tinyMceInspectOverlay.refreshActiveOverlays();
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to refresh active TinyMCE overlays', e);
        }
    }

    refreshActiveTextareaOverlays() {
        try {
            this.ensureTextareaInspectOverlay();
            if (!this.textareaInspectOverlay || typeof this.textareaInspectOverlay.refreshActiveTextareaOverlays !== 'function') {
                return;
            }
            this.textareaInspectOverlay.refreshActiveTextareaOverlays();
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to refresh active textarea overlays', e);
        }
    }

    /**
     * Initialize the highlighter
     */
    init() {
        // Listen for mouse events for pull-down gesture detection
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));

        document.addEventListener('click', this.handleDocumentClickCapture.bind(this), true);
        document.addEventListener('dblclick', this.handleDocumentDoubleClickCapture.bind(this), true);

        // Hold-to-show: temporarily reveal textarea overlays while Ctrl+Shift is held.
        document.addEventListener('keydown', this.handleHoldShowKeyDown.bind(this), true);
        document.addEventListener('keyup', this.handleHoldShowKeyUp.bind(this), true);
        // End a stuck hold when the tab is hidden (real tab switch / minimize) or the
        // window loses focus, so a release keyup that never arrives can't leave the
        // overlay stuck on. (The old Ctrl+Alt trigger had to avoid 'blur' because Alt
        // focused the browser menu and blurred the page; Ctrl+Shift has no such side
        // effect, so 'blur' is now a safe catch-all.)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.endHoldShowOverlays();
        });
        window.addEventListener('blur', () => this.endHoldShowOverlays());

        this.setupTextareaInspectButtons();
        this.setupTinyMceInspectButtons();
        this.observeTextareas();


        // Setup message listener for verdict updates from background script
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            const updateReputationProgress = (entityType, value, opts = {}) => {
                try {
                    if (!window.FishBowlUiManager || !value) return;
                    const t = (entityType || '').toString().trim().toLowerCase();
                    if (!t) {
                        console.warn('[FishBowl DomHighlighter] Missing entityType for reputation progress update');
                        return;
                    }
                    const key = `reputation:${t}:${value}`;

                    window.FishBowlUiManager.setActivityProgressLabel(key, value);
                    window.FishBowlUiManager.setActivityProgressActive(key, true);

                    const expected = Number.isFinite(opts.expectedCount) ? opts.expectedCount : null;
                    const completed = Number.isFinite(opts.completedCount) ? opts.completedCount : null;
                    const status = (opts.status || '').toString();

                    if (typeof expected === 'number' && expected > 0 && typeof completed === 'number') {
                        if (completed <= 0) {
                            window.FishBowlUiManager.setActivityProgressIndeterminate(key, true);
                            window.FishBowlUiManager.setActivityProgressStatus(key, `0/${expected} ${status || 'starting'}`);
                            return;
                        }

                        const pct = Math.round((completed / expected) * 100);
                        window.FishBowlUiManager.setActivityProgressPercent(key, pct);
                        if (status) {
                            window.FishBowlUiManager.setActivityProgressStatus(key, `${completed}/${expected} ${status}`);
                        } else {
                            window.FishBowlUiManager.setActivityProgressStatus(key, `${completed}/${expected}`);
                        }
                        return;
                    }

                    if (typeof expected === 'number' && expected > 0) {
                        window.FishBowlUiManager.setActivityProgressIndeterminate(key, true);
                        window.FishBowlUiManager.setActivityProgressStatus(key, `0/${expected} ${status || 'starting'}`);
                        return;
                    }

                    window.FishBowlUiManager.setActivityProgressIndeterminate(key, true);
                    window.FishBowlUiManager.setActivityProgressStatus(key, status || 'starting');
                } catch (e) {
                    console.warn('[FishBowl DomHighlighter] Failed to update reputation progress', e);
                }
            };

            // Handle verdict updates
            if (message.action === 'updateVerdict') {
                if (message.value && message.verdict) {
                    const t = (message.entityType || '').toString().trim().toLowerCase();
                    if (!t) {
                        console.warn('[FishBowl DomHighlighter] Missing entityType for updateVerdict');
                        sendResponse({ success: false, error: 'missing_entity_type' });
                        return true;
                    }
                    this.updateVerdict(
                        message.value,
                        message.verdict,
                        message.serviceName || message.source,
                        t
                    );

                    const svc = (message.serviceName || message.source || '').toString().trim();
                    updateReputationProgress(t, message.value, {
                        expectedCount: message.expectedCount,
                        completedCount: message.completedCount,
                        status: svc
                    });
                }
                sendResponse({ success: true });
                return true;
            }

            // Handle adding analysis indicators
            if (message.action === 'addAnalysisIndicators' && message.value) {
                const t = (message.entityType || '').toString().trim().toLowerCase();
                if (!t) {
                    console.warn('[FishBowl DomHighlighter] Missing entityType for addAnalysisIndicators');
                    sendResponse({ success: false, error: 'missing_entity_type' });
                    return true;
                }
                this.addAnalysisIndicators(message.value, t);

                updateReputationProgress(t, message.value, {
                    expectedCount: message.expectedCount,
                    status: 'starting'
                });

                sendResponse({ success: true });
                return true;
            }
            //
            // // Handle removing analysis indicators for an IP
            // if (message.action === 'removeAnalysisIndicators' && message.value) {
            //   this.removeAnalysisIndicators(message.value);
            //   sendResponse({success: true});
            //   return true;
            // }
            //
            // Handle all services complete - show result badges
            if (message.action === 'allServicesComplete' && message.value && message.results) {
                const t = (message.entityType || '').toString().trim().toLowerCase();
                if (!t) {
                    console.warn('[FishBowl DomHighlighter] Missing entityType for allServicesComplete');
                    sendResponse({ success: false, error: 'missing_entity_type' });
                    return true;
                }
                this.updateAfterAnalysisComplete(message.value, message.results, message.worstReputation, t);
                // this.removeAnalysisIndicators(message.value);

                try {
                    if (window.FishBowlUiManager) {
                        const key = `reputation:${t}:${message.value}`;
                        window.FishBowlUiManager.completeActivityProgress(key);
                    }
                } catch (e) {
                    console.warn('[FishBowl DomHighlighter] Failed to complete reputation progress from allServicesComplete', e);
                }

                sendResponse({ success: true });
                return true;
            }

            if (message.action === 'settingsUpdated') {
                try {
                    const prevEnabled = this.textareaInspectOverlayEnabled;
                    this.textareaInspectOverlayEnabled = !!message?.settings?.textareaInspectOverlayEnabled;
                    this.textareaInspectOverlayDefault = !!message?.settings?.textareaInspectOverlayDefault;
                    this.textareaInspectOverlayHoldToShow = !!message?.settings?.textareaInspectOverlayHoldToShow;
                    if (!this.textareaInspectOverlayHoldToShow) {
                        // Hold-to-show was turned off - clear any active hold so overlays don't stick
                        this.endHoldShowOverlays();
                    }
                    if (!this.textareaInspectOverlayEnabled) {
                        this.removeAllTextareaOverlays();
                    } else {
                        if (!prevEnabled) {
                            // Feature was just turned on - set up overlays fresh
                            this.setupTextareaInspectButtons();
                            this.setupTinyMceInspectButtons();
                        }
                        if (this.textareaInspectOverlayDefault) {
                            this.applyDefaultTextareaInspectOverlays();
                        } else {
                            // Sub-toggle turned off - deactivate all active overlays
                            this.deactivateAllTextareaOverlays();
                        }
                    }
                } catch (e) {
                    console.warn('[FishBowl DomHighlighter] Failed to apply default textarea inspect overlays from settingsUpdated', e);
                }
                sendResponse({ success: true });
                return true;
            }
        });

        try {
            browser.storage.local.get(['settings']).then(result => {
                this.textareaInspectOverlayEnabled = !!result?.settings?.textareaInspectOverlayEnabled;
                this.textareaInspectOverlayDefault = !!result?.settings?.textareaInspectOverlayDefault;
                this.textareaInspectOverlayHoldToShow = !!result?.settings?.textareaInspectOverlayHoldToShow;
                this.applyDefaultTextareaInspectOverlays();
            });
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to load initial textarea inspect overlay default setting', e);
        }
    }

    observeTextareas() {
        try {
            if (this.textareaObserver) {
                return;
            }
            this.textareaObserver = new MutationObserver(() => {
                this.setupTextareaInspectButtons();
                this.setupTinyMceInspectButtons();
            });
            this.textareaObserver.observe(document.body, { childList: true, subtree: true });
        } catch (e) {
            console.warn('Failed to observe textareas:', e);
        }
    }

    setupTextareaInspectButtons() {
        if (!this.textareaInspectOverlayEnabled) return;
        try {
            if (this.textareaObserver) this.textareaObserver.disconnect();
            this.ensureTextareaInspectOverlay();
            if (!this.textareaInspectOverlay) return;
            this.textareaInspectOverlay.setEnabled(true);
            this.textareaInspectOverlay.setDefaultEnabled(!!this.textareaInspectOverlayDefault);
            this.textareaInspectOverlay.setupTextareaInspectButtons();
        } catch (e) {
            console.warn('Failed to set up textarea inspect buttons:', e);
        } finally {
            if (this.textareaObserver && document.body) {
                this.textareaObserver.observe(document.body, { childList: true, subtree: true });
            }
        }
    }

    setupTinyMceInspectButtons() {
        if (!this.textareaInspectOverlayEnabled) return;
        try {
            if (this.textareaObserver) this.textareaObserver.disconnect();
            this.ensureTinyMceInspectOverlay();
            if (!this.tinyMceInspectOverlay) return;
            this.tinyMceInspectOverlay.setEnabled(true);
            this.tinyMceInspectOverlay.setDefaultEnabled(!!this.textareaInspectOverlayDefault);
            this.tinyMceInspectOverlay.setupInspectButtons();
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to set up TinyMCE inspect buttons:', e);
        } finally {
            if (this.textareaObserver && document.body) {
                this.textareaObserver.observe(document.body, { childList: true, subtree: true });
            }
        }
    }

    removeAllTextareaOverlays() {
        try {
            if (this.textareaInspectOverlay) {
                this.textareaInspectOverlay.setEnabled(false);
                // Restore each textarea's color (set to transparent while active)
                // before tearing down the overlay layers, otherwise the real text
                // is left invisible.
                if (typeof this.textareaInspectOverlay.deactivateAllLayers === 'function') {
                    this.textareaInspectOverlay.deactivateAllLayers();
                }
                this.textareaInspectOverlay.removeAllLayers();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to remove textarea overlays', e);
        }
        try {
            if (this.tinyMceInspectOverlay) {
                this.tinyMceInspectOverlay.setEnabled(false);
                if (typeof this.tinyMceInspectOverlay.deactivateAllLayers === 'function') {
                    this.tinyMceInspectOverlay.deactivateAllLayers();
                }
                this.tinyMceInspectOverlay.removeAllLayers();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to remove TinyMCE overlays', e);
        }
    }

    deactivateAllTextareaOverlays() {
        try {
            if (this.textareaInspectOverlay && typeof this.textareaInspectOverlay.deactivateAllLayers === 'function') {
                this.textareaInspectOverlay.deactivateAllLayers();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to deactivate textarea overlays', e);
        }
        try {
            if (this.tinyMceInspectOverlay && typeof this.tinyMceInspectOverlay.deactivateAllLayers === 'function') {
                this.tinyMceInspectOverlay.deactivateAllLayers();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to deactivate TinyMCE overlays', e);
        }
    }

    /**
     * Activate overlays for every eligible source (textarea/TinyMCE) that has
     * detected entities, mirroring clicking each [ Show ] button.
     */
    showAllTextareaOverlays() {
        try {
            if (this.textareaInspectOverlay && typeof this.textareaInspectOverlay.activateAllLayers === 'function') {
                this.textareaInspectOverlay.activateAllLayers();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to show textarea overlays', e);
        }
        try {
            if (this.tinyMceInspectOverlay && typeof this.tinyMceInspectOverlay.activateAllLayers === 'function') {
                this.tinyMceInspectOverlay.activateAllLayers();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to show TinyMCE overlays', e);
        }
    }

    /**
     * Execution-mode toggle: show all eligible overlays, or hide them all if any
     * are currently active. No-op when the feature is disabled.
     */
    toggleAllTextareaOverlays() {
        if (!this.textareaInspectOverlayEnabled) return;
        try {
            const anyActive = !!document.querySelector('.fishbowl-textarea-inspect-active');
            if (anyActive) {
                this.deactivateAllTextareaOverlays();
            } else {
                this.showAllTextareaOverlays();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to toggle all textarea overlays', e);
        }
    }

    /**
     * Begin a hold-to-show session (Ctrl+Shift held): temporarily reveal eligible
     * overlays. Gated on both the feature and the hold-to-show sub-setting.
     */
    beginHoldShowOverlays() {
        if (!this.textareaInspectOverlayEnabled || !this.textareaInspectOverlayHoldToShow) return;
        // Make the hold path self-sufficient: ensure the overlay objects exist and
        // layers are built right now. With "Show on page load" off, the initial
        // synchronous setup races ahead of the async settings read and never runs,
        // so without this the overlay object can be null when the hotkey fires.
        // Both calls are idempotent (existing layers are reused).
        this.setupTextareaInspectButtons();
        this.setupTinyMceInspectButtons();
        try {
            if (this.textareaInspectOverlay && typeof this.textareaInspectOverlay.holdShowActivate === 'function') {
                this.textareaInspectOverlay.holdShowActivate();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to begin hold-show for textarea overlays', e);
        }
        try {
            if (this.tinyMceInspectOverlay && typeof this.tinyMceInspectOverlay.holdShowActivate === 'function') {
                this.tinyMceInspectOverlay.holdShowActivate();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to begin hold-show for TinyMCE overlays', e);
        }
        // If nothing got revealed, the only remaining reason is that the page has no
        // eligible textarea/editor at all - make that diagnosable.
        try {
            const textareaActivated = (this.textareaInspectOverlay?.__holdShowLayers || []).length;
            const tinyMceActivated = (this.tinyMceInspectOverlay?.__holdShowLayers || []).length;
            if (textareaActivated === 0 && tinyMceActivated === 0
                && !document.querySelector('[data-fishbowl-textarea-inspect-layer="true"]')
                && !document.querySelector('[data-fishbowl-tinymce-inspect-layer="true"]')) {
                console.debug('[FishBowl DomHighlighter] Hold-show: no eligible textarea/editor on this page.');
            }
        } catch (e) {
            console.debug('[FishBowl DomHighlighter] Hold-show diagnostics failed', e);
        }
    }

    /**
     * End a hold-to-show session (Ctrl+Shift released, focus lost, or setting
     * turned off): restore the overlays that hold-to-show activated. Always safe.
     */
    endHoldShowOverlays() {
        try {
            if (this.textareaInspectOverlay && typeof this.textareaInspectOverlay.holdShowDeactivate === 'function') {
                this.textareaInspectOverlay.holdShowDeactivate();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to end hold-show for textarea overlays', e);
        }
        try {
            if (this.tinyMceInspectOverlay && typeof this.tinyMceInspectOverlay.holdShowDeactivate === 'function') {
                this.tinyMceInspectOverlay.holdShowDeactivate();
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to end hold-show for TinyMCE overlays', e);
        }
    }

    handleHoldShowKeyDown(e) {
        if (!this.textareaInspectOverlayEnabled || !this.textareaInspectOverlayHoldToShow) return;
        // Only react to a pure modifier press (Ctrl or Shift), not Ctrl+Shift+<char>
        // (e.g. real keyboard shortcuts), so it never interferes with input.
        if (e.key !== 'Control' && e.key !== 'Shift') return;
        if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
            this.beginHoldShowOverlays();
        }
    }

    handleHoldShowKeyUp(e) {
        // As soon as either modifier is released, end the hold session.
        if (!(e.ctrlKey && e.shiftKey)) {
            this.endHoldShowOverlays();
        }
    }

    applyDefaultTextareaInspectOverlays() {
        if (!this.textareaInspectOverlayEnabled) {
            return;
        }
        if (!this.textareaInspectOverlayDefault) {
            return;
        }
        try {
            this.ensureTextareaInspectOverlay();
            if (!this.textareaInspectOverlay) return;
            this.textareaInspectOverlay.setEnabled(true);
            this.textareaInspectOverlay.setDefaultEnabled(!!this.textareaInspectOverlayDefault);
            this.textareaInspectOverlay.applyDefaultTextareaInspectOverlays();
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to apply default textarea inspect overlays', e);
        }

        try {
            this.ensureTinyMceInspectOverlay();
            if (!this.tinyMceInspectOverlay) return;
            this.tinyMceInspectOverlay.setEnabled(true);
            this.tinyMceInspectOverlay.setDefaultEnabled(!!this.textareaInspectOverlayDefault);
            this.tinyMceInspectOverlay.applyDefaultOverlays();
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to apply default TinyMCE inspect overlays', e);
        }
    }

    escapeHtml(value) {
        return (value || '').toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    escapeRegex(value) {
        return (value || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    resolveHighlightUtils() {
        const utils = window.FishBowlDomHighlighterUtils;
        const requiredFns = [
            'buildPattern',
            'getHighlightCssClass',
            'collectOverlayIndicatorValues',
            'buildHighlightJobs'
        ];

        if (!utils) {
            console.warn('[FishBowl DomHighlighter] FishBowlDomHighlighterUtils is not available');
            return null;
        }

        const missing = requiredFns.filter(fn => typeof utils[fn] !== 'function');
        if (missing.length > 0) {
            console.warn('[FishBowl DomHighlighter] FishBowlDomHighlighterUtils is missing required methods', missing);
            return null;
        }

        return utils;
    }

    getHighlightUtils() {
        if (!this.highlightUtils) {
            this.highlightUtils = this.resolveHighlightUtils();
        }
        return this.highlightUtils;
    }

    buildHighlightJobs(analysisResults, settings) {
        const utils = this.getHighlightUtils();
        if (!utils) {
            return [];
        }
        return utils.buildHighlightJobs(analysisResults, settings);
    }

    collectOverlayIndicatorValues(analysisResults, settings) {
        const utils = this.getHighlightUtils();
        if (!utils) {
            return [];
        }
        return utils.collectOverlayIndicatorValues(analysisResults, settings);
    }

    getHighlightCssClass(type) {
        const utils = this.getHighlightUtils();
        if (utils) {
            return utils.getHighlightCssClass(type);
        }
        const normalized = (type || '').toString().trim().toLowerCase();
        return `fishbowl-${normalized || 'event'}-highlight`;
    }

    buildHighlightPattern(type, content) {
        const utils = this.getHighlightUtils();
        if (utils) {
            return utils.buildPattern(type, content);
        }
        const escaped = this.escapeRegex(content);
        return new RegExp(`\\b${escaped}\\b`, 'g');
    }

    applyVerdictClass(el, verdict) {
        if (!el || !verdict) return;
        const classes = (el.className || '').split(/\s+/).filter(Boolean);
        const withoutVerdict = classes.filter(c => !c.startsWith('fishbowl-verdict-'));
        withoutVerdict.push(`fishbowl-verdict-${verdict}`);
        el.className = withoutVerdict.join(' ').trim();
    }

    setOverlayVerdict(type, value, verdict) {
        const t = (type || '').toString().trim().toLowerCase();
        if (!t || !value || !verdict) return;
        if (!this.overlayVerdictLookup) this.overlayVerdictLookup = new Map();
        const str = value.toString();
        this.overlayVerdictLookup.set(`${t}:${str}`, verdict);
        this.overlayVerdictLookup.set(`${t}:${str.toLowerCase()}`, verdict);
    }

    getVerdictFeedSeverity(verdict) {
        if (verdict === 'malicious') return 'error';
        if (verdict === 'benign') return 'success';
        if (verdict === 'suspicious') return 'warning';
        return 'info';
    }

    findPanelItemsForValue(entityType, value) {
        const t = (entityType || '').toString().trim().toLowerCase();
        const v = (value || '').toString();
        const vLower = v.toLowerCase();
        if (!t || !v) return [];

        const root = window.fishTankHUD?.hudShadowRoot || document;

        if (t === 'ip') {
            return Array.from(root.querySelectorAll(`.info-panel-content div[data-type="${t}"][data-content="${v}"]`));
        }

        return Array.from(root.querySelectorAll(`.info-panel-content div[data-type="${t}"][data-content]`))
            .filter(el => ((el?.dataset?.content || '').toString().toLowerCase() === vLower));
    }

    updateOverlayIndicatorCache(analysisResults, settings) {
        try {
            const lookup = new Map();
            const values = [];

            const addValue = (type, value) => {
                if (!value) {
                    return;
                }
                const str = value.toString();
                const lower = str.toLowerCase();

                if (!lookup.has(str)) {
                    lookup.set(str, type);
                }
                if (!lookup.has(lower)) {
                    lookup.set(lower, type);
                }

                values.push(str);
            };

            const indicatorValues = this.collectOverlayIndicatorValues(analysisResults, settings);
            indicatorValues.forEach(entry => {
                addValue(entry?.type, entry?.value);
            });

            this.overlayVerdictLookup = new Map();
            const seedVerdict = (type, value, entry) => {
                const verdict = entry?.verdict || entry?.cachedData?.worstVerdict;
                if (verdict) this.setOverlayVerdict(type, value, verdict);
            };
            (analysisResults?.ipAddresses || []).forEach(e => seedVerdict('ip', e?.ip, e));
            (analysisResults?.domains || []).forEach(e => seedVerdict('domain', e?.domain, e));
            (analysisResults?.hashes || []).forEach(e => seedVerdict('hash', e?.value, e));
            (analysisResults?.files || []).forEach(e => seedVerdict('file', e?.file, e));

            const unique = Array.from(new Set(values))
                .filter(v => !!v)
                .sort((a, b) => b.length - a.length);

            if (unique.length === 0) {
                this.overlayIndicatorRegex = null;
                this.overlayIndicatorLookup = null;
                return;
            }

            const pattern = unique.map(v => this.escapeRegex(v)).join('|');
            this.overlayIndicatorRegex = new RegExp(`\\b(?:${pattern})\\b`, 'gi');
            this.overlayIndicatorLookup = lookup;
        } catch (e) {
            console.warn('Failed to update overlay indicator cache:', e);
            this.overlayIndicatorRegex = null;
            this.overlayIndicatorLookup = null;
        }
    }

    renderTextWithIndicators(text) {
        const safe = this.escapeHtml(text);

        if (this.overlayIndicatorRegex && this.overlayIndicatorLookup) {
            return safe.replace(this.overlayIndicatorRegex, (match) => {
                const lower = match.toLowerCase();
                const type = this.overlayIndicatorLookup.get(match) || this.overlayIndicatorLookup.get(lower);
                if (!type) {
                    return match;
                }

                const cssClass = this.getHighlightCssClass(type);
                const verdict = this.overlayVerdictLookup
                    ? (this.overlayVerdictLookup.get(`${type}:${match}`)
                        || this.overlayVerdictLookup.get(`${type}:${lower}`))
                    : null;
                const verdictClass = verdict ? ` fishbowl-verdict-${verdict}` : '';
                const verdictAttr = verdict ? ` data-verdict="${verdict}"` : '';

                return `<span class="fishbowl-highlight ${cssClass}${verdictClass}" data-type="${type}" data-content="${match}"${verdictAttr} data-selectable="true" title="${type.toUpperCase()}: ${match}">${match}</span>`;
            });
        }

        return safe;
    }

    toggleTextareaInspectOverlay(textarea, layer, options = {}) {
        try {
            this.ensureTextareaInspectOverlay();
            if (!this.textareaInspectOverlay) return;
            this.textareaInspectOverlay.toggleTextareaInspectOverlay(textarea, layer, options);
        } catch (e) {
            console.error('Failed to toggle textarea inspect overlay:', e);
        }
    }

    findHighlightFromEvent(e) {
        if (!e) return null;

        const target = e.target;
        if (target && typeof target.closest === 'function') {
            const direct = target.closest('.fishbowl-highlight');
            if (direct) {
                return direct;
            }
        }

        if (typeof e.composedPath === 'function') {
            const path = e.composedPath();
            for (const node of path) {
                if (node && node.classList && node.classList.contains('fishbowl-highlight')) {
                    return node;
                }
            }
        }

        return null;
    }

    handleDocumentClickCapture(e) {
        const highlight = this.findHighlightFromEvent(e);
        if (!highlight) return;

        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
        }
        e.preventDefault();

        this.handleDocumentClick(e);
    }

    handleDocumentDoubleClickCapture(e) {
        const highlight = this.findHighlightFromEvent(e);
        if (!highlight) return;

        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
        }
        e.preventDefault();

        this.handleDocumentDoubleClick(e);
    }

    clearHighlights() {
        this.cancelIdleBatches();

        this.querySelectorAllIncludingShadow('.fishbowl-highlight').forEach(el => {
            const nextElement = el.nextElementSibling;
            if (nextElement && nextElement.classList && nextElement.classList.contains('fishbowl-badges-container')) {
                nextElement.remove();
            }
            el.outerHTML = el.innerHTML;
        });

        this.querySelectorAllIncludingShadow('.fishbowl-badges-container').forEach(container => {
            container.remove();
        });

        if (this.highlightedElements && typeof this.highlightedElements.clear === 'function') {
            this.highlightedElements.clear();
        }
    }

    /**
     * Highlight all matched content in the page
     * @param {Object} analysisResults Object containing IPs, ASNs, domains and eventIds
     * @param {Object} settings Settings object containing scan toggles
     */
    highlightAllContent(analysisResults, settings) {
        this.clearHighlights();

        this.ensureHighlightStylesInOpenShadowRoots();

        this.updateOverlayIndicatorCache(analysisResults, settings);

        this.refreshActiveTextareaOverlays();

        this.refreshActiveTinyMceOverlays();

        const jobs = this.buildHighlightJobs(analysisResults, settings);
        if (!jobs.length) return;

        // Single DOM walk - partition text nodes by viewport visibility
        const { viewport, offScreen } = this.collectCandidateTextNodes();

        // Phase 1 (sync): highlight all entities in viewport text nodes immediately.
        // After each job, merge fresh text nodes (created by DOM mutations) so
        // subsequent jobs can find entities that shared the same original text node.
        const vpNodes = viewport;
        jobs.forEach(job => {
            try {
                const fresh = this.highlightInTextNodes(job.type, job.content, job.metadata || {}, vpNodes);
                if (fresh.length) {
                    Array.prototype.push.apply(vpNodes, fresh);
                }
            } catch (err) {
                console.error(`[FishBowl DomHighlighter] Failed to highlight ${job.type}: ${job.content}`, err);
            }
        });

        // Phase 2 (async): highlight off-screen text nodes in idle batches
        this.scheduleIdleBatches(jobs, offScreen);
    }

    /**
     * Handle click events on document for highlight selection
     * @param {Event} e Click event
     */
    handleDocumentClick(e) {
        // If we're processing a double-click or tracking mouse movement, ignore the click event
        if (this.processingDoubleClick || this.mouseTracker.isTracking) {
            return;
        }

        const target = this.findHighlightFromEvent(e);

        // Check if clicked on any type of highlight
        if (target && target.classList && target.classList.contains('fishbowl-highlight')) {
            // Get content type and value
            const type = target.getAttribute('data-type');
            const content = target.getAttribute('data-content');

            if (!type || !content) return;

            // Toggle selection
            this.toggleHighlightSelection(type, content, e.ctrlKey || e.metaKey, e.shiftKey);
        }
    }

    /**
     * Handle double-click events on document to trigger the first shortcut action for the entity
     * @param {Event} e Double-click event
     */
    handleDocumentDoubleClick(e) {
        const target = this.findHighlightFromEvent(e);
        if (!target || !target.classList || !target.classList.contains('fishbowl-highlight')) return;

        const type = target.getAttribute('data-type');
        const value = target.getAttribute('data-content');
        if (!type || !value) return;

        // Set flag to prevent normal click from firing
        this.processingDoubleClick = true;
        setTimeout(() => {
            this.processingDoubleClick = false;
        }, 300);

        // Delegate to the selection manager's double-click action handler
        if (window.FishBowlUiManager && typeof window.FishBowlUiManager.executeDoubleClickAction === 'function') {
            window.FishBowlUiManager.executeDoubleClickAction(type, value);
        }
    }

    /**
     * Open the IP dashboard in a new tab
     * @param {String} ip The IP address to analyze
     */
    openIpDashboard(ip) {
        if (!ip) return;

        // Send message to background script to open dashboard
        browser.runtime.sendMessage({
            action: "openDashboard",
            value: ip
        }, response => {
            if (!response || !response.success) {
                console.error("Failed to open dashboard");

                // Fallback: try to open directly if messaging fails
                const dashboardUrl = browser.runtime.getURL(`dashboard.html?ip=${encodeURIComponent(ip)}`);
                window.open(dashboardUrl, '_blank');
            }
        });
    }

    /**
     * Toggle selection of highlighted content both in page and panel
     * @param {String} type Type of content ('ip', 'asn', 'domain', 'event', 'sid')
     * @param {String} content The content value to toggle
     * @param {Boolean} ctrlKey Whether Ctrl/Cmd key is pressed
     * @param {Boolean} shiftKey Whether Shift key is pressed
     */
    toggleHighlightSelection(type, content, ctrlKey, shiftKey) {
        console.debug('Toggle highlight selection:', type, content, ctrlKey, shiftKey);

        if (window.FishBowlUiManager && window.FishBowlUiManager.toggleSelection) {
            window.FishBowlUiManager.toggleSelection(type, content, ctrlKey, shiftKey);
        }
    }

    /**
     * Update highlight selection state based on panel selections
     * @param {Object} selectedItems Object containing arrays of selected items by type
     */
    updateHighlightSelection(selectedItems) {
        // Clear all highlight selections
        this.querySelectorAllIncludingShadow('.fishbowl-highlight').forEach(el => {
            el.classList.remove("selected");
        });

        // Map of item array property names to the corresponding highlight type
        const typeMap = {
            "ipAddresses": "ip",
            "asNumbers": "asn",
            "domains": "domain",
            "files": "file",
            "eventIds": "event",
            "sids": "sid",
            "hashes": "hash"
            // Add new types here as needed
        };

        // Process each type of selected items
        Object.entries(typeMap).forEach(([itemsKey, highlightType]) => {
            const items = selectedItems[itemsKey];
            if (items && items.length > 0) {
                items.forEach(value => {
                    const v = (value || '').toString();
                    const vLower = v.toLowerCase();

                    if (highlightType === 'domain' || highlightType === 'file') {
                        this.querySelectorAllIncludingShadow(`.fishbowl-${highlightType}-highlight[data-content]`)
                            .filter(el => ((el?.dataset?.content || '').toString().toLowerCase() === vLower))
                            .forEach(el => el.classList.add('selected'));
                        return;
                    }

                    const selector = `.fishbowl-${highlightType}-highlight[data-content="${this.escapeCssAttrValue(v)}"]`;
                    this.querySelectorAllIncludingShadow(selector).forEach(el => {
                        el.classList.add("selected");
                    });
                });
            }
        });
    }


    /**
     * Update verdict for a specific IP and refresh visual cues
     * @param {String} value The IP address
     * @param {String} verdict The verdict of the IP
     * @param {String} serviceName Name of the service providing the verdict
     */
    updateVerdict(value, verdict, serviceName = null, entityType) {
        if (!value || !verdict) return;
        const t = (entityType || '').toString().trim().toLowerCase();
        if (!t) {
            console.warn('[FishBowl DomHighlighter] Missing entityType for updateVerdict()');
            return;
        }
        const v = value.toString();

        // Find all highlighted elements for this value.
        // For domains, casing in page text may differ from normalized analysis values.
        const elements = this.findHighlightsForValue(t, v);
        const panelItems = this.findPanelItemsForValue(t, v);

        // Keep the worst verdict: a single-service progress update must not downgrade
        // a more-severe verdict already shown for this value (e.g. a long-press re-scan
        // of one service must not erase a 'malicious' verdict from another service).
        // allServicesComplete recomputes from the merged results, so legitimate
        // downgrades still apply at completion.
        const priority = (window.FishBowlConstants?.VERDICT_PRIORITY) || ['malicious', 'suspicious', 'neutral', 'benign', 'unknown'];
        const rank = (val) => { const i = priority.indexOf((val || '').toString().toLowerCase()); return i < 0 ? Infinity : i; };

        let currentVerdict = this.overlayVerdictLookup?.get(`${t}:${v}`)
            || this.overlayVerdictLookup?.get(`${t}:${v.toLowerCase()}`) || '';
        elements.forEach(el => {
            if (rank(el.dataset.verdict) < rank(currentVerdict)) currentVerdict = el.dataset.verdict;
        });

        // Adopt the incoming verdict only if it is at least as severe as what's shown.
        const effective = rank(verdict) <= rank(currentVerdict) ? verdict : currentVerdict;
        if (!effective) return;

        elements.forEach(el => {
            if (el.dataset.verdict === effective) return;

            this.applyVerdictClass(el, effective);
            el.title = `${t.toUpperCase()}: ${value} | Verdict: ${effective} | Source: ${serviceName || 'Unknown'}`;
            el.dataset.verdict = effective;
        });

        panelItems.forEach(item => {
            this.applyVerdictClass(item, effective);
            item.title = `Verdict: ${effective} | Source: ${serviceName || 'Unknown'}`;
        });

        this.setOverlayVerdict(t, v, effective);

        if ((elements.length || panelItems.length)
            && window.FishBowlUiManager && window.FishBowlUiManager.addFeedEntry) {
            window.FishBowlUiManager.addFeedEntry(
                `Updated ${t.toUpperCase()} verdict for ${value}: ${effective} from ${serviceName || 'Unknown'}`,
                this.getVerdictFeedSeverity(effective)
            );
        }

        // Keep the Entity Inspector in sync with live verdict updates.
        if (window.FishBowlUiManager && typeof window.FishBowlUiManager.refreshEntityInspector === 'function') {
            window.FishBowlUiManager.refreshEntityInspector();
        }
    }

    /**
     * Add analysis indicators next to all occurrences of an IP address
     * @param {String} value The value being analyzed
     */
    addAnalysisIndicators(value, entityType) {
        const t = (entityType || '').toString().trim().toLowerCase();
        if (!t) {
            console.warn('[FishBowl DomHighlighter] Missing entityType for addAnalysisIndicators()');
            return;
        }
        const v = (value || '').toString();
        const highlights = this.findHighlightsForValue(t, v);

        highlights.forEach(highlight => {
            // Add analyzing class to the highlight itself
            highlight.classList.add('analyzing');

            // Only add if there's not already an analysis indicator
            if (!highlight.nextElementSibling || !highlight.nextElementSibling.classList.contains('analysis-indicator-container')) {
                const container = document.createElement('span');
                container.className = 'analysis-indicator-container';
                container.setAttribute('data-content', value);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                circle.setAttribute('class', 'progress-circle progress-circle-indeterminate');
                circle.setAttribute('viewBox', '0 0 20 20');
                circle.setAttribute('role', 'progressbar');
                circle.setAttribute('aria-label', 'Analyzing');

                const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                track.setAttribute('class', 'progress-circle-track');
                track.setAttribute('cx', '10');
                track.setAttribute('cy', '10');
                track.setAttribute('r', '7');

                const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                indicator.setAttribute('class', 'progress-circle-indicator');
                indicator.setAttribute('cx', '10');
                indicator.setAttribute('cy', '10');
                indicator.setAttribute('r', '7');

                try {
                    const circumference = 2 * Math.PI * 7;
                    indicator.style.strokeDasharray = String(circumference);
                    indicator.style.strokeDashoffset = String(circumference * 0.6);
                } catch (e) {
                    console.warn('[FishBowl DomHighlighter] Failed to initialize analysis indicator progress ring', e);
                }

                circle.appendChild(track);
                circle.appendChild(indicator);
                container.appendChild(circle);

                highlight.insertAdjacentElement('afterend', container);
            }
        });
    }

    /**
     * Remove analysis indicators for an IP address
     * @param {String} value The IP address to remove indicators for
     */
    removeAnalysisIndicators(value) {
        // Remove the analyzing class from all highlights for this value
        const escapedValue = this.escapeCssAttrValue(value);
        const highlights = this.querySelectorAllIncludingShadow(`.fishbowl-highlight[data-content="${escapedValue}"]`);
        highlights.forEach(highlight => {
            highlight.classList.remove('analyzing');
        });

        // Remove the indicator elements
        const indicators = this.querySelectorAllIncludingShadow(`.analysis-indicator-container[data-content="${escapedValue}"]`);
        indicators.forEach(indicator => {
            indicator.remove();
        });
    }

    /**
     * Check if an IP address is private
     * @param {String} ip The IP address to check
     * @returns {Boolean} True if the IP is a private address
     */
    isPrivateIP(ip) {
        return this.badgeManager.isPrivateIP(ip);
    }

    /**
     * Check if an IP address is a bogon (reserved or special-use)
     * @param {String} ip The IP address to check
     * @returns {Boolean} True if the IP is a bogon address
     */
    isBogonIP(ip) {
        return this.badgeManager.isBogonIP(ip);
    }

    /**
     * Add private or bogon tag to the highlight element's data-tags
     * @param {String} ip The IP address to check
     * @param {HTMLElement} highlight The highlight element to update
     */
    addIpTypeTags(ip, highlight) {
        return this.badgeManager.addIpTypeTags(ip, highlight);
    }
    /**
     * Add text badges with grey background instead of icons next to the IP highlight
     * @param {HTMLElement} highlight The highlight element to add the text badges after
     */
    addTextBadges(highlight) {
        return this.badgeManager.addTextBadges(highlight);
    }

    parseAnalysisResultForBadges(results) {
        return this.badgeManager.parseAnalysisResultForBadges(results);
    }

    /**
     * Show result badges or icons for completed analysis
     * @param {String} value The IP address
     * @param {Object} results The results from all services
     * @param {String} worstVerdict The worst verdict found across all services
     */
    async updateAfterAnalysisComplete(value, results, worstVerdict, entityType) {
        this.removeAnalysisIndicators(value);

        const t = (entityType || '').toString().trim().toLowerCase();
        if (!t) {
            console.warn('[FishBowl DomHighlighter] Missing entityType for updateAfterAnalysisComplete()');
            return;
        }

        // Merge incoming results with any previously cached results so that
        // a single-service re-analysis (long-press) does not discard results
        // from services that were not part of this run.
        let mergedResults = results;
        if (window.FishBowlCacheService) {
            const cacheKey = FishBowlConsts.reputationCacheKey(t, value);
            if (cacheKey) {
                try {
                    const cached = await window.FishBowlCacheService.getCache(cacheKey);
                    if (cached && cached.results && typeof cached.results === 'object') {
                        mergedResults = { ...cached.results, ...results };
                    }
                } catch (e) {
                    console.warn('[FishBowl DomHighlighter] Failed to read cache for merge', e);
                }
            }
        }

        // Recompute worst verdict from all merged results
        const verdictPriority = ['malicious', 'suspicious', 'neutral', 'benign', 'unknown'];
        let mergedWorstVerdict = 'unknown';
        Object.values(mergedResults).forEach(r => {
            const v = (r.verdict || 'unknown').toLowerCase();
            if (verdictPriority.indexOf(v) < verdictPriority.indexOf(mergedWorstVerdict)) {
                mergedWorstVerdict = v;
            }
        });

        const badges = this.parseAnalysisResultForBadges(mergedResults);

        // Save merged results to cache with 1-hour expiry, using entityType:value as cache key
        if (window.FishBowlCacheService) {
            const cacheKey = FishBowlConsts.reputationCacheKey(t, value);
            if (!cacheKey) {
                console.warn('[FishBowl DomHighlighter] Failed to build reputation cache key', { entityType: t, value });
                return;
            }
            const cacheData = {
                entityType: t,
                value: value,
                results: mergedResults,
                badges: badges,
                worstVerdict: mergedWorstVerdict,
                timestamp: Date.now()
            };
            window.FishBowlCacheService.setCache(cacheKey, cacheData);
            console.debug('Saved analysis results to cache for ', value);
        }

        // Count the number of services that responded
        const servicesCount = Object.keys(mergedResults).length;
        if (servicesCount === 0) return;

        const v = (value || '').toString();

        // Find highlights for this {entityType,value}. For domains/files, casing in the page may differ.
        const highlighted = this.findHighlightsForValue(t, v);

        highlighted.forEach(highlight => {
            // Store results data directly on the highlighted element
            highlight.dataset.results = JSON.stringify(mergedResults);
            highlight.dataset.verdict = mergedWorstVerdict;
            highlight.dataset.badges = JSON.stringify(badges);
            this.badgeManager.addTextBadges(highlight, badges);
        });

        this.setOverlayVerdict(t, value, mergedWorstVerdict);

        if (window.FishBowlUiManager && window.FishBowlUiManager.addFeedEntry) {
            window.FishBowlUiManager.addFeedEntry(
                `Analysis complete for ${value}: ${mergedWorstVerdict} (${servicesCount} service results)`,
                this.getVerdictFeedSeverity(mergedWorstVerdict)
            );
        }

        // Reflect the freshly cached reputation in the Entity Inspector if open.
        if (window.FishBowlUiManager && typeof window.FishBowlUiManager.refreshEntityInspector === 'function') {
            window.FishBowlUiManager.refreshEntityInspector();
        }
    }

    /**
     * Show modal with detailed results
     * @param {String} value The value
     * @param {Object} results The results from all services
     * @param {String} worstVerdict The worst verdict
     * @param {HTMLElement} _sourceElement The element that triggered the modal (unused)
     */
    showResultModal(value, results, worstVerdict, _sourceElement) {
        this.resultModal.show(value, results, worstVerdict);
    }

    /**
     * Remove result modal with animation
     */
    removeResultModal() {
        this.resultModal.remove();
    }

    /**
     * Handle mouse down event for pull-down gesture detection
     * @param {MouseEvent} e Mouse down event
     */
    handleMouseDown(e) {
        this.gestureHandler.handleMouseDown(e, this.mouseTracker);
    }

    /**
     * Handle mouse move event for pull-down gesture
     * @param {MouseEvent} e Mouse move event
     */
    handleMouseMove(e) {
        this.gestureHandler.handleMouseMove(e, this.mouseTracker);
    }

    escapeCssAttrValue(value) {
        return (value || '').toString().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    querySelectorAllIncludingShadow(selector, root = document) {
        try {
            if (globalThis.FishBowlShadowDomTools && typeof globalThis.FishBowlShadowDomTools.querySelectorAllDeep === 'function') {
                const deepResults = globalThis.FishBowlShadowDomTools.querySelectorAllDeep(selector, root);
                return Array.isArray(deepResults) ? deepResults : Array.from(deepResults || []);
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to query selector in open shadow roots', selector, e);
        }

        try {
            if (root && typeof root.querySelectorAll === 'function') {
                return Array.from(root.querySelectorAll(selector));
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed fallback querySelectorAll', selector, e);
        }

        return [];
    }

    collectOpenRoots(root = document) {
        try {
            if (globalThis.FishBowlShadowDomTools && typeof globalThis.FishBowlShadowDomTools.collectOpenRoots === 'function') {
                const roots = globalThis.FishBowlShadowDomTools.collectOpenRoots(root);
                if (Array.isArray(roots) && roots.length > 0) {
                    return roots;
                }
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to collect open shadow roots', e);
        }

        return [root || document];
    }

    findHighlightsForValue(entityType, value) {
        const t = (entityType || '').toString().trim().toLowerCase();
        const v = (value || '').toString();
        const vLower = v.toLowerCase();

        if (!t || !v) {
            return [];
        }

        if (t === 'ip') {
            const escaped = this.escapeCssAttrValue(v);
            return this.querySelectorAllIncludingShadow(`.fishbowl-highlight[data-type="${t}"][data-content="${escaped}"]`);
        }

        return this.querySelectorAllIncludingShadow(`.fishbowl-highlight[data-type="${t}"][data-content]`)
            .filter(el => ((el?.dataset?.content || '').toString().toLowerCase() === vLower));
    }

    getShadowHighlightRuntimeApi() {
        if (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.getURL === 'function') {
            return browser.runtime;
        }
        if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
            return chrome.runtime;
        }
        return null;
    }

    readShadowStylesFromDocumentStyleSheets(urls = []) {
        const byUrl = new Map();

        try {
            if (!Array.isArray(urls) || urls.length === 0 || !document || !document.styleSheets) {
                return byUrl;
            }

            const targetUrls = new Set(urls.filter(Boolean));
            const styleSheets = Array.from(document.styleSheets || []);
            styleSheets.forEach(sheet => {
                const href = (sheet && sheet.href) ? sheet.href.toString() : '';
                if (!href || !targetUrls.has(href)) {
                    return;
                }

                try {
                    const rules = Array.from(sheet.cssRules || []);
                    const cssText = rules.map(rule => rule.cssText).join('\n').trim();
                    if (cssText) {
                        byUrl.set(href, cssText);
                    }
                } catch (e) {
                    console.warn('[FishBowl DomHighlighter] Failed to read CSS rules from injected stylesheet for shadow-root highlighting', href, e);
                }
            });
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed while collecting injected stylesheet CSS for shadow-root highlighting', e);
        }

        return byUrl;
    }

    loadShadowHighlightStylesCssText() {
        if (this.shadowHighlightStylesCssText) {
            return Promise.resolve(this.shadowHighlightStylesCssText);
        }

        if (this.shadowHighlightStylesLoadPromise) {
            return this.shadowHighlightStylesLoadPromise;
        }

        const runtimeApi = this.getShadowHighlightRuntimeApi();

        if (!runtimeApi) {
            return Promise.resolve('');
        }

        const extraCss = `
:host-context(body.fishbowl-highlights-hidden) .fishbowl-highlight {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  text-decoration: none !important;
  cursor: text !important;
}

:host-context(body.fishbowl-highlights-hidden) .fishbowl-badges-container {
  display: none !important;
}
`;

        const activeStyles = [
            'styles/common.css',
            'styles/adaptive-colors.css',
            'styles/highlights.css',
            'styles/badges.css',
            'styles/modal.css',
            'styles/draggable-panels.css',
            'styles/activity-feed.css',
            'styles/region-selector.css'
        ];

        const urls = activeStyles.map(path => runtimeApi.getURL(path));
        const pathsByUrl = new Map(activeStyles.map((path, i) => [urls[i], path]));

        this.shadowHighlightStylesLoadPromise = (async () => {
            const injectedCssByUrl = this.readShadowStylesFromDocumentStyleSheets(urls);
            let cssByPath = {};
            if (typeof runtimeApi.sendMessage === 'function') {
                try {
                    const response = await runtimeApi.sendMessage({
                        action: 'getExtensionCssText',
                        paths: activeStyles
                    });
                    if (response && response.ok && response.cssByPath && typeof response.cssByPath === 'object') {
                        cssByPath = response.cssByPath;
                    } else {
                        console.warn('[FishBowl DomHighlighter] Background CSS payload is invalid for shadow-root highlighting', response);
                    }
                } catch (e) {
                    console.warn('[FishBowl DomHighlighter] Failed to read extension CSS via background for shadow-root highlighting', e);
                }
            }

            const parts = [];

            for (const url of urls) {
                let cssText = injectedCssByUrl.get(url) || '';
                if (!cssText) {
                    const path = pathsByUrl.get(url) || '';
                    cssText = path ? (cssByPath[path] || '') : '';
                }
                if (cssText) {
                    parts.push(cssText);
                }
            }

            if (parts.length === 0) {
                console.warn('[FishBowl DomHighlighter] Could not load highlights.css/badges.css for shadow roots');
            }

            const merged = `${parts.filter(Boolean).join('\n')}\n${extraCss}`.trim();
            this.shadowHighlightStylesCssText = merged;
            return merged;
        })();

        return this.shadowHighlightStylesLoadPromise;
    }

    ensureShadowRootHighlightStyles(root) {
        if (!root || !root.host) {
            return;
        }

        if (this.shadowStyledRoots.has(root)) {
            return;
        }

        const markerSelector = 'style[data-fishbowl-shadow-highlight-styles="true"]';
        try {
            if (typeof root.querySelector === 'function' && root.querySelector(markerSelector)) {
                this.shadowStyledRoots.add(root);
                return;
            }
        } catch (e) {
            console.warn('[FishBowl DomHighlighter] Failed to check shadow-root highlight style marker', e);
        }

        this.loadShadowHighlightStylesCssText().then(cssText => {
            if (!cssText || this.shadowStyledRoots.has(root)) {
                return;
            }

            if (typeof root.querySelector === 'function' && root.querySelector(markerSelector)) {
                this.shadowStyledRoots.add(root);
                return;
            }

            const style = document.createElement('style');
            style.setAttribute('data-fishbowl-shadow-highlight-styles', 'true');
            style.textContent = cssText;
            root.appendChild(style);
            this.shadowStyledRoots.add(root);
        }).catch(e => {
            console.warn('[FishBowl DomHighlighter] Failed to ensure highlight styles in shadow root', e);
        });
    }

    ensureHighlightStylesInOpenShadowRoots() {
        const roots = this.collectOpenRoots(document);
        roots.forEach(root => {
            if (root && root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root.host) {
                this.ensureShadowRootHighlightStyles(root);
            }
        });
    }

    /**
     * Walk the DOM once and collect all candidate text nodes, partitioned
     * into viewport-visible and off-screen groups.
     * @returns {{ viewport: Text[], offScreen: Text[] }}
     */
    collectCandidateTextNodes() {
        const viewportNodes = [];
        const offScreenNodes = [];
        const textRoots = this.getHighlightTextRoots();

        const vpHeight = window.innerHeight || document.documentElement.clientHeight;
        const vpWidth = window.innerWidth || document.documentElement.clientWidth;

        textRoots.forEach(rootNode => {
            if (!rootNode) return;

            let walker;
            try {
                const rootDoc = rootNode.ownerDocument || document;
                walker = rootDoc.createTreeWalker(
                    rootNode,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );
            } catch (e) {
                console.warn('[FishBowl DomHighlighter] Failed to create TreeWalker for root', e);
                return;
            }

            let node;
            while ((node = walker.nextNode())) {
                if (!node || !node.textContent || !node.textContent.trim()) {
                    continue;
                }

                const parentEl = node.parentElement;
                if (!parentEl) {
                    continue;
                }

                const tagName = (parentEl.tagName || '').toUpperCase();
                if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' ||
                    tagName === 'TEXTAREA' || tagName === 'INPUT') {
                    continue;
                }

                if (parentEl.classList.contains('fishbowl-highlight') ||
                    parentEl.closest('.fishbowl-panel') ||
                    parentEl.closest('.fishbowl-hud') ||
                    parentEl.closest('.fishbowl-modal-backdrop')) {
                    continue;
                }

                try {
                    const rect = parentEl.getBoundingClientRect();
                    const inViewport = rect.bottom >= 0 && rect.top <= vpHeight &&
                        rect.right >= 0 && rect.left <= vpWidth &&
                        rect.width > 0 && rect.height > 0;
                    if (inViewport) {
                        viewportNodes.push(node);
                    } else {
                        offScreenNodes.push(node);
                    }
                } catch (rectErr) {
                    console.warn('[FishBowl DomHighlighter] getBoundingClientRect failed, treating node as off-screen', rectErr);
                    offScreenNodes.push(node);
                }
            }
        });

        return { viewport: viewportNodes, offScreen: offScreenNodes };
    }

    getHighlightTextRoots() {
        const roots = this.collectOpenRoots(document);
        const textRoots = [];

        roots.forEach(root => {
            if (!root) return;

            if (root.nodeType === Node.DOCUMENT_NODE) {
                if (root.body) {
                    textRoots.push(root.body);
                }
                return;
            }

            // Skip the FishBowl HUD shadow root - its panel text contains
            // entity values that must never be highlighted.
            if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root.host) {
                const hostTag = (root.host.tagName || '').toUpperCase();
                if (hostTag === 'FISHBOWL-HUD') {
                    return;
                }
                this.ensureShadowRootHighlightStyles(root);
            }

            textRoots.push(root);
        });

        return textRoots;
    }

    /**
     * Handle mouse up event for pull-down gesture completion
     * @param {MouseEvent} e Mouse up event
     */
    handleMouseUp(_e) {
        this.gestureHandler.handleMouseUp(this.mouseTracker);
    }

    /**
     * Highlight a single entity's matches within a pre-collected set of text nodes.
     * When a text node is mutated (replaced by a wrapper), new child text nodes
     * are collected and returned so subsequent jobs can process them.
     * @param {String} type Entity type ('ip', 'domain', 'hash', 'file', etc.)
     * @param {String} content The content/value to highlight
     * @param {Object} metadata Additional metadata for the highlight
     * @param {Text[]} textNodes Pre-collected text nodes to search within
     * @returns {Text[]} Fresh text nodes created by mutations (for the next job)
     */
    highlightInTextNodes(type, content, metadata, textNodes) {
        const freshNodes = [];
        if (!content || !textNodes || textNodes.length === 0) return freshNodes;

        const pattern = this.buildHighlightPattern(type, content);
        if (!pattern) return freshNodes;

        const safeCanonical = (content || '').toString().replace(/"/g, '\\"');

        textNodes.forEach(textNode => {
            if (!textNode.parentElement) return;
            if (!textNode.textContent || !textNode.textContent.match(pattern)) return;

            const parent = textNode.parentElement;

            // Avoid highlighting already highlighted content or content within the FishBowl panel
            if (parent.classList.contains('fishbowl-highlight') ||
                parent.closest('.fishbowl-panel') ||
                parent.closest('.fishbowl-hud') ||
                parent.closest('.fishbowl-modal-backdrop')) return;

            const html = textNode.textContent.replace(
                pattern,
                match => {
                    const storedContent = (type === 'ip' || type === 'domain')
                        ? safeCanonical
                        : match.replace(/"/g, '\\"');
                    return `<span class="fishbowl-highlight fishbowl-${type}-highlight ${metadata.cssClass}" 
             data-type="${type}"
             data-content="${storedContent}" 
             data-selectable="true"
             title="${metadata.title}">${match}</span>`;
                }
            );

            if (html !== textNode.textContent) {
                const wrapper = document.createElement('span');
                wrapper.innerHTML = html;
                parent.replaceChild(wrapper, textNode);

                // Collect fresh text nodes from the wrapper so the next job
                // can find entities that shared this original text node.
                const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null, false);
                let child;
                while ((child = walker.nextNode())) {
                    if (child.textContent && child.textContent.trim()) {
                        freshNodes.push(child);
                    }
                }

                try {
                    const highlights = wrapper.querySelectorAll(`.fishbowl-highlight.fishbowl-${type}-highlight`);
                    highlights.forEach(el => {
                        const key = `${type}:${content}`;
                        if (!this.highlightedElements.has(key)) {
                            this.highlightedElements.set(key, []);
                        }
                        this.highlightedElements.get(key).push(el);

                        if (metadata.cachedData && metadata.cachedData.results) {
                            el.setAttribute('data-results', JSON.stringify(metadata.cachedData.results));
                        }

                        if (metadata.cachedData && metadata.cachedData.badges) {
                            el.setAttribute('data-badges', JSON.stringify(metadata.cachedData.badges));
                        }

                        // Apply backend-provided badges (e.g. 'known' for known files)
                        if (Array.isArray(metadata.badges) && metadata.badges.length > 0) {
                            const existing = el.getAttribute('data-badges');
                            const merged = existing ? JSON.parse(existing) : [];
                            metadata.badges.forEach(b => {
                                if (!merged.includes(b)) merged.push(b);
                            });
                            el.setAttribute('data-badges', JSON.stringify(merged));
                        }

                        // Add private or bogon IP icon for IP type highlights
                        if (type === 'ip') {
                            this.addIpTypeTags(content, el);
                        }

                        this.addTextBadges(el);
                    });
                } catch (e) {
                    console.error('Error selecting highlights:', e);
                }
            }
        });

        return freshNodes;
    }

    /**
     * Schedule off-screen highlight jobs in idle batches so the main thread
     * stays responsive.
     * @param {Array} jobs Highlight jobs to process
     * @param {Text[]} textNodes Off-screen text nodes
     * @param {Number} batchSize Number of jobs per idle frame
     */
    scheduleIdleBatches(jobs, textNodes, batchSize = 20) {
        if (!jobs.length || !textNodes.length) return;

        let index = 0;
        const nodes = textNodes;

        const scheduleFn = typeof requestIdleCallback === 'function'
            ? (cb) => requestIdleCallback(cb, { timeout: 100 })
            : (cb) => setTimeout(cb, 0);

        const cancelFn = typeof cancelIdleCallback === 'function'
            ? (id) => cancelIdleCallback(id)
            : (id) => clearTimeout(id);

        const processNextBatch = () => {
            const end = Math.min(index + batchSize, jobs.length);

            for (let i = index; i < end; i++) {
                const job = jobs[i];
                try {
                    const fresh = this.highlightInTextNodes(job.type, job.content, job.metadata || {}, nodes);
                    if (fresh.length) {
                        Array.prototype.push.apply(nodes, fresh);
                    }
                } catch (err) {
                    console.error(`[FishBowl DomHighlighter] Failed to highlight (idle) ${job.type}: ${job.content}`, err);
                }
            }

            index = end;

            if (index < jobs.length) {
                this._idleBatchId = scheduleFn(processNextBatch);
            } else {
                this._idleBatchId = null;
            }
        };

        this._idleBatchId = scheduleFn(processNextBatch);
        this._idleBatchCancelFn = cancelFn;
    }

    /**
     * Cancel any pending idle highlight batches.
     */
    cancelIdleBatches() {
        if (this._idleBatchId != null) {
            const cancelFn = this._idleBatchCancelFn || clearTimeout;
            cancelFn(this._idleBatchId);
            this._idleBatchId = null;
        }
    }

}