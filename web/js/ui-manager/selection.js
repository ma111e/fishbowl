/**
 * FishBowl Security Extension - UI Manager Selection
 * Handles item selection state, clipboard, contextual action buttons,
 * keyboard shortcuts, action dispatch, and scroll-to-highlight.
 */

class FishBowlSelectionManager {
    constructor(opts) {
        this.opts = opts || {};
        this.selectedItems = [];
        this.activePanel = null;

        this.handlersInitialized = false;

        // Long-press Z state
        this._zLongPressTimer = null;
        this._zKeyDown = false;
        this._zLongPressTriggered = false;
        this._servicePicker = null;
        this.LONG_PRESS_MS = 600;
        this.TAP_MS = 150;
        this._zKeyDownTime = 0;

        // Callback to add feed entries (set by coordinator)
        this.addFeedEntry = opts.addFeedEntry || (() => { });
        // Callback for activity progress (set by coordinator)
        this.setActivityProgressLabel = opts.setActivityProgressLabel || (() => { });
        this.setActivityProgressActive = opts.setActivityProgressActive || (() => { });
        this.setActivityProgressIndeterminate = opts.setActivityProgressIndeterminate || (() => { });
        this.setActivityProgressStatus = opts.setActivityProgressStatus || (() => { });
    }

    /**
     * Returns the shadow root where HUD elements live, or document as fallback.
     */
    getRoot() {
        return window.fishTankHUD?.hudShadowRoot || document;
    }

    /**
     * Toggle selection of a panel item
     * @param {HTMLElement} element The item element
     * @param {Boolean} ctrlKey Whether Ctrl/Cmd key is pressed
     * @param {Boolean} shiftKey Whether Shift key is pressed
     */
    toggleItemSelection(element, _ctrlKey, _shiftKey) {
        const panelId = this.getPanelIdFromElement(element);

        if (this.activePanel !== null && this.activePanel !== panelId) {
            this.clearSelection();
        }

        this.activePanel = panelId;

        if (element.classList.contains('selected')) {
            element.classList.remove('selected');
            this.selectedItems = this.selectedItems.filter(item => item !== element);
        } else {
            element.classList.add('selected');
            this.selectedItems.push(element);
        }

        this.updateSelectedItems();
        this.updateSelectionPanel();
        this.updatePanelHeader(panelId);
    }

    /**
     * Update the panel header when selection state changes
     * @param {String} panelId The ID of the panel to update
     */
    updatePanelHeader(panelId) {
        if (!panelId) return;
        this.updateSelectionPanel();
    }

    /**
     * Select all items in a panel
     * @param {String} panelId The ID of the panel
     */
    selectAllInPanel(panelId) {
        if (!panelId) return;

        const items = this.getRoot().querySelectorAll(`#${panelId} .info-panel-content [data-selectable]`);
        const totalItems = items.length;

        if (totalItems === 0) return;

        let selectedCount = 0;
        items.forEach(item => {
            if (item.classList.contains('selected')) {
                selectedCount++;
            }
        });

        if (selectedCount === totalItems) {
            items.forEach(item => {
                if (item.classList.contains('selected')) {
                    item.classList.remove('selected');
                    this.selectedItems = this.selectedItems.filter(selected => selected !== item);
                }
            });

            const button = this.getRoot().querySelector(`#${panelId} .select-all-btn`);
            if (button) button.textContent = 'Select All';
        } else {
            items.forEach(item => {
                if (!item.classList.contains('selected')) {
                    item.classList.add('selected');
                    this.selectedItems.push(item);
                }
            });

            const button = this.getRoot().querySelector(`#${panelId} .select-all-btn`);
            if (button) button.textContent = 'Deselect All';
        }

        this.updateSelectedItems();
        this.updateSelectionPanel();
    }

    /**
     * Get the panel ID that an element belongs to
     * @param {HTMLElement} element The element to check
     * @returns {String} The panel ID
     */
    getPanelIdFromElement(element) {
        const types = FishBowlConsts.ENTITY_TYPES;
        for (const key in types) {
            const t = types[key];
            if (element.closest(`#${t.contentId}`)) return t.panelId;
        }
        return null;
    }

