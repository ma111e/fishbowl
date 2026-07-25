/**
 * FishBowl Security Extension - Security HUD
 * Main class for the security heads-up display
 */

class FishBowlSecurityHUD {
    constructor({ analysis } = {}) {
        if (!analysis || typeof analysis.buildAnalysisHtml !== 'function' || typeof analysis.hydrateCachedResponse !== 'function') {
            throw new Error('[FishBowl HUD] Missing required analysis collaborator');
        }

        this.analysis = analysis;
        this.hud = null;
        this.isVisible = true;
        this.analysisInProgress = false;
        this.settings = FishBowlConfig.DEFAULT_SETTINGS;

        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.createHUD();
        this.attachEventListeners();
        this.installPairingBanner();
        // Initialize selection handlers in UI Manager
        window.FishBowlUiManager.initSelectionHandlers();

        // DOM highlighter is now initialized in content.js as a class instance

        // Initialize background message handlers for verdict service
        if (typeof window.FishBowlUiManager.initBackgroundMessageHandlers === 'function') {
            window.FishBowlUiManager.initBackgroundMessageHandlers();
        }

        // Apply activity feed visibility setting
        this.updateActivityFeedVisibility();

        // Perform initial analysis on page load
        await this.performAnalysis(true);
    }

    /**
     * Load user settings from storage
     */
    async loadSettings() {
        const hostname = (window.location?.hostname || '').toString();
        const { settings } = await FishBowlSettings.loadForHost(browser.storage, hostname);
        this.settings = settings;
    }

    /**
     * CSS files to load inside the shadow root.
     * These are fetched as text and injected as inline <style> blocks
     * to avoid CSP issues with extension stylesheet loading.
     */
    static SHADOW_CSS_PATHS = [
        'styles/common.css',
        'styles/hud.css',
        'styles/activity-feed.css',
        'styles/draggable-panels.css',
        'styles/modal.css',
        'styles/adaptive-colors.css',
        'styles/region-selector.css',
        'styles/entity-inspector.css',
    ];

    async createHUD() {
        // Remove any pre-existing host so a re-create (e.g. remount) never leaves
        // an orphaned <fishbowl-hud> behind.
        if (this.hudHost && this.hudHost.parentNode) {
            this.hudHost.parentNode.removeChild(this.hudHost);
        }

        // --- Shadow DOM host ---
        this.hudHost = document.createElement('fishbowl-hud');
        const zHud = (globalThis.FishBowlConstants?.Z.HUD_BASE ?? 999999);
        this.hudHost.style.cssText = `position:fixed;inset:0;z-index:${zHud};pointer-events:none;display:block;`;
        // Attach to documentElement rather than body: heavy SPAs (e.g. OpenSearch
        // Discover) replace document.body's children during their initial render,
        // which would detach a body-mounted host. A child of <html> survives that.
        document.documentElement.appendChild(this.hudHost);

        // Give auto-heal a fresh chance on every (re)mount, including manual remount.
        this._hostReattachTimestamps = [];
        this._hostReattachDisabled = false;

        const shadow = this.hudHost.attachShadow({ mode: 'open' });
        this.hudShadowRoot = shadow;

        // Expose shadow root globally so sub-modules can query inside it
        this.hudElement = shadow;

        // --- Load CSS into shadow root as inline <style> blocks (CSP-safe) ---
        try {
            const cssTexts = await this._fetchShadowCss();
            for (const cssText of cssTexts) {
                if (!cssText) continue;
                const style = document.createElement('style');
                style.textContent = cssText;
                shadow.appendChild(style);
            }
        } catch (e) {
            console.warn('[FishBowl HUD] Failed to load shadow CSS, falling back to empty styles', e);
        }

        // --- HUD container ---
        this.hud = document.createElement('div');
        this.hud.id = FishBowlConfig.HUD_ID;
        this.hud.className = 'fishbowl-hud';
        this.hud.innerHTML = this.getHUDHTML();

        shadow.appendChild(this.hud);

        // Cache frequently-queried panel references so per-call querySelector is avoided.
        this._panelLeft = this.hud.querySelector('.fishbowl-panel-left');
        this._panelRight = this.hud.querySelector('.fishbowl-panel-right');
        this._panelLeftColumn = this.hud.querySelector('.fishbowl-panel-left-column');

        this.applyInfoPanelOpacity();
        this.applyPanelHeaderVisibility();

        if (window.FishBowlDraggablePanels && typeof window.FishBowlDraggablePanels.applySavedPositions === 'function') {
            window.FishBowlDraggablePanels.applySavedPositions();
        }

        if (window.FishBowlDraggablePanels && typeof window.FishBowlDraggablePanels.applySavedVisibility === 'function') {
            window.FishBowlDraggablePanels.applySavedVisibility();
        }

        // Wait for next tick to ensure DOM is updated
        setTimeout(() => {
            if (this.settings.showVisualUpdates) {
                this.show();
            } else {
                this.hide();
            }

            // Apply activity feed visibility setting
            this.updateActivityFeedVisibility();

            this.updateTheme();
        }, 0);

        // Keep the host attached even if the page tears it out of the DOM.
        this.setupHostAttachmentGuard();
    }

