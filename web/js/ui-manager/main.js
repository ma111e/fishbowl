/**
 * FishBowl Security Extension - UI Manager (Coordinator)
 * Wires up sub-modules and exposes the public API via delegation.
 * Sub-modules: FishBowlActivityFeed, FishBowlSelectionManager, FishBowlPanelManager, FishBowlExecutionMode
 */

class FishBowlUiManager {
    /**
     * Constructor for the UI Manager
     */
    constructor() {
        // Panel visibility settings
        this.panelVisibility = {
            ipAddresses: true,
            windowsEvents: true,
            networkActivity: true,
            recentActivity: true,
            securityIdentifiers: true
        };

        // Constants for UI animations
        this.UI_CONSTANTS = {
            ACTIVITY_LOG_TIMEOUT_MS: 5000,
            PANEL_HIGHLIGHT_TIMEOUT_MS: 5000,
            DEFAULT_PANEL_OPACITY: 0.6
        };

        this.panelsDisabled = false;
        this.highlightsDisabled = false;

        // --- Activity Progress ---
        this.activityProgressUi = (() => {
            try {
                if (window.FishBowlActivityProgress) {
                    return new window.FishBowlActivityProgress();
                }
            } catch (e) {
                console.warn('[FishBowl UiManager] Failed to initialize activity progress module', e);
            }
            return null;
        })();

        // --- Activity Feed sub-module ---
        this.activityFeed = new FishBowlActivityFeed({
            timeoutMs: this.UI_CONSTANTS.ACTIVITY_LOG_TIMEOUT_MS
        });

        // --- Selection sub-module ---
        this.selectionManager = new FishBowlSelectionManager({
            addFeedEntry: (msg, type) => this.addFeedEntry(msg, type),
            setActivityProgressLabel: (k, t) => this.setActivityProgressLabel(k, t),
            setActivityProgressActive: (k, a) => this.setActivityProgressActive(k, a),
            setActivityProgressIndeterminate: (k, a) => this.setActivityProgressIndeterminate(k, a),
            setActivityProgressStatus: (k, t) => this.setActivityProgressStatus(k, t),
        });

        // --- Panel sub-module ---
        this.panelManager = new FishBowlPanelManager({
            toggleItemSelection: (el, ctrl, shift) => this.selectionManager.toggleItemSelection(el, ctrl, shift),
        });

        // --- Execution Mode sub-module ---
        this.executionModeManager = new FishBowlExecutionMode();

        // --- Entity Search sub-module ---
        this.entitySearch = new FishBowlEntitySearch();

        // --- Entity Inspector sub-module ---
        this.entityInspector = new FishBowlEntityInspector();

        console.debug('FishBowl UI Manager initialized');
    }

    /**
     * Returns the shadow root where HUD elements live, or document as fallback.
     * Sub-modules should use this to query HUD-internal elements.
     */
    get hudRoot() {
        return window.fishTankHUD?.hudShadowRoot || document;
    }

    // =====================================================================
    // Activity Progress (thin wrappers)
    // =====================================================================

    setActivityProgressLabel(kind, text) {
        try {
            this.activityProgressUi?.setLabel(kind, text);
        } catch (e) {
            console.warn('[FishBowl UiManager] Failed to set activity progress label', e);
        }
    }

    setActivityProgressStatus(kind, text) {
        try {
            this.activityProgressUi?.setStatus(kind, text);
        } catch (e) {
            console.warn('[FishBowl UiManager] Failed to set activity progress status', e);
        }
    }

    setActivityProgressPercent(kind, pct) {
        try {
            this.activityProgressUi?.setPercent(kind, pct);
        } catch (e) {
            console.warn('[FishBowl UiManager] Failed to set activity progress percent', e);
        }
    }

    setActivityProgressIndeterminate(kind, active = true) {
        try {
            this.activityProgressUi?.setIndeterminate(kind, active);
        } catch (e) {
            console.warn('[FishBowl UiManager] Failed to set activity progress indeterminate', e);
        }
    }

    setActivityProgressActive(kind, active = true) {
        try {
            this.activityProgressUi?.setActive(kind, active);
        } catch (e) {
            console.warn('[FishBowl UiManager] Failed to set activity progress active state', e);
        }
    }

    completeActivityProgress(kind) {
        try {
            this.activityProgressUi?.complete(kind);
        } catch (e) {
            console.warn('[FishBowl UiManager] Failed to complete activity progress', e);
        }
    }