    /**
     * Update the selection actions panel with current selection info and contextual buttons
     */
    updateSelectionPanel() {
        let selectionPanel = this.getRoot().getElementById('selection-actions-panel');

        if (this.selectedItems.length === 0) {
            if (selectionPanel) {
                selectionPanel.style.display = 'none';
            }
            return;
        }

        if (!selectionPanel) {
            selectionPanel = document.createElement('div');
            selectionPanel.id = 'selection-actions-panel';
            // Append inside shadow root so styles are encapsulated
            const root = this.getRoot();
            if (root && typeof root.appendChild === 'function') {
                root.appendChild(selectionPanel);
            } else {
                document.body.appendChild(selectionPanel);
            }
            // Single delegated click listener - covers action buttons, select-all, copy, close.
            selectionPanel.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('button[data-action]');
                if (actionBtn) {
                    this.handleActionButtonClick(actionBtn.getAttribute('data-action'));
                    return;
                }
                const selectAllBtn = e.target.closest('.select-all-btn');
                if (selectAllBtn) {
                    const pid = selectAllBtn.getAttribute('data-panel-id');
                    if (pid) this.selectAllInPanel(pid);
                    return;
                }
                if (e.target.closest('.sap-close-btn')) {
                    this.clearSelection();
                    return;
                }
                if (e.target.closest('.sap-copy-btn')) {
                    this.copySelectedItemsToClipboard();
                    return;
                }
            });
        }

        // Mirror the HUD's current theme so the panel follows it (light/dark/auto).
        const themeClass = document.documentElement.classList.contains('fishbowl-theme-light')
            ? 'fishbowl-theme-light'
            : 'fishbowl-theme-dark';
        selectionPanel.classList.remove('fishbowl-theme-light', 'fishbowl-theme-dark');
        selectionPanel.classList.add(themeClass);

        // Determine which panel the selection is from
        let panelId = null;
        const firstItem = this.selectedItems[0];
        if (firstItem) {
            const firstPanel = firstItem.closest('.info-panel');
            if (firstPanel) {
                const panelIdCandidate = firstPanel.id;

                const allFromSamePanel = this.selectedItems.every(item => {
                    const itemPanel = item.closest('.info-panel');
                    return itemPanel && itemPanel.id === panelIdCandidate;
                });

                if (allFromSamePanel) {
                    panelId = panelIdCandidate;
                }
            }
        }

        // Compute total items in panel for the "of N" label
        let totalInPanel = 0;
        if (panelId) {
            const panel = this.getRoot().getElementById(panelId);
            if (panel) {
                totalInPanel = panel.querySelectorAll('.info-panel-content [data-selectable]').length;
            }
        }

        const count = this.selectedItems.length;
        const itemType = this.determineSelectionType() || 'ip';
        const ENTITY_COLORS = {
            ip: 'var(--c-ip)', domain: 'var(--c-domain)', hash: 'var(--c-hash)',
            file: 'var(--c-file)', event: 'var(--c-eventid)', sid: 'var(--c-sid)', asn: 'var(--c-asn)',
        };
        const ENTITY_LABELS = {
            ip: 'ip', domain: 'domain', hash: 'hash',
            file: 'file', event: 'event', sid: 'sid', asn: 'asn',
        };
        const entityColor = ENTITY_COLORS[itemType] || 'var(--fg-3)';
        const entityLabel = ENTITY_LABELS[itemType] || itemType;

        const selectAllMetaBtn = panelId ? `<button class="sap-meta-btn select-all-btn" data-panel-id="${panelId}"><kbd>Ctrl+A</kbd> Select all</button>` : '';

        selectionPanel.innerHTML = `
      <div class="selection-actions-panel-content">
        <div class="selection-actions-panel-header">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <span class="sap-entity-dot" style="background:${entityColor}"></span>
            <span>
              <strong style="color:var(--fg-1);font-weight:600">${count}</strong> selected<span style="color:var(--fg-4)"> · of ${totalInPanel} ${entityLabel}</span>
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
            ${selectAllMetaBtn}
            <button class="sap-meta-btn sap-copy-btn"><kbd>Ctrl+C</kbd> Copy</button>
            <button class="sap-close-btn" title="Dismiss (Esc)">✕</button>
          </div>
        </div>
        ${this.createContextualButtons()}
      </div>
    `;

        this.applySelectionPanelIcons(selectionPanel);

        selectionPanel.style.display = 'block';
    }

    applySelectionPanelIcons(selectionPanel) {
        if (!selectionPanel) return;

        const icons = selectionPanel.querySelectorAll('img.shortcut-icon[data-icon]');
        icons.forEach(img => {
            const iconKey = img.getAttribute('data-icon');
            if (!iconKey) return;

            const iconPath = FishBowlConsts.SHORTCUT_ICON_PATHS[iconKey];
            if (!iconPath) return;

            try {
                const resolvedSrc = iconPath.startsWith('http://') || iconPath.startsWith('https://')
                    ? iconPath
                    : browser.runtime.getURL(iconPath);

                img.src = resolvedSrc;
            } catch (e) {
                console.warn('[FishBowl SelectionManager] Failed to resolve icon path', e);
            }
        });
    }

    /**
     * Create contextual action buttons based on the selected items
     */
    createContextualButtons() {
        if (this.selectedItems.length === 0) return '';

        const iconPlaceholderSrc = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

        const itemType = this.determineSelectionType();

        if (itemType === 'ip') {
            return `
        <div class="selection-actions-panel-buttons">
          <button class="hint-button analyze-button" data-action="analyze-reputation" data-shortcut="z"><span class="shortcut-key">Z</span> Analyze</button>
          <button class="hint-button" data-action="entity-inspector" data-shortcut="e"><span class="shortcut-key">E</span> Inspector</button>
          <button class="hint-button" data-action="goto" data-shortcut-shift="g"><span class="shortcut-key">⇧G</span> Go to</button>
          <button class="hint-button dashboard-button" data-action="dashboard" data-shortcut="d"><span class="shortcut-key">D</span> Dashboard</button>
          <button class="hint-button" data-action="google" data-shortcut="g"><span class="shortcut-key">G</span><img class="shortcut-icon" data-icon="google" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Google</button>
          <button class="hint-button" data-action="spur" data-shortcut="s"><span class="shortcut-key">S</span><img class="shortcut-icon" data-icon="spur" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Spur</button>
          <button class="hint-button" data-action="virustotal" data-shortcut="v"><span class="shortcut-key">V</span><img class="shortcut-icon" data-icon="virustotal" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> VirusTotal</button>
          <button class="hint-button" data-action="abuseipdb" data-shortcut="a"><span class="shortcut-key">A</span><img class="shortcut-icon" data-icon="abuseipdb" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> AbuseIPDB</button>
          <button class="hint-button" data-action="whois" data-shortcut="w"><span class="shortcut-key">W</span><img class="shortcut-icon" data-icon="whois" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> WHOIS</button>
          <button class="hint-button" data-action="ipinfo" data-shortcut="i"><span class="shortcut-key">I</span><img class="shortcut-icon" data-icon="ipinfo" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> IP Info</button>
          <button class="hint-button" data-action="alienvault" data-shortcut="x"><span class="shortcut-key">X</span><img class="shortcut-icon" data-icon="alienvault" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> AlienVault OTX</button>
          <button class="hint-button" data-action="greynoise" data-shortcut="n"><span class="shortcut-key">N</span><img class="shortcut-icon" data-icon="greynoise" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> GreyNoise</button>
          <button class="hint-button" data-action="shodan" data-shortcut="o"><span class="shortcut-key">O</span><img class="shortcut-icon" data-icon="shodan" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Shodan</button>
        </div>
      `;
        } else if (itemType === 'asn') {
            return `
        <div class="selection-actions-panel-buttons">
<!--          <button class="hint-button dashboard-button" data-action="dashboard" data-shortcut="d"><span class="shortcut-key">D</span> Dashboard</button>-->
          <button class="hint-button analyze-button" data-action="analyze-reputation" data-shortcut="z"><span class="shortcut-key">Z</span> Analyze</button>
          <button class="hint-button" data-action="entity-inspector" data-shortcut="e"><span class="shortcut-key">E</span> Inspector</button>
          <button class="hint-button" data-action="goto" data-shortcut-shift="g"><span class="shortcut-key">⇧G</span> Go to</button>
          <button class="hint-button" data-action="asn" data-shortcut="i"><span class="shortcut-key">I</span><img class="shortcut-icon" data-icon="ipinfo" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> IPinfo</button>
        </div>
      `;
        } else if (itemType === 'event') {
            return `
        <div class="selection-actions-panel-buttons">
          <button class="hint-button" data-action="event-info" data-shortcut="i"><span class="shortcut-key">I</span><img class="shortcut-icon" data-icon="microsoft" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Event Info</button>
          <button class="hint-button" data-action="entity-inspector" data-shortcut="e"><span class="shortcut-key">E</span> Inspector</button>
          <button class="hint-button" data-action="goto" data-shortcut-shift="g"><span class="shortcut-key">⇧G</span> Go to</button>
        </div>
      `;
        } else if (itemType === 'sid') {
            return `
        <div class="selection-actions-panel-buttons">
          <button class="hint-button" data-action="sid-info" data-shortcut="i"><span class="shortcut-key">I</span><img class="shortcut-icon" data-icon="microsoft" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Well-known SIDs</button>
          <button class="hint-button" data-action="google" data-shortcut="g"><span class="shortcut-key">G</span><img class="shortcut-icon" data-icon="google" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Google</button>
          <button class="hint-button" data-action="entity-inspector" data-shortcut="e"><span class="shortcut-key">E</span> Inspector</button>
          <button class="hint-button" data-action="goto" data-shortcut-shift="g"><span class="shortcut-key">⇧G</span> Go to</button>
        </div>
      `;
        } else if (itemType === 'domain') {
            return `
        <div class="selection-actions-panel-buttons">
<!--          <button class="hint-button dashboard-button" data-action="dashboard" data-shortcut="d"><span class="shortcut-key">D</span> Dashboard</button>-->
          <button class="hint-button analyze-button" data-action="analyze-reputation" data-shortcut="z"><span class="shortcut-key">Z</span> Analyze</button>
          <button class="hint-button" data-action="entity-inspector" data-shortcut="e"><span class="shortcut-key">E</span> Inspector</button>
          <button class="hint-button" data-action="goto" data-shortcut-shift="g"><span class="shortcut-key">⇧G</span> Go to</button>
          <button class="hint-button" data-action="google" data-shortcut="g"><span class="shortcut-key">G</span><img class="shortcut-icon" data-icon="google" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Google</button>
          <button class="hint-button" data-action="virustotal" data-shortcut="v"><span class="shortcut-key">V</span><img class="shortcut-icon" data-icon="virustotal" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> VirusTotal</button>
        </div>
      `;
        } else if (itemType === 'hash') {
            const isSha256 = this.selectedItems.every(el => /^[a-fA-F0-9]{64}$/.test((el.getAttribute('data-content') || '').trim()));
            const bazaarBtn = isSha256
                ? `<button class="hint-button" data-action="bazaar" data-shortcut="b"><span class="shortcut-key">B</span><img class="shortcut-icon" data-icon="bazaar" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Bazaar</button>`
                : '';
            return `
        <div class="selection-actions-panel-buttons">
          <button class="hint-button analyze-button" data-action="analyze-reputation" data-shortcut="z"><span class="shortcut-key">Z</span> Analyze</button>
          <button class="hint-button" data-action="entity-inspector" data-shortcut="e"><span class="shortcut-key">E</span> Inspector</button>
          <button class="hint-button" data-action="goto" data-shortcut-shift="g"><span class="shortcut-key">⇧G</span> Go to</button>
          <button class="hint-button" data-action="virustotal" data-shortcut="v"><span class="shortcut-key">V</span><img class="shortcut-icon" data-icon="virustotal" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> VirusTotal</button>
          ${bazaarBtn}
          <button class="hint-button" data-action="google" data-shortcut="g"><span class="shortcut-key">G</span><img class="shortcut-icon" data-icon="google" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Google</button>
        </div>
      `;
        } else if (itemType === 'file') {
            return `
        <div class="selection-actions-panel-buttons">
          <button class="hint-button analyze-button" data-action="analyze-reputation" data-shortcut="z"><span class="shortcut-key">Z</span> Analyze</button>
          <button class="hint-button" data-action="entity-inspector" data-shortcut="e"><span class="shortcut-key">E</span> Inspector</button>
          <button class="hint-button" data-action="goto" data-shortcut-shift="g"><span class="shortcut-key">⇧G</span> Go to</button>
          <button class="hint-button" data-action="google" data-shortcut="g"><span class="shortcut-key">G</span><img class="shortcut-icon" data-icon="google" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Google</button>
          <button class="hint-button" data-action="virustotal" data-shortcut="v"><span class="shortcut-key">V</span><img class="shortcut-icon" data-icon="virustotal" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> VirusTotal</button>
          <button class="hint-button" data-action="chatgpt" data-shortcut="l"><span class="shortcut-key">L</span><img class="shortcut-icon" data-icon="chatgpt" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> ChatGPT</button>
          <button class="hint-button" data-action="perplexity" data-shortcut="p"><span class="shortcut-key">P</span><img class="shortcut-icon" data-icon="perplexity" src="${iconPlaceholderSrc}" alt="" aria-hidden="true"/> Perplexity</button>
        </div>
      `;
        }

        return '';
    }

    /**
     * First shortcut action after the analyze button, keyed by entity type.
     */
    static DOUBLE_CLICK_ACTION = Object.freeze({
        ip: 'dashboard',
        asn: 'asn',
        event: 'event-info',
        sid: 'sid-info',
        domain: 'google',
        hash: 'virustotal',
        file: 'google',
    });

    /**
     * Handle action button clicks and open tabs for each selected item
     * @param {String} action The action type
     */
    handleActionButtonClick(action) {
        if (this.selectedItems.length === 0) return;

        const selectionType = (this.determineSelectionType() || '').toString().trim().toLowerCase();

        const uniqueValues = Array.from(new Set(this.selectedItems
            .map(item => item?.dataset?.content)
            .filter(Boolean)));

        if (action === 'dashboard' || action === 'analyze-reputation') {
            this.clearSelection();
        }

        if (action === 'goto') {
            const firstValue = uniqueValues[0];
            if (firstValue) this.executeAction('goto', selectionType, firstValue);
            return;
        }

        uniqueValues.forEach(value => {
            this.executeAction(action, selectionType, value);
        });
    }

    /**
     * Execute a single action for a given entity type and value.
     * Shared by handleActionButtonClick and executeDoubleClickAction.
     * @param {String} action The action identifier
     * @param {String} entityType The entity type (ip, domain, hash, etc.)
     * @param {String} value The entity value
     */
    executeAction(action, entityType, value) {
        let url = '';

        switch (action) {
            case 'dashboard':
                browser.runtime.sendMessage({
                    action: "openDashboard",
                    value: value
                }, response => {
                    if (browser.runtime.lastError) {
                        console.error('Error sending message to background script:', browser.runtime.lastError);
                        this.addFeedEntry(`Error opening dashboard: ${browser.runtime.lastError.message}`, 'error');

                        const dashboardUrl = browser.runtime.getURL(`dashboard.html?ip=${encodeURIComponent(value)}`);
                        window.open(dashboardUrl, '_blank');
                    } else if (response && response.success) {
                        this.addFeedEntry(`Opened dashboard for ${value}`, 'info');
                    }
                });
                url = '';
                break;
            case 'analyze-reputation':
                {
                    const type = (entityType || '').toString().trim().toLowerCase();
                    if (!type) {
                        this.addFeedEntry(`Cannot start reputation analysis: missing entity type for ${value}`, 'error');
                        url = '';
                        break;
                    }
                    const progressKey = `reputation:${type}:${value}`;

                    try {
                        this.setActivityProgressLabel(progressKey, value);
                        this.setActivityProgressActive(progressKey, true);
                        this.setActivityProgressIndeterminate(progressKey, true);
                        this.setActivityProgressStatus(progressKey, 'Reputation');
                    } catch (e) {
                        console.warn('[FishBowl SelectionManager] Failed to show reputation analysis progress', e);
                    }

                    this.addFeedEntry(`Analyzing ${value}`, 'info');

                    browser.runtime.sendMessage({
                        action: 'analyze-reputation',
                        entityType: type,
                        value: value
                    }, _response => {
                        if (browser.runtime.lastError) {
                            console.error('Error sending message to background script:', browser.runtime.lastError);
                            this.addFeedEntry(`Error starting reputation analysis: ${browser.runtime.lastError.message}`, 'error');

                            try {
                                this.setActivityProgressActive(progressKey, false);
                            } catch (e) {
                                console.warn('[FishBowl SelectionManager] Failed to hide reputation analysis progress after send error', e);
                            }
                        }
                    });

                    url = '';
                    break;
                }
            case 'chatgpt':
                url = `https://chatgpt.com/?temporary-chat=true&q=find+what+the+web+has+to+say+about+${encodeURIComponent(`"${value}"`)}+and+explain+it`;
                break;
            case 'perplexity':
                url = `https://www.perplexity.ai/search/new?pc=firefox&q=explain+${encodeURIComponent(value)}`;
                break;
            case 'spur':
                url = `https://app.spur.us/search?q=${encodeURIComponent(value)}`;
                break;
            case 'shodan':
                url = `https://www.shodan.io/host/${encodeURIComponent(value)}`;
                break;
            case 'google':
                url = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
                break;
            case 'virustotal':
                url = `https://www.virustotal.com/gui/search/${encodeURIComponent(value)}`;
                break;
            case 'bazaar':
                url = `https://bazaar.abuse.ch/sample/${encodeURIComponent(value)}/`;
                break;
            case 'asn':
                url = `https://ipinfo.io/${value}`;
                break;
            case 'sid-info':
                url = 'https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-identifiers#well-known-sids';
                break;
            case 'event-info':
                url = `https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-${value}`;
                break;
            case 'entity-inspector':
                if (window.FishBowlUiManager && typeof window.FishBowlUiManager.openEntityInspector === 'function') {
                    window.FishBowlUiManager.openEntityInspector(entityType, value);
                }
                break; // opens the drawer directly; no url to navigate to
            case 'goto':
                this.scrollToHighlightedContent(entityType, value);
                break; // scrolls to the on-page highlight; no url to navigate to
            default:
                const service = FishBowlConfig.ALL_SERVICES.find(svc => svc.id === action);
                if (service) {
                    url = service.url.replace(FishBowlConsts.VALUE_PLACEHOLDER, value);
                }
                break;
        }

        if (url) {
            window.open(url, '_blank');
        }
    }

    /**
     * Execute the default double-click action for a given entity type and value.
     * Uses the first shortcut action after the analyze button.
     * @param {String} entityType The entity type (ip, domain, hash, etc.)
     * @param {String} value The entity value
     */
    executeDoubleClickAction(entityType, value) {
        const type = (entityType || '').toString().trim().toLowerCase();
        const action = FishBowlSelectionManager.DOUBLE_CLICK_ACTION[type];
        if (!action || !value) return;
        this.executeAction(action, type, value);
        this.addFeedEntry(`Double-click: ${action} for ${type}: ${value}`, 'info');
    }

    /**
     * Clear all selected items
     */
    clearSelection() {
        this.selectedItems.forEach(item => {
            item.classList.remove('selected');
        });

        if (globalThis.FishBowlShadowDomTools && typeof globalThis.FishBowlShadowDomTools.querySelectorAllDeep === 'function') {
            globalThis.FishBowlShadowDomTools.querySelectorAllDeep('.fishbowl-highlight.selected', document).forEach(el => {
                el.classList.remove('selected');
            });
        } else {
            document.querySelectorAll('.fishbowl-highlight.selected').forEach(el => {
                el.classList.remove('selected');
            });
        }

        this.selectedItems = [];

        const selectionPanel = this.getRoot().getElementById('selection-actions-panel');
        if (selectionPanel) selectionPanel.style.display = 'none';

        // Clear all panel headers
        this.getRoot().querySelectorAll('.info-panel').forEach(panel => {
            const panelId = panel.id;
            if (panelId) {
                this.updatePanelHeader(panelId);
            }
        });

        this.activePanel = null;
    }

    /**
     * Determine the type of items selected
     */
    determineSelectionType() {
        if (this.selectedItems.length === 0) return null;

        const firstItem = this.selectedItems[0];
        const type = firstItem.getAttribute('data-type');
        if (type) return type;

        return null;
    }

    /**
     * Initialize selection and clipboard functionality
     */
    initSelectionHandlers() {
        if (this.handlersInitialized) return;
        this.handlersInitialized = true;

        // Selection handlers for panel items (inside shadow DOM)
        this.getRoot().querySelectorAll('.info-panel-content').forEach(panel => {
            panel.addEventListener('click', (e) => {
                const target = e.target.closest('[data-selectable]');
                if (!target) return;

                const ctrlKey = e.ctrlKey || e.metaKey;
                const shiftKey = e.shiftKey;

                this.toggleItemSelection(target, ctrlKey, shiftKey);
            });

            panel.addEventListener('dblclick', (e) => {
                const target = e.target.closest('[data-selectable]');
                if (!target) return;
                console.debug(target);
                const contentType = target.getAttribute('data-type');
                const contentValue = target.getAttribute('data-content');

                if (contentType && contentValue) {
                    this.scrollToHighlightedContent(contentType, contentValue);
                }
            });
        });

        document.addEventListener('dblclick', (e) => {
            if (window.FishBowlDomHighlighter) {
                window.FishBowlDomHighlighter.handleDocumentDoubleClick(e);
            }
        });

        document.addEventListener('click', (e) => {
            if (window.FishBowlDomHighlighter) {
                window.FishBowlDomHighlighter.handleDocumentClick(e);
            }

            // Use composedPath to pierce the shadow DOM boundary - e.target is
            // retargeted to the shadow host when clicking elements inside the HUD
            // shadow root, so closest() on e.target always misses them.
            const actualTarget = (e.composedPath ? e.composedPath()[0] : null) || e.target;
            if (actualTarget.closest?.('.info-panel') ||
                actualTarget.closest?.('.select-all-btn') ||
                actualTarget.closest?.('#selection-actions-panel')) return;

            if (e.target.closest('.fishbowl-highlight')) return;
            const isRegionSelectionActive = window.FishBowlRegionSelector && window.FishBowlRegionSelector.isActive;
            const justCompletedSelection = window.FishBowlRegionSelector && window.FishBowlRegionSelector.justCompletedSelection;
            const isRegionSelectionElement = e.target.closest('.fishbowl-selection-rect');
            if (!isRegionSelectionActive &&
                !justCompletedSelection &&
                !isRegionSelectionElement) {
                this.clearSelection();
            }
        });

        // Keyboard shortcuts for copying selected items
        document.addEventListener('keydown', (e) => {
            if (this.selectedItems.length === 0) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                this.copySelectedItemsToClipboard();
                return
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                if (this.activePanel) {
                    this.selectAllInPanel(this.activePanel);
                }
                return;
            }

            if (e.key === 'Escape') {
                this.clearSelection();
                return
            }

            const activeElement = document.activeElement;
            const isInputActive = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

            if (e.key === 'Enter' && !isInputActive) {
                e.preventDefault();
                
                const selectionType = this.determineSelectionType();
                if (!selectionType) return;
                
                const uniqueValues = Array.from(new Set(this.selectedItems
                    .map(item => item?.dataset?.content)
                    .filter(Boolean)));
                
                uniqueValues.forEach(value => {
                    this.executeDoubleClickAction(selectionType, value);
                });
                return;
            }

            //TODO: set callingTabID in global settings cache ?? browser.tabs API is only available to background scripts

            const key = e.key.toLowerCase();

            // Shift+G: "Go to" - scroll the page to the selected entity's highlight.
            // Handled before the modifier early-return below since it intentionally uses Shift.
            if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && key === 'g') {
                const selectionPanel = this.getRoot().querySelector('#selection-actions-panel');
                if (!selectionPanel || this.selectedItems.length === 0 || isInputActive) return;
                const button = selectionPanel.querySelector('button[data-action="goto"]');
                if (button) {
                    button.classList.add('shortcut-pressed');
                    this.handleActionButtonClick('goto');
                    setTimeout(() => button.classList.remove('shortcut-pressed'), 300);
                    e.preventDefault();
                }
                return;
            }

            const validShortcutKeys = ['d', 'v', 'a', 'x', 'n', 'z', 'i', 'w', 's', 'g', 'l', 'p', 'b', 'o', 'e'];

            if (!validShortcutKeys.includes(key) ||
                e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

            const selectionPanel = this.getRoot().querySelector('#selection-actions-panel');
            if (!selectionPanel || this.selectedItems.length === 0 || isInputActive) return;

            // Long-press Z: start timer on keydown, fire normal or open picker on keyup/timeout
            if (key === 'z') {
                e.preventDefault();
                if (this._zKeyDown) return; // held - ignore repeat
                this._zKeyDown = true;
                this._zLongPressTriggered = false;
                this._zKeyDownTime = Date.now();

                const analyzeBtn = selectionPanel.querySelector('button[data-shortcut="z"]');
                if (analyzeBtn) {
                    analyzeBtn.classList.add('z-longpress-active');
                }

                this._zLongPressTimer = setTimeout(() => {
                    this._zLongPressTriggered = true;
                    if (analyzeBtn) analyzeBtn.classList.remove('z-longpress-active');
                    this._openServicePicker();
                }, this.LONG_PRESS_MS);
                return;
            }

            // Check if service picker is open first
            if (this._servicePicker) {
                // Service picker shortcuts: use first letter matching
                const serviceBtn = this._servicePicker.querySelector(`.hint-button .shortcut-key`);
                if (serviceBtn) {
                    const allServiceBtns = this._servicePicker.querySelectorAll('.hint-button');
                    for (const btn of allServiceBtns) {
                        const shortcutEl = btn.querySelector('.shortcut-key');
                        if (shortcutEl && shortcutEl.textContent.toLowerCase() === key) {
                            btn.classList.add('shortcut-pressed');
                            setTimeout(() => {
                                btn.classList.remove('shortcut-pressed');
                            }, 300);
                            
                            // Trigger the service analysis
                            const serviceId = btn.dataset.serviceId;
                            if (serviceId) {
                                this._closeServicePicker();
                                this._runSelectiveAnalysis(this.determineSelectionType(), [serviceId]);
                            }
                            e.preventDefault();
                            return;
                        }
                    }
                }
            }

            // All other shortcut keys - immediate dispatch to hint buttons
            const button = selectionPanel.querySelector(`button[data-shortcut="${key}"]`);
            if (button) {
                button.classList.add('shortcut-pressed');
                const action = button.getAttribute('data-action');
                if (action) {
                    this.handleActionButtonClick(action);
                }
                setTimeout(() => {
                    button.classList.remove('shortcut-pressed');
                }, 300);

                e.preventDefault();
            }
        });

        // Z keyup: cancel long-press timer and fire normal analyze only if it was a quick tap
        document.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() !== 'z') return;
            if (!this._zKeyDown) return;
            this._zKeyDown = false;

            const heldMs = Date.now() - this._zKeyDownTime;

            if (this._zLongPressTimer) {
                clearTimeout(this._zLongPressTimer);
                this._zLongPressTimer = null;
            }

            const selectionPanel = this.getRoot().querySelector('#selection-actions-panel');
            const analyzeBtn = selectionPanel?.querySelector('button[data-shortcut="z"]');
            if (analyzeBtn) analyzeBtn.classList.remove('z-longpress-active');

            // Only analyze if: (1) not triggered long-press overlay, AND (2) held < TAP_MS (quick tap)
            if (!this._zLongPressTriggered && heldMs < this.TAP_MS) {
                if (analyzeBtn) {
                    analyzeBtn.classList.add('shortcut-pressed');
                    const action = analyzeBtn.getAttribute('data-action');
                    if (action) this.handleActionButtonClick(action);
                    setTimeout(() => analyzeBtn.classList.remove('shortcut-pressed'), 300);
                }
            }
            // If held >= TAP_MS but < LONG_PRESS_MS: dead zone - do nothing
        });
    }

    /**
     * Copy selected items to clipboard
     */
    copySelectedItemsToClipboard() {
        if (this.selectedItems.length === 0) return;

        const textToCopy = this.selectedItems.map(item => (item.dataset.content || item.textContent).trim()).join('\n');

        navigator.clipboard.writeText(textToCopy).then(() => {
            this.addFeedEntry(`Copied ${this.selectedItems.length} item(s) to clipboard`, 'info');
        }).catch(err => {
            this.addFeedEntry(`Failed to copy to clipboard: ${err}`, 'error');
            console.error('Failed to copy: ', err);
        });
    }

    /**
     * Generic function to toggle selection of any item type when clicked in the page
     * @param {String} type The type of item ('ip', 'keyword', 'event', 'sid', etc)
     * @param {String} value The value to toggle
     * @param {Boolean} ctrlKey Whether Ctrl/Cmd key is pressed
     * @param {Boolean} shiftKey Whether Shift key is pressed
     */
    toggleSelection(type, value, ctrlKey, shiftKey) {
        const typeInfo = FishBowlConsts.ENTITY_TYPES[type];
        if (!typeInfo) return;

        const currentType = this.determineSelectionType();
        if (currentType !== null && currentType !== type) {
            this.clearSelection();
        }

        const raw = (value || '').toString();
        const rawLower = raw.toLowerCase();

        let item = null;
        if (type === 'domain' || type === 'file') {
            // Domain/file matching is case-insensitive because DOM highlights preserve original casing.
            item = Array.from(this.getRoot().querySelectorAll(`.${typeInfo.itemClass}[${typeInfo.dataAttr}]`))
                .find(el => ((el.getAttribute(typeInfo.dataAttr) || '').toString().toLowerCase() === rawLower)) || null;
        } else {
            item = this.getRoot().querySelector(`.${typeInfo.itemClass}[${typeInfo.dataAttr}="${raw.replace(/"/g, '\\"')}"]`);
        }

        console.debug(`.${typeInfo.itemClass}[${typeInfo.dataAttr}]`, item);

        if (item) {
            this.toggleItemSelection(item, ctrlKey, shiftKey);
        }
    }

    /**
     * Update the list of selected items for page highlighting
     */
    updateSelectedItems() {
        const selectedItems = {
            ipAddresses: [],
            asNumbers: [],
            domains: [],
            files: [],
            eventIds: [],
            sids: [],
            hashes: []
        };

        const attrToKey = {
            'data-ip': 'ipAddresses',
            'data-asn': 'asNumbers',
            'data-domain': 'domains',
            'data-file': 'files',
            'data-event-id': 'eventIds',
            'data-sid': 'sids',
            'data-hash': 'hashes'
        };

        this.selectedItems.forEach(item => {
            for (const [attr, key] of Object.entries(attrToKey)) {
                const val = item.getAttribute(attr);
                if (val && !selectedItems[key].includes(val)) {
                    selectedItems[key].push(val);
                }
            }
        });

        if (window.FishBowlDomHighlighter) {
            window.FishBowlDomHighlighter.updateHighlightSelection(selectedItems);
        }
    }

    isScrollTargetHighlightCandidate(el) {
        if (!el || !el.classList || !el.classList.contains('fishbowl-highlight')) {
            return false;
        }

        if (el.closest('.fishbowl-hud') ||
            el.closest('.fishbowl-panel') ||
            el.closest('.info-panel') ||
            el.closest('.fishbowl-modal-backdrop') ||
            el.closest('.fishbowl-textarea-inspect-wrapper') ||
            el.closest('.fishbowl-textarea-inspect-overlay') ||
            el.closest('[data-fishbowl-iframe-inspect-layer="true"]') ||
            el.closest('[data-fishbowl-textarea-inspect-layer="true"]')) {
            return false;
        }

        return true;
    }

    getHighlightsForScrollTarget(type, value) {
        const t = (type || '').toString().trim().toLowerCase();
        const v = (value || '').toString();
        const vLower = v.toLowerCase();
        if (!t || !v) return [];

        const highlighter = window.FishBowlDomHighlighter;
        let candidates = [];

        if (highlighter && typeof highlighter.findHighlightsForValue === 'function') {
            candidates = highlighter.findHighlightsForValue(t, v);
        } else {
            const selector = `.fishbowl-highlight[data-type="${t}"][data-content]`;
            candidates = Array.from(document.querySelectorAll(selector)).filter(el => {
                const content = (el?.dataset?.content || '').toString();
                if (t === 'ip') {
                    return content === v;
                }
                return content.toLowerCase() === vLower;
            });
        }

        return (Array.isArray(candidates) ? candidates : Array.from(candidates || []))
            .filter(el => this.isScrollTargetHighlightCandidate(el));
    }

    applyScrollFocusPulse(targetHighlight) {
        if (!targetHighlight || !targetHighlight.style) {
            return;
        }

        const style = targetHighlight.style;
        const originalTransitionValue = style.getPropertyValue('transition');
        const originalTransitionPriority = style.getPropertyPriority('transition');
        const originalBorderValue = style.getPropertyValue('border');
        const originalBorderPriority = style.getPropertyPriority('border');
        const originalBoxShadowValue = style.getPropertyValue('box-shadow');
        const originalBoxShadowPriority = style.getPropertyPriority('box-shadow');

        style.setProperty('transition', 'border 0.2s ease-in-out, box-shadow 0.2s ease-in-out');
        style.setProperty('border', '2px solid #ffff00', 'important');
        style.setProperty('box-shadow', '0 0 0 2px rgba(255, 255, 0, 0.45)', 'important');

        setTimeout(() => {
            if (originalTransitionValue) {
                style.setProperty('transition', originalTransitionValue, originalTransitionPriority);
            } else {
                style.removeProperty('transition');
            }

            if (originalBorderValue) {
                style.setProperty('border', originalBorderValue, originalBorderPriority);
            } else {
                style.removeProperty('border');
            }

            if (originalBoxShadowValue) {
                style.setProperty('box-shadow', originalBoxShadowValue, originalBoxShadowPriority);
            } else {
                style.removeProperty('box-shadow');
            }
        }, 1500);
    }

    /**
     * Scroll to the highlighted content on the page that matches the specified type and value
     * @param {String} type - The type of content
     * @param {String} value - The content value to scroll to
     */
    scrollToHighlightedContent(type, value) {
        const highlights = this.getHighlightsForScrollTarget(type, value);

        if (highlights.length === 0) {
            this.addFeedEntry(`No highlighted matches found for ${type}: ${value}`, 'info');
            return;
        }

        let closestHighlight = null;
        let closestDistance = Number.MAX_SAFE_INTEGER;

        const viewportTop = window.scrollY;
        const viewportMiddle = viewportTop + (window.innerHeight / 2);

        highlights.forEach(highlight => {
            const rect = highlight.getBoundingClientRect();
            const elementTop = rect.top + window.scrollY;
            const elementMiddle = elementTop + (rect.height / 2);
            const distance = Math.abs(elementMiddle - viewportMiddle);

            if (distance < closestDistance) {
                closestHighlight = highlight;
                closestDistance = distance;
            }
        });

        if (closestHighlight) {
            closestHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.applyScrollFocusPulse(closestHighlight);

            this.addFeedEntry(`Scrolled to ${type}: ${value}`, 'info');
        }
    }

    // ── Service Picker Overlay (long-press Z) ─────────────────────────

    /**
     * Open the service selection overlay for selective analysis.
     * Shows all REPUTATION_SERVICE_DEFS for the current entity type
     * with checkboxes so the user can pick which services to run.
     */
    _openServicePicker() {
        if (this._servicePicker) return;

        const entityType = (this.determineSelectionType() || '').toLowerCase();
        if (!entityType) return;

        const defs = FishBowlConfig.REPUTATION_SERVICE_DEFS[entityType];
        if (!Array.isArray(defs) || defs.length === 0) {
            this.addFeedEntry(`No analysis services available for type "${entityType}"`, 'info');
            return;
        }

        const root = this.getRoot();

        // Overlay backdrop
        const overlay = document.createElement('div');
        overlay.className = 'fishbowl-service-picker-overlay';

        // Box
        const box = document.createElement('div');
        box.className = 'fishbowl-service-picker-box';

        // Header
        const header = document.createElement('div');
        header.className = 'fishbowl-service-picker-header';
        header.textContent = 'Select Service';
        box.appendChild(header);

        // Service list
        const list = document.createElement('div');
        list.className = 'fishbowl-service-picker-list';

        defs.forEach(svc => {
            const btn = document.createElement('button');
            btn.className = 'hint-button';
            btn.dataset.serviceId = svc.id;
            
            // Create shortcut key span (explicit per-service shortcut)
            const shortcutKey = document.createElement('span');
            shortcutKey.className = 'shortcut-key';
            shortcutKey.textContent = (svc.shortcut || 'undefined').toUpperCase();
            
            // Add service icon
            const icon = document.createElement('img');
            icon.className = 'shortcut-icon';
            icon.alt = '';
            icon.setAttribute('aria-hidden', 'true');
            try {
                icon.src = browser.runtime.getURL(`icons/${svc.id}.png`);
            } catch (e) {
                console.warn(`[FishBowl SelectionManager] Failed to load icon for service ${svc.id}`, e);
                icon.style.display = 'none';
            }

            // Add text node with service name
            const text = document.createTextNode(' ' + (svc.name || svc.id));

            btn.appendChild(shortcutKey);
            btn.appendChild(icon);
            btn.appendChild(text);
            list.appendChild(btn);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeServicePicker();
                this._runSelectiveAnalysis(entityType, [svc.id]);
            });
        });

        box.appendChild(list);

        overlay.appendChild(box);

        // Close on backdrop click; stop propagation so the document-level
        // click handler does not clear the item selection while the picker is open.
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target === overlay) this._closeServicePicker();
        });

        // Close on Escape
        this._servicePickerKeyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this._closeServicePicker();
            }
        };
        document.addEventListener('keydown', this._servicePickerKeyHandler, true);

        if (root && typeof root.appendChild === 'function') {
            root.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }

        this._servicePicker = overlay;
    }

    /**
     * Close and remove the service picker overlay.
     */
    _closeServicePicker() {
        if (this._servicePicker && this._servicePicker.parentNode) {
            this._servicePicker.parentNode.removeChild(this._servicePicker);
        }
        this._servicePicker = null;

        if (this._servicePickerKeyHandler) {
            document.removeEventListener('keydown', this._servicePickerKeyHandler, true);
            this._servicePickerKeyHandler = null;
        }
    }

    /**
     * Run analysis for the selected items using only the specified service IDs.
     * @param {String} entityType
     * @param {String[]} serviceIds
     */
    _runSelectiveAnalysis(entityType, serviceIds) {
        const uniqueValues = Array.from(new Set(this.selectedItems
            .map(item => item?.dataset?.content)
            .filter(Boolean)));

        this.clearSelection();

        uniqueValues.forEach(value => {
            const progressKey = `reputation:${entityType}:${value}`;

            try {
                this.setActivityProgressLabel(progressKey, value);
                this.setActivityProgressActive(progressKey, true);
                this.setActivityProgressIndeterminate(progressKey, true);
                this.setActivityProgressStatus(progressKey, 'Reputation');
            } catch (e) {
                console.warn('[FishBowl SelectionManager] Failed to show reputation analysis progress', e);
            }

            this.addFeedEntry(`Analyzing ${value} (${serviceIds.length} service${serviceIds.length !== 1 ? 's' : ''})`, 'info');

            browser.runtime.sendMessage({
                action: 'analyze-reputation',
                entityType,
                value,
                serviceIds
            }, _response => {
                if (browser.runtime.lastError) {
                    console.error('[FishBowl SelectionManager] Selective analysis failed:', browser.runtime.lastError);
                    this.addFeedEntry(`Error: ${browser.runtime.lastError.message}`, 'error');
                    try {
                        this.setActivityProgressActive(progressKey, false);
                    } catch (e) {
                        console.warn('[FishBowl SelectionManager] Failed to hide progress after error', e);
                    }
                }
            });
        });
    }
}

window.FishBowlSelectionManager = FishBowlSelectionManager;