    /**
     * Self-healing guard: heavy dynamic SPAs can detach the <fishbowl-hud> host
     * (e.g. by replacing document.body) after the initial mount, silently hiding
     * the overlay. This re-attaches the *existing* host node — the same thing the
     * manual remount shortcut does — without rebuilding it.
     *
     * Resource-safety: the observer watches only documentElement's direct children
     * (no subtree), so it does NOT fire on the SPA's ordinary body/subtree churn.
     * A circuit breaker bounds worst-case work if a host page actively strips the
     * node, and healing is a single appendChild (no CSS fetch / analysis).
     */
    setupHostAttachmentGuard() {
        if (this.hostAttachmentObserver || this.hostAttachmentInterval) {
            return;
        }

        this._hostReattachTimestamps = [];
        this._hostReattachDisabled = false;

        const reattachIfDetached = () => {
            if (this._hostReattachDisabled) return;
            if (!this.hudHost || this.hudHost.isConnected) return;

            const now = Date.now();
            // Drop timestamps older than the circuit-breaker window (~2s).
            this._hostReattachTimestamps = this._hostReattachTimestamps.filter(
                (t) => now - t < 2000
            );
            if (this._hostReattachTimestamps.length >= 5) {
                // The page is actively fighting us; stop spinning. Manual remount
                // (resetHUD) is still available to the user.
                this._hostReattachDisabled = true;
                console.warn('[FishBowl HUD] Host repeatedly detached by the page; auto-reattach disabled. Use the remount shortcut if needed.');
                return;
            }
            this._hostReattachTimestamps.push(now);
            document.documentElement.appendChild(this.hudHost);
        };

        // childList only, no subtree: fires solely when <html>'s direct children
        // change (e.g. document.body replacement), not on page content mutations.
        this.hostAttachmentObserver = new MutationObserver(reattachIfDetached);
        this.hostAttachmentObserver.observe(document.documentElement, {
            childList: true
        });

        // Low-frequency fallback for the rare swap that doesn't surface as a
        // documentElement childList mutation. A boolean check + occasional
        // appendChild is cheaper than the existing background-color interval.
        this.hostAttachmentInterval = setInterval(reattachIfDetached, 2000);
    }

    teardownHostAttachmentGuard() {
        if (this.hostAttachmentObserver) {
            this.hostAttachmentObserver.disconnect();
            this.hostAttachmentObserver = null;
        }
        if (this.hostAttachmentInterval) {
            clearInterval(this.hostAttachmentInterval);
            this.hostAttachmentInterval = null;
        }
    }