    // =====================================================================
    // Activity Feed delegation
    // =====================================================================

    addFeedEntry(message, type = "info") {
        this.activityFeed.addEntry(message, type);
    }

    // =====================================================================
    // Selection delegation
    // =====================================================================

    toggleItemSelection(element, ctrlKey, shiftKey) {
        this.selectionManager.toggleItemSelection(element, ctrlKey, shiftKey);
    }

    updatePanelHeader(panelId) {
        this.selectionManager.updatePanelHeader(panelId);
    }

    selectAllInPanel(panelId) {
        this.selectionManager.selectAllInPanel(panelId);
    }

    getPanelIdFromElement(element) {
        return this.selectionManager.getPanelIdFromElement(element);
    }

    updateSelectionPanel() {
        this.selectionManager.updateSelectionPanel();
    }

    clearSelection() {
        this.selectionManager.clearSelection();
    }

    determineSelectionType() {
        return this.selectionManager.determineSelectionType();
    }

    initSelectionHandlers() {
        this.selectionManager.initSelectionHandlers();
    }

    copySelectedItemsToClipboard() {
        this.selectionManager.copySelectedItemsToClipboard();
    }

    toggleSelection(type, value, ctrlKey, shiftKey) {
        this.selectionManager.toggleSelection(type, value, ctrlKey, shiftKey);
    }

    updateSelectedItems() {
        this.selectionManager.updateSelectedItems();
    }

    scrollToHighlightedContent(type, value) {
        this.selectionManager.scrollToHighlightedContent(type, value);
    }

    executeDoubleClickAction(entityType, value) {
        this.selectionManager.executeDoubleClickAction(entityType, value);
    }

    // =====================================================================
    // Panel delegation
    // =====================================================================

    updateContentPanel(contentType, items) {
        this.panelManager.updateContentPanel(contentType, items);
    }

    highlightPanel(panelId) {
        this.panelManager.highlightPanel(panelId);
    }

    redistributePanels() {
        this.panelManager.redistributePanels();
    }

    // =====================================================================
    // Execution Mode delegation
    // =====================================================================

    toggleExecutionMode() {
        this.executionModeManager.toggle();
    }

    openEntitySearch() {
        this.entitySearch.open();
    }

    closeEntitySearch() {
        this.entitySearch.close();
    }

    openEntityInspector(type, value) {
        this.entityInspector.open(type ? { type, value } : undefined);
    }

    closeEntityInspector() {
        this.entityInspector.close();
    }

    refreshEntityInspector() {
        this.entityInspector.scheduleRefresh();
    }

    /**
     * Collect every entity from the latest analysis into a flat, normalized list.
     * Shared by the entity search overlay and the entity inspector so both read
     * the same shape: { value, type, typeLabel, verdict, badges, cachedData, raw }.
     * Reads window.fishTankHUD.lastAnalysisResponse (no instance state).
     * @returns {Array<Object>}
     */
    collectAllEntities(response = window.fishTankHUD?.lastAnalysisResponse) {
        const analysis = response;
        if (!analysis) return [];

        const entities = [];
        const push = (value, type, typeLabel, item, hasVerdict = true) => {
            entities.push({
                value: (value || '').toString(),
                type,
                typeLabel,
                verdict: hasVerdict ? (item.verdict || item.cachedData?.worstVerdict || '') : '',
                badges: hasVerdict ? (item.cachedData?.badges || []) : [],
                cachedData: hasVerdict ? (item.cachedData || null) : null,
                raw: item,
            });
        };

        if (Array.isArray(analysis.ipAddresses)) {
            for (const item of analysis.ipAddresses) push(item.ip, 'ip', 'IP', item);
        }
        if (Array.isArray(analysis.domains)) {
            for (const item of analysis.domains) push(item.domain, 'domain', 'Domain', item);
        }
        if (Array.isArray(analysis.hashes)) {
            for (const item of analysis.hashes) {
                const kind = (item.kind || '').toUpperCase();
                push(item.value, 'hash', kind ? `Hash (${kind})` : 'Hash', item);
            }
        }
        if (Array.isArray(analysis.files)) {
            for (const item of analysis.files) push(item.file, 'file', 'File', item);
        }
        if (Array.isArray(analysis.asNumbers)) {
            for (const item of analysis.asNumbers) {
                const text = `${item.number || ''} ${item.name || ''}`.trim();
                push(text, 'asn', 'ASN', item);
            }
        }
        if (Array.isArray(analysis.windowsEvents)) {
            for (const item of analysis.windowsEvents) push(item.eventId, 'event', 'Event ID', item, false);
        }
        if (Array.isArray(analysis.sids)) {
            for (const item of analysis.sids) push(item.sid, 'sid', 'SID', item, false);
        }

        return entities;
    }

    // =====================================================================
    // HUD Visibility Controls (kept in coordinator - cross-cutting)
    // =====================================================================

    disablePanels() {
        const root = this.hudRoot;
        const selectionPanel = root.getElementById('selection-actions-panel');
        if (selectionPanel && selectionPanel.parentNode) {
            selectionPanel.parentNode.removeChild(selectionPanel);
        }

        const existingHud = root.getElementById(FishBowlConfig.HUD_ID);
        if (existingHud && existingHud.parentNode) {
            existingHud.parentNode.removeChild(existingHud);
        }

        this.panelsDisabled = true;
    }

    enablePanels() {
        if (!this.panelsDisabled) return;

        this.panelsDisabled = false;
        if (typeof this.resetHUD === 'function') {
            this.resetHUD();
        } else if (window.fishTankHUD && typeof window.fishTankHUD.performAnalysis === 'function') {
            window.fishTankHUD.performAnalysis();
        }
    }

    togglePanelsDisabled() {
        if (this.panelsDisabled) {
            this.enablePanels();
        } else {
            this.disablePanels();
        }
    }

    disableHighlights() {
        if (window.FishBowlDomHighlighter && typeof window.FishBowlDomHighlighter.clearHighlights === 'function') {
            window.FishBowlDomHighlighter.clearHighlights();
        }

        this.highlightsDisabled = true;
    }

    enableHighlights() {
        if (!this.highlightsDisabled) return;

        this.highlightsDisabled = false;
        if (window.fishTankHUD && typeof window.fishTankHUD.performAnalysis === 'function') {
            window.fishTankHUD.performAnalysis();
        }
    }

    toggleHighlightsDisabled() {
        if (this.highlightsDisabled) {
            this.enableHighlights();
        } else {
            this.disableHighlights();
        }
    }

    disableHud() {
        this.disablePanels();
        this.disableHighlights();
        this.setTextareaOverlaysHidden(true);
    }

    enableHud() {
        const wasPanelsDisabled = this.panelsDisabled;
        this.panelsDisabled = false;
        this.highlightsDisabled = false;
        this.setTextareaOverlaysHidden(false);

        if (wasPanelsDisabled && typeof this.resetHUD === 'function') {
            this.resetHUD();
        } else if (window.fishTankHUD && typeof window.fishTankHUD.performAnalysis === 'function') {
            window.fishTankHUD.performAnalysis();
        }
    }

    toggleHudDisabled() {
        if (this.panelsDisabled && this.highlightsDisabled) {
            this.enableHud();
        } else {
            this.disableHud();
        }
    }

    setPanelsHidden(hidden) {
        if (hidden) {
            document.body.classList.add('fishbowl-panels-hidden');
        } else {
            document.body.classList.remove('fishbowl-panels-hidden');
        }
    }

    togglePanelsHidden() {
        document.body.classList.toggle('fishbowl-panels-hidden');
    }

    setHighlightsHidden(hidden) {
        if (hidden) {
            document.body.classList.add('fishbowl-highlights-hidden');
        } else {
            document.body.classList.remove('fishbowl-highlights-hidden');
        }
    }

    toggleHighlightsHidden() {
        document.body.classList.toggle('fishbowl-highlights-hidden');
    }

    hideAllHudElements() {
        this.setPanelsHidden(true);
        this.setHighlightsHidden(true);
        this.setTextareaOverlaysHidden(true);
    }

    toggleAllHudElements() {
        const panelsHidden = document.body.classList.contains('fishbowl-panels-hidden');
        const highlightsHidden = document.body.classList.contains('fishbowl-highlights-hidden');
        const shouldShow = panelsHidden && highlightsHidden;

        this.setPanelsHidden(!shouldShow);
        this.setHighlightsHidden(!shouldShow);
        this.setTextareaOverlaysHidden(!shouldShow);
    }