    /**
     * Fetch all shadow CSS files as text.
     * Uses browser.runtime.getURL + fetch to read extension-bundled CSS.
     * Rewrites relative url() references to absolute extension URLs since
     * inline <style> blocks have no base URL context.
     * @returns {Promise<string[]>}
     */
    async _fetchShadowCss() {
        const results = [];
        for (const path of FishBowlSecurityHUD.SHADOW_CSS_PATHS) {
            try {
                const url = browser.runtime.getURL(path);
                const resp = await fetch(url);
                if (resp.ok) {
                    let cssText = await resp.text();
                    // Resolve relative url() paths against the CSS file's directory
                    const cssDir = path.substring(0, path.lastIndexOf('/') + 1); // e.g. 'styles/'
                    cssText = cssText.replace(
                        /url\(\s*['"]?(\.\.?\/[^'")]+)['"]?\s*\)/g,
                        (_match, relPath) => {
                            // Resolve relative path: e.g. '../fonts/x.woff2' from 'styles/' → 'fonts/x.woff2'
                            const parts = (cssDir + relPath).split('/');
                            const resolved = [];
                            for (const p of parts) {
                                if (p === '..') resolved.pop();
                                else if (p !== '.') resolved.push(p);
                            }
                            const absUrl = browser.runtime.getURL(resolved.join('/'));
                            return `url('${absUrl}')`;
                        }
                    );
                    results.push(cssText);
                } else {
                    console.warn('[FishBowl HUD] Failed to fetch shadow CSS', path, resp.status);
                    results.push('');
                }
            } catch (e) {
                console.warn('[FishBowl HUD] Failed to fetch shadow CSS', path, e);
                results.push('');
            }
        }
        return results;
    }

    applyPanelHeaderVisibility() {
        if (!this.hud) return;
        if (this.settings?.showPanelHeaders === false) {
            this.hud.classList.add('fishbowl-hide-panel-headers');
        } else {
            this.hud.classList.remove('fishbowl-hide-panel-headers');
        }
    }

    applyInfoPanelOpacity() {
        try {
            if (!this.hud) return;
            const raw = this.settings?.infoPanelOpacity;
            const n = (typeof raw === 'number') ? raw : parseFloat(raw);
            if (!Number.isFinite(n)) return;
            const clamped = Math.max(0.05, Math.min(1, n));
            this.hud.style.setProperty('--fishbowl-info-panel-opacity', String(clamped));

            // If the panels are effectively invisible, ensure they don't intercept clicks.
            // Opacity does not affect hit-testing, so we explicitly toggle a class that
            // disables pointer events on the panels.
            if (clamped <= 0.06) {
                this.hud.classList.add('fishbowl-info-panels-clickthrough');
            } else {
                this.hud.classList.remove('fishbowl-info-panels-clickthrough');
            }
        } catch (e) {
            console.warn('[FishBowl HUD] Failed to apply info panel opacity', e);
        }
    }

    setThemeClass(themeClass) {
        if (!this.hud) return;

        const htmlElement = document.documentElement;
        this.hud.classList.remove('fishbowl-theme-light', 'fishbowl-theme-dark');
        htmlElement.classList.remove('fishbowl-theme-light', 'fishbowl-theme-dark');

        if (themeClass) {
            this.hud.classList.add(themeClass);
            htmlElement.classList.add(themeClass);
        }

        // The selection action panel and the execution-mode overlays (shortcuts hint,
        // service picker) are siblings of this.hud in the shadow root, so they do not
        // inherit the theme class. Keep any that are open in sync explicitly.
        const siblingSelectors = [
            '#selection-actions-panel',
            '.fishbowl-shortcuts-hint',
            '.fishbowl-service-picker-overlay',
        ];
        for (const sel of siblingSelectors) {
            const el = this.hudShadowRoot?.querySelector(sel);
            if (el) {
                el.classList.remove('fishbowl-theme-light', 'fishbowl-theme-dark');
                if (themeClass) el.classList.add(themeClass);
            }
        }
    }

    updateTheme() {
        if (!this.hud) return;

        const effectiveTheme = this.settings?.theme;
        if (effectiveTheme === 'dark' || effectiveTheme === 'light') {
            this.applyTheme(effectiveTheme);
            return;
        }

        // Auto theme: derive light/dark from the host page's background.
        this.applyResolvedAutoTheme();
    }

    applyTheme(effectiveTheme) {
        if (!this.hud) return;
        const themeClass = effectiveTheme === 'light' ? 'fishbowl-theme-light' : 'fishbowl-theme-dark';
        this.setThemeClass(themeClass);
    }