    toggleTextareaOverlays() {
        try {
            if (window.FishBowlDomHighlighter && typeof window.FishBowlDomHighlighter.toggleAllTextareaOverlays === 'function') {
                window.FishBowlDomHighlighter.toggleAllTextareaOverlays();
            }
        } catch (e) {
            console.warn('[FishBowl UiManager] Failed to toggle textarea overlays', e);
        }
    }

    setTextareaOverlaysHidden(hidden) {
        try {
            const layers = document.querySelectorAll('[data-fishbowl-textarea-inspect-layer="true"]');
            for (const layer of layers) {
                layer.style.display = hidden ? 'none' : '';
            }
        } catch (e) {
            console.warn('[FishBowl UiManager] Failed to toggle textarea overlays', e);
        }
    }

    // =====================================================================
    // Theme (cross-cutting: storage + HUD + feed)
    // =====================================================================

    toggleTheme() {
        try {
            browser.storage.local.get(['settings']).then(result => {
                const settings = result?.settings || FishBowlConfig.DEFAULT_SETTINGS;

                const hostname = (() => {
                    try {
                        return window.location?.hostname || '';
                    } catch (e) {
                        console.warn('[FishBowlUiManager] Failed to get hostname for theme toggle', e);
                        return '';
                    }
                })();

                const domainKey = FishBowlConsts.domainSettingsKeyForHost(hostname);

                const applyAndNotify = (mergedSettings, labelHost) => {
                    try {
                        if (window.fishTankHUD) {
                            window.fishTankHUD.settings = mergedSettings;
                            if (typeof window.fishTankHUD.updateTheme === 'function') {
                                window.fishTankHUD.updateTheme();
                            } else if (typeof window.fishTankHUD.applyTheme === 'function') {
                                window.fishTankHUD.applyTheme(mergedSettings.theme);
                            }
                        }
                    } catch (e) {
                        console.warn('[FishBowlUiManager] Failed to apply theme after settings update', e);
                    }

                    this.addFeedEntry(`Theme set to ${labelHost ? mergedSettings.theme + ' for ' + labelHost : mergedSettings.theme}`, 'info');
                };

                if (!domainKey) {
                    const currentTheme = settings.theme === 'light' ? 'light' : 'dark';
                    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
                    settings.theme = nextTheme;
                    browser.storage.local.set({ settings }).then(() => {
                        applyAndNotify(settings, '');
                    });
                    return;
                }

                browser.storage.local.get([domainKey]).then(domainResult => {
                    const domainSettings = domainResult?.[domainKey] || {};
                    const currentTheme = (domainSettings.theme === 'dark' || domainSettings.theme === 'light')
                        ? domainSettings.theme
                        : (settings.theme === 'light' ? 'light' : 'dark');
                    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';

                    domainSettings.theme = nextTheme;

                    browser.storage.local.set({ settings, [domainKey]: domainSettings }).then(() => {
                        const merged = { ...settings, ...domainSettings };
                        applyAndNotify(merged, hostname);
                    });
                });
            });
        } catch (error) {
            console.error('Failed to toggle theme:', error);
        }
    }

    // =====================================================================
    // HUD Reset (cross-cutting)
    // =====================================================================

    resetHUD() {
        try {
            const root = this.hudRoot;
            const selectionPanel = root.getElementById('selection-actions-panel');
            if (selectionPanel && selectionPanel.parentNode) {
                selectionPanel.parentNode.removeChild(selectionPanel);
            }

            const existingHud = root.getElementById(FishBowlConfig.HUD_ID);
            if (existingHud && existingHud.parentNode) {
                existingHud.parentNode.removeChild(existingHud);
            }

            if (window.fishTankHUD && typeof window.fishTankHUD.createHUD === 'function') {
                window.fishTankHUD.hud = null;
                window.fishTankHUD.createHUD();
                this.initSelectionHandlers();
                this.addFeedEntry('HUD reset', 'info');

                if (typeof window.fishTankHUD.performAnalysis === 'function') {
                    window.fishTankHUD.performAnalysis();
                }
            }
        } catch (error) {
            console.error('Failed to reset FishBowl HUD:', error);
        }
    }

    // =====================================================================
    // Utility methods
    // =====================================================================

    getScoreClass(score) {
        if (score >= 80) return 'score-good';
        if (score >= 60) return 'score-medium';
        if (score >= 40) return 'score-warning';
        return 'score-bad';
    }

    updateElement(id, value) {
        const root = this.hudRoot;
        const element = root.getElementById(id);
        if (element) element.textContent = value;
    }
}