    applyResolvedAutoTheme() {
        if (!this.hud) return;
        const resolved = this.detectThemeFromPageBackground();
        this.setThemeClass(resolved === 'light' ? 'fishbowl-theme-light' : 'fishbowl-theme-dark');
    }

    /**
     * Derives the light/dark theme for "auto" mode from the first opaque background
     * colour behind the overlay (document element, then body), using its perceived
     * brightness. Defaults to 'dark' when no opaque background can be read.
     * @returns {'light'|'dark'}
     */
    detectThemeFromPageBackground() {
        for (const el of [document.documentElement, document.body]) {
            if (!el) continue;
            const rgb = this.parseRgb(window.getComputedStyle(el).backgroundColor);
            if (!rgb || rgb.a < 0.9) continue; // skip transparent/near-transparent layers
            const brightness = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
            return brightness > 0.5 ? 'light' : 'dark';
        }
        return 'dark';
    }

    /**
     * Parse an rgb()/rgba() colour string into components including alpha.
     * @param {string} rgb - e.g. "rgb(255, 255, 255)" or "rgba(0, 0, 0, 0)"
     * @returns {{r:number,g:number,b:number,a:number}|null} null if parsing failed
     */
    parseRgb(rgb) {
        if (!rgb) return null;
        const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (!match) return null;
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
            a: match[4] !== undefined ? parseFloat(match[4]) : 1
        };
    }

    getHUDHTML() {
        return `
      <div class="fishbowl-hud-container">
        <!-- Left panel for activity logs -->
        <div class="fishbowl-panel fishbowl-panel-left ">
          <div id="activity-progress" class="hud-panel-content" hidden role="status" aria-live="polite">
            <div class="progress-container"></div>
          </div>
          <div id="activity-feed" class="hud-panel-content" hidden></div>
        </div>

        <!-- Left column for extra info panels (not subject to right-panel cap) -->
        <div class="fishbowl-panel fishbowl-panel-left-column">
          <div id="hash-panel" class="info-panel">
            <header class="info-panel-header">
              <div class="info-panel-header-left">
                <span class="info-panel-dot"></span>
                <span class="info-panel-header-label">Hashes</span>
              </div>
              <span class="info-panel-count" id="hash-panel-count">0</span>
            </header>
            <div class="info-panel-content" id="hash-list"></div>
          </div>
        </div>

        <!-- Right panel for IPs, ASNs, Windows event IDs, and SIDs -->
        <div class="fishbowl-panel fishbowl-panel-right">
          <div id="ip-panel" class="info-panel">
            <header class="info-panel-header">
              <div class="info-panel-header-left">
                <span class="info-panel-dot"></span>
                <span class="info-panel-header-label">IPs</span>
              </div>
              <span class="info-panel-count" id="ip-panel-count">0</span>
            </header>
            <div class="info-panel-content" id="ip-list"></div>
          </div>

          <div id="asn-panel" class="info-panel">
            <header class="info-panel-header">
              <div class="info-panel-header-left">
                <span class="info-panel-dot"></span>
                <span class="info-panel-header-label">ASNs</span>
              </div>
              <span class="info-panel-count" id="asn-panel-count">0</span>
            </header>
            <div class="info-panel-content" id="asn-list"></div>
          </div>

          <div id="domain-panel" class="info-panel">
            <header class="info-panel-header">
              <div class="info-panel-header-left">
                <span class="info-panel-dot"></span>
                <span class="info-panel-header-label">Domains</span>
              </div>
              <span class="info-panel-count" id="domain-panel-count">0</span>
            </header>
            <div class="info-panel-content" id="domain-list"></div>
          </div>

          <div id="file-panel" class="info-panel">
            <header class="info-panel-header">
              <div class="info-panel-header-left">
                <span class="info-panel-dot"></span>
                <span class="info-panel-header-label">Files</span>
              </div>
              <span class="info-panel-count" id="file-panel-count">0</span>
            </header>
            <div class="info-panel-content" id="file-list"></div>
          </div>

          <div id="event-panel" class="info-panel">
            <header class="info-panel-header">
              <div class="info-panel-header-left">
                <span class="info-panel-dot"></span>
                <span class="info-panel-header-label">Events</span>
              </div>
              <span class="info-panel-count" id="event-panel-count">0</span>
            </header>
            <div class="info-panel-content" id="event-list"></div>
          </div>

          <div id="sid-panel" class="info-panel">
            <header class="info-panel-header">
              <div class="info-panel-header-left">
                <span class="info-panel-dot"></span>
                <span class="info-panel-header-label">SIDs</span>
              </div>
              <span class="info-panel-count" id="sid-panel-count">0</span>
            </header>
            <div class="info-panel-content" id="sid-list"></div>
          </div>
        </div>
      </div>
    `;
    }

    /**
     * Render a small banner in the shadow root prompting the user to re-pair
     * when the backend has rejected the extension's signature. The banner is
     * driven by the `fishbowlNeedsPairing` storage flag - the same source of
     * truth that triggers the auto-spawned pair window in background.js.
     */
    installPairingBanner() {
        if (!this.hudShadowRoot) return;

        const banner = document.createElement('div');
        banner.className = 'fb-pair-banner';
        banner.setAttribute('role', 'alert');
        banner.style.display = 'none';
        banner.innerHTML = `
            <div class="fb-pair-banner-badge">
                <span class="fb-pair-banner-dot"></span>
                PAIRING REQUIRED
            </div>
            <div class="fb-pair-banner-body">
                <div class="fb-pair-banner-title">Backend rejected this extension’s signature</div>
                <div class="fb-pair-banner-sub">Pairing required to restore the connection. Check the backend console for the pairing code.</div>
            </div>
            <div class="fb-pair-banner-actions">
                <button type="button" class="fb-pair-banner-btn">Pair now</button>
                <button type="button" class="fb-pair-banner-dismiss" title="Dismiss">&times;</button>
            </div>
        `;
        this.hudShadowRoot.appendChild(banner);
        this._pairBannerEl = banner;

        const btn = banner.querySelector('.fb-pair-banner-btn');
        btn.addEventListener('click', () => {
            const action = (globalThis.FishBowlContracts?.ACTIONS?.PAIR_NOW) || 'fishbowl_pair_now';
            try { browser.runtime.sendMessage({ action }); } catch (e) { console.debug('[FishBowl SecurityHUD] Failed to send pair-now message', e); }
        });

        const dismissBtn = banner.querySelector('.fb-pair-banner-dismiss');
        dismissBtn.addEventListener('click', () => setVisible(false));

        const setVisible = (visible) => {
            if (!this._pairBannerEl) return;
            this._pairBannerEl.style.display = visible ? 'flex' : 'none';
        };

        // Initial state from storage so a reload mid-error still shows it.
        try {
            browser.storage.local.get('fishbowlNeedsPairing').then((stored) => {
                if (stored && stored.fishbowlNeedsPairing === true) {
                    setVisible(true);
                    window.FishBowlUiManager?.addFeedEntry?.('FishBowl needs pairing - see banner', 'warning');
                }
            }).catch(() => {});
        } catch (e) { console.debug('[FishBowl SecurityHUD] Failed to read initial pairing state', e); }

        // React to live transitions of the pairing flag.
        try {
            browser.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !('fishbowlNeedsPairing' in changes)) return;
                const { oldValue, newValue } = changes.fishbowlNeedsPairing;
                if (oldValue === newValue) return;
                setVisible(newValue === true);
                if (newValue === true) {
                    window.FishBowlUiManager?.addFeedEntry?.('FishBowl needs pairing - see banner', 'warning');
                }
            });
        } catch (e) { console.debug('[FishBowl SecurityHUD] Failed to register pairing-flag listener', e); }
    }

    attachEventListeners() {
        // Check viewport width on initialization
        this.checkResponsivePanelVisibility();

        // Add resize listener to check viewport width
        this.boundResizeHandler = () => {
            this.checkResponsivePanelVisibility();
        };
        window.addEventListener('resize', this.boundResizeHandler);

        // Ensure DOM cleanup on page unload (listener fire-and-forget is fine here)
        window.addEventListener('beforeunload', () => this.cleanup(), { once: true });

        // Listen for settings changes from popup and other events
        browser.runtime.onMessage.addListener((message) => {
            if (message.action === 'settingsUpdated') {
                this.settings = message.settings;

                // Update HUD visibility
                if (this.settings.showVisualUpdates) {
                    this.show();
                } else {
                    this.hide();
                }

                // Update activity feed visibility
                this.updateActivityFeedVisibility();

                this.applyInfoPanelOpacity();
                this.applyPanelHeaderVisibility();

                this.updateTheme();

                if (window.FishBowlDraggablePanels && typeof window.FishBowlDraggablePanels.applySavedVisibility === 'function') {
                    window.FishBowlDraggablePanels.applySavedVisibility();
                }

                try {
                    const cached = this._analysisCache?.[window.location.href] || this.lastAnalysisResponse;
                    if (cached) {
                        this.processAnalysisResults(cached);
                    }
                } catch (e) {
                    console.warn('[FishBowl HUD] Failed to re-apply analysis results after settingsUpdated', e);
                }
            }
        });
    }

    isInputFocused() {
        const activeElement = document.activeElement;
        return (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true' ||
            activeElement.isContentEditable
        );
    }

    /**
     * Get current settings from storage or use defaults
     * @returns {Promise<Object>} Settings object
     */
    async getSettings() {
        try {
            const hostname = (() => {
                try {
                    return window.location?.hostname || '';
                } catch (e) {
                    console.warn('[FishBowl HUD] Failed to get hostname', e);
                    return '';
                }
            })();

            const domainKey = FishBowlConsts.domainSettingsKeyForHost(hostname);

            const result = await browser.storage.local.get(domainKey ? ['settings', domainKey] : ['settings']);
            const globalSettings = result?.settings || {};
            const domainSettings = domainKey ? (result?.[domainKey] || {}) : {};

            return {
                ...FishBowlConfig.DEFAULT_SETTINGS,
                ...globalSettings,
                ...domainSettings
            };
        } catch (error) {
            console.warn('Error getting settings from storage, using defaults:', error);
            return FishBowlConfig.DEFAULT_SETTINGS;
        }
    }

    buildAnalysisHtml() {
        return this.analysis.buildAnalysisHtml(document);
    }

    /**
     * Perform security analysis of the current page
     * @returns {Promise<void>}
     */
    async performAnalysis(silent = false) {
        if (this.analysisInProgress) {
            window.FishBowlUiManager.addFeedEntry("Analysis already in progress...", "warning");
            return;
        }

        this.analysisInProgress = true;

        try {
            if (window.FishBowlUiManager) {
                window.FishBowlUiManager.setActivityProgressActive('analysis', true);
                window.FishBowlUiManager.setActivityProgressIndeterminate('analysis', true);
                window.FishBowlUiManager.setActivityProgressStatus('analysis', 'Scanning...');
            }
        } catch (e) {
            console.warn('[FishBowl HUD] Failed to show analysis progress', e);
        }

        // Reload settings to ensure we have the latest
        await this.loadSettings();

        await FishBowlServicePageWait.waitForCurrentPageServiceLoadSelectorsIfNeeded(FishBowlConfig.ALL_SERVICES);

        try {
            const settings = await this.getSettings();
            const html = this.buildAnalysisHtml();
            const analysisData = {
                url: window.location.href,
                timestamp: Date.now(),
                html: html,
                settings: settings
            };

            const response = await sendAnalysisRequest(analysisData);

            if (response.success) {
                let localResponse = await this.analysis.hydrateCachedResponse(
                    response,
                    window.FishBowlCacheService,
                    FishBowlConsts
                );

                // Cache per-URL so settings changes can re-apply highlights/panels
                // and so navigating back to a page doesn't flash stale results
                if (!this._analysisCache) this._analysisCache = {};
                this._analysisCache[window.location.href] = localResponse;
                this.lastAnalysisResponse = localResponse;
                await this.processAnalysisResults(localResponse, silent);

                try {
                    if (window.FishBowlUiManager) {
                        window.FishBowlUiManager.completeActivityProgress('analysis');
                    }
                } catch (e) {
                    console.warn('[FishBowl HUD] Failed to complete analysis progress', e);
                }
            } else {
                window.FishBowlUiManager.addFeedEntry("Analysis failed: " + (response.message || "Unknown error"), "error");
                throw new Error("Analysis failed");
            }
        } catch (error) {
            console.error("FishBowl analysis error:", error);

            // Handle backend connectivity issues
            if (error.message === "Failed to fetch" ||
                error.name === "TypeError" ||
                error.message.includes("NetworkError") ||
                error.message.includes("Network Error") ||
                error.message.includes("Connection refused")) {
                const errorMsg = `Backend server appears to be down or unreachable. It maye be due to the page CSP settings blocking the request or the backend server not being started.`;
                window.FishBowlUiManager.addFeedEntry(errorMsg, "error");
            } else {
                const errorMsg = `Scan failed: ${error.message}`;
                window.FishBowlUiManager.addFeedEntry(errorMsg, "error");
            }
        } finally {
            this.analysisInProgress = false;

            try {
                if (window.FishBowlUiManager) {
                    window.FishBowlUiManager.setActivityProgressActive('analysis', false);
                }
            } catch (e) {
                console.warn('[FishBowl HUD] Failed to hide analysis progress', e);
            }
        }
    }

    processAnalysisResults(analysis, silent = false) {

        // Update UI panels with results based on settings
        if (this.settings.scanIpAddresses) {
            window.FishBowlUiManager.updateContentPanel('ip', analysis.ipAddresses || []);
        }

        // Process ASN results if enabled in settings
        if (this.settings.scanAsn) {
            window.FishBowlUiManager.updateContentPanel('asn', analysis.asNumbers || []);
        }

        // Process domain results if enabled in settings
        if (this.settings.scanDomains) {
            window.FishBowlUiManager.updateContentPanel('domain', analysis.domains || []);
        }

        if (this.settings.scanEventIds) {
            window.FishBowlUiManager.updateContentPanel('event', analysis.windowsEvents || []);
        }

        if (this.settings.scanSids) {
            window.FishBowlUiManager.updateContentPanel('sid', analysis.sids || []);
        }

        if (this.settings.scanHashes) {
            window.FishBowlUiManager.updateContentPanel('hash', analysis.hashes || []);
        }

        if (this.settings.scanFiles) {
            window.FishBowlUiManager.updateContentPanel('file', analysis.files || []);
        }

        if (window.FishBowlDraggablePanels && typeof window.FishBowlDraggablePanels.applySavedVisibility === 'function') {
            window.FishBowlDraggablePanels.applySavedVisibility();
        }

        // Apply DOM highlighting for all content types, pass settings to control what gets highlighted
        if (window.FishBowlDomHighlighter && !(window.FishBowlUiManager && window.FishBowlUiManager.highlightsDisabled)) {
            window.FishBowlDomHighlighter.highlightAllContent(analysis, this.settings);
        }

        // Keep the Entity Inspector in sync if it's open (no reopen needed).
        if (window.FishBowlUiManager && typeof window.FishBowlUiManager.refreshEntityInspector === 'function') {
            window.FishBowlUiManager.refreshEntityInspector();
        }

        // Update the feed with summary message (skip on automatic/silent scans:
        // initial load, SPA navigation re-scans, and remounts).
        if (!silent) {
            window.FishBowlUiManager.addFeedEntry(
                `Scan complete - Found ${analysis.ipAddresses?.length || 0} IPs, ${analysis.asNumbers?.length || 0} ASNs, ${analysis.domains?.length || 0} domains, ${analysis.windowsEvents?.length || 0} event codes, ${analysis.sids?.length || 0} SIDs, ${analysis.hashes?.length || 0} hashes, ${analysis.files?.length || 0} files`,
                'complete'
            );
        }
    }

    show() {
        if (this.hud) {
            this.hud.style.display = 'flex';
            this.isVisible = true;

            // Update settings if this was triggered by user action
            if (!this.settings.showVisualUpdates) {
                this.settings.showVisualUpdates = true;
                this.saveSettings();
            }
        }
    }

    hide() {
        if (this.hud) {
            this.hud.style.display = 'none';
            this.isVisible = false;

            // Update settings if this was triggered by user action
            if (this.settings.showVisualUpdates) {
                this.settings.showVisualUpdates = false;
                this.saveSettings();
            }
        }
    }

    /**
     * Cleans up resources when the HUD is being removed
     */
    cleanup() {
        // Remove resize event listener
        if (this.boundResizeHandler) {
            window.removeEventListener('resize', this.boundResizeHandler);
        }

        // Stop the self-healing guard so it doesn't re-attach the host during teardown
        this.teardownHostAttachmentGuard();

        // Remove the shadow host from DOM if it exists
        if (this.hudHost && this.hudHost.parentNode) {
            this.hudHost.parentNode.removeChild(this.hudHost);
        }
        this.hud = null;
        this.hudShadowRoot = null;
        this.hudElement = null;
        this.hudHost = null;
        this._panelLeft = null;
        this._panelRight = null;
        this._panelLeftColumn = null;
        this._analysisCache = null;
    }

    /**
     * Toggle HUD visibility
     */
    toggleVisibility() {
        if (this.isVisible) {
            this.hide();
            // window.FishBowlUiManager.addFeedEntry("HUD hidden (toggle with Alt)", "info");
        } else {
            this.show();
            // window.FishBowlUiManager.addFeedEntry("HUD shown (toggle with Alt)", "info");
        }
    }

    /**
     * Save current settings to storage
     */
    saveSettings() {
        try {
            if (browser.storage && browser.storage.local) {
                browser.storage.local.set({ settings: this.settings }, () => {
                    if (browser.runtime.lastError) {
                        console.warn('Error saving settings:', browser.runtime.lastError);
                    }
                });
            } else {
                console.warn('Chrome storage API not available, settings not saved');
            }
        } catch (error) {
            console.warn('Error accessing Chrome storage, settings not saved:', error);
        }
    }

    /**
     * Update activity feed visibility based on settings
     */
    updateActivityFeedVisibility() {
        if (!this.hud) return;

        const activityFeedPanel = this._panelLeft || this.hud.querySelector('.fishbowl-panel-left');
        if (!activityFeedPanel) return;

        activityFeedPanel.style.display = this.settings.showActivityFeed ? 'flex' : 'none';
    }

    /**
     * Toggle activity feed visibility
     * @param {Boolean} show Whether to show the activity feed
     */
    toggleActivityFeed(show) {
        if (typeof show !== 'undefined') {
            this.settings.showActivityFeed = show;
        } else {
            this.settings.showActivityFeed = !this.settings.showActivityFeed;
        }

        this.updateActivityFeedVisibility();
        this.saveSettings();

        const action = this.settings.showActivityFeed ? 'shown' : 'hidden';
        window.FishBowlUiManager.addFeedEntry(`Activity feed ${action}`, 'info');
    }

    /**
     * Check viewport width and toggle panel visibility based on screen size
     */
    checkResponsivePanelVisibility() {
        const mobileBreakpoint = 768;
        const currentWidth = window.innerWidth;

        const leftPanel = this._panelLeft;
        const rightPanel = this._panelRight;
        const leftColumnPanel = this._panelLeftColumn;

        if (!leftPanel || !rightPanel || !leftColumnPanel) return;

        if (currentWidth < mobileBreakpoint) {
            // On small screens, hide panels but remember they were visible
            if (leftPanel.style.display !== 'none') {
                this.panelsVisibleBeforeResize = true;

                // Hide panels
                leftPanel.style.display = 'none';
                rightPanel.style.display = 'none';
                leftColumnPanel.style.display = 'none';

                // Add a hint for mobile users
                window.FishBowlUiManager.addFeedEntry("HUD hidden (window is too small)", "info");
            }
        } else if (this.panelsVisibleBeforeResize) {
            // Restore panel visibility on larger screens
            leftPanel.style.display = 'flex';
            rightPanel.style.display = 'flex';
            leftColumnPanel.style.display = 'flex';
            this.panelsVisibleBeforeResize = false;
        }
    }
}
