/**
 * FishBowl Security Extension - UI Manager Panels
 * Handles generic and typed panel updates, redistribution, IP type icons, and panel highlighting.
 */

class FishBowlPanelManager {
    constructor(opts) {
        this.opts = opts || {};
        this.UI_CONSTANTS = {
            PANEL_HIGHLIGHT_TIMEOUT_MS: 5000,
            DEFAULT_PANEL_OPACITY: 0.35
        };

        // Callback to toggle item selection (set by coordinator)
        this.toggleItemSelection = opts.toggleItemSelection || (() => { });
    }

    /**
     * Returns the shadow root where HUD elements live, or document as fallback.
     */
    getRoot() {
        return window.fishTankHUD?.hudShadowRoot || document;
    }

    /**
     * Generic function to update any panel with data items
     * @param {Object} config Configuration object for panel update
     */
    updatePanel(config) {
        const {
            panelId,
            contentId,
            items,
            itemClass,
            dataAttr,
            getItemText,
            getItemClass = () => '',
            afterUpdate = () => {
            }
        } = config;

        const root = this.getRoot();
        const panel = root.getElementById(panelId);
        const contentContainer = root.getElementById(contentId);

        if (!panel || !contentContainer) return;

        // Clear previous content
        contentContainer.innerHTML = '';

        // Highlight panel to show changes
        this.highlightPanel(panelId);

        // Add items
        const safeItems = items || [];
        safeItems.forEach(item => {
            const itemElement = document.createElement('div');

            // Set class name with any additional classes
            const additionalClass = getItemClass(item);
            itemElement.className = `${itemClass} ${additionalClass}`.trim();

            const cachedVerdict = (item && item.cachedData && typeof item.cachedData.worstVerdict === 'string')
                ? item.cachedData.worstVerdict
                : null;
            const itemVerdict = (item && typeof item.verdict === 'string' && item.verdict.trim()) ? item.verdict : cachedVerdict;
            if (itemVerdict) {
                itemElement.classList.add(`fishbowl-verdict-${itemVerdict}`);
            }

            // Get the text content of the item
            const itemText = getItemText(item).toString().trim();

            // Set primary data attribute
            itemElement.setAttribute(`data-${dataAttr}`, itemText);

            // Add data-type and data-content attributes for double-click scroll feature
            itemElement.setAttribute('data-type', panelId.replace('-list', '').replace('-panel', ''));
            itemElement.setAttribute('data-content', itemText);

            const itemType = (itemElement.getAttribute('data-type') || '').toString().trim().toLowerCase();
            if (itemType) {
                itemElement.classList.add(`fishbowl-${itemType}-highlight`);
            }

            // Set as selectable
            itemElement.setAttribute('data-selectable', 'true');

            // Set text content
            itemElement.textContent = getItemText(item);

            // Make it accessible
            itemElement.style.cursor = 'pointer';

            // Add click handler
            itemElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleItemSelection(itemElement, e.ctrlKey || e.metaKey, e.shiftKey);
            });

            contentContainer.appendChild(itemElement);
        });

        // Update header count
        const countEl = root.getElementById(`${panelId}-count`);
        if (countEl) countEl.textContent = safeItems.length;

        // Call the afterUpdate callback
        afterUpdate();
    }

    /**
     * Update IP panel with analysis results
     * @param {Array} ipAddresses List of IPs with verdict data
     */
    updateIpPanel(ipAddresses) {
        this.updatePanel({
            panelId: 'ip-panel',
            contentId: 'ip-list',
            items: ipAddresses,
            itemClass: 'ip-item',
            dataAttr: 'ip',
            getItemClass: item => `fishbowl-verdict-${item.verdict}`,
            getItemText: item => item.ip,
            afterUpdate: () => {
                this.addIpTypeIconsToPanel();
            }
        });
    }

    /**
     * Update Windows event IDs panel with analysis results
     * @param {Array} windowsEvents List of Windows event IDs found
     */
    updateEventPanel(windowsEvents) {
        this.updatePanel({
            panelId: 'event-panel',
            contentId: 'event-list',
            items: windowsEvents,
            itemClass: 'event-item',
            dataAttr: 'event-id',
            getItemText: item => item.eventId,
        });
    }

    /**
     * Update SID panel with analysis results
     * @param {Array} sids List of SIDs with their descriptions
     */
    updateSidPanel(sids) {
        this.updatePanel({
            panelId: 'sid-panel',
            contentId: 'sid-list',
            items: sids,
            itemClass: 'sid-item',
            dataAttr: 'sid',
            getItemText: sid => `${sid.sid}`,
        });
    }

    /**
     * Update ASN panel with analysis results
     * @param {Array} asNumbers List of AS numbers with their details
     */
    updateAsnPanel(asNumbers) {
        this.updatePanel({
            panelId: 'asn-panel',
            contentId: 'asn-list',
            items: asNumbers,
            itemClass: 'asn-item',
            dataAttr: 'asn',
            getItemText: item => `${item.number} ${item.name || ''}`,
        });
    }

    /**
     * Update Domain panel with analysis results
     * @param {Array} domains List of domains with their details
     */
    updateDomainPanel(domains) {
        this.updatePanel({
            panelId: 'domain-panel',
            contentId: 'domain-list',
            items: domains,
            itemClass: 'domain-item',
            dataAttr: 'domain',
            getItemText: item => `${item.domain}`,
        });
    }

    updateFilePanel(files) {
        this.updatePanel({
            panelId: 'file-panel',
            contentId: 'file-list',
            items: files,
            itemClass: 'file-item',
            dataAttr: 'file',
            getItemText: item => `${item.file}`,
        });
    }

    updateHashPanel(hashes) {
        const root = this.getRoot();
        const panel = root.getElementById('hash-panel');
        const contentContainer = root.getElementById('hash-list');

        if (!panel || !contentContainer) return;

        contentContainer.innerHTML = '';
        this.highlightPanel('hash-panel');

        const safeItems = hashes || [];
        safeItems.forEach(item => {
            const value = (item?.value || '').toString().trim();
            if (!value) return;

            const itemElement = document.createElement('div');
            itemElement.className = 'hash-item fishbowl-hash-highlight';

            const cachedVerdict = (item && item.cachedData && typeof item.cachedData.worstVerdict === 'string')
                ? item.cachedData.worstVerdict
                : null;
            const itemVerdict = (item && typeof item.verdict === 'string' && item.verdict.trim()) ? item.verdict : cachedVerdict;
            if (itemVerdict) {
                itemElement.classList.add(`fishbowl-verdict-${itemVerdict}`);
            }

            itemElement.setAttribute('data-hash', value);
            itemElement.setAttribute('data-type', 'hash');
            itemElement.setAttribute('data-content', value);
            itemElement.setAttribute('data-selectable', 'true');
            itemElement.textContent = value.length > 16
                ? `${value.slice(0, 8)}…${value.slice(-8)}`
                : value;
            itemElement.title = value;
            itemElement.style.cursor = 'pointer';
            itemElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleItemSelection(itemElement, e.ctrlKey || e.metaKey, e.shiftKey);
            });

            contentContainer.appendChild(itemElement);
        });

        const countEl = root.getElementById('hash-panel-count');
        if (countEl) countEl.textContent = safeItems.length;

        panel.style.display = safeItems.length > 0 ? 'flex' : 'none';
    }

    /**
     * Generic function to update content panels based on type
     * @param {String} contentType The type of content ('ip', 'asn', 'domain', 'event', 'keyword', 'sid')
     * @param {Array} items Array of items to display
     */
    updateContentPanel(contentType, items) {
        const safeItems = items || [];
        switch (contentType) {
            case 'ip':
                this.updateIpPanel(safeItems);
                break;
            case 'asn':
                this.updateAsnPanel(safeItems);
                break;
            case 'domain':
                this.updateDomainPanel(safeItems);
                break;
            case 'event':
                this.updateEventPanel(safeItems);
                break;
            case 'sid':
                this.updateSidPanel(safeItems);
                break;
            case 'hash':
                this.updateHashPanel(safeItems);
                break;
            case 'file':
                this.updateFilePanel(safeItems);
                break;
            default:
                console.warn(`Unknown content type: ${contentType}`);
        }

        // After updating any panel, redistribute panels if needed
        this.redistributePanels();
    }

    /**
     * Redistributes panels between right and top-left containers
     * Keep a maximum of 4 panels in the right container
     */
    redistributePanels() {
        const root = this.getRoot();
        const rightPanelContainer = root.querySelector('.fishbowl-panel-right');
        if (!rightPanelContainer) return;

        // Collect all panels that should be visible
        const allPanels = Array.from(rightPanelContainer.querySelectorAll('.info-panel'));
        const visiblePanels = allPanels.filter(panel => {
            const panelId = panel.id;
            const panelContent = root.getElementById(panelId.replace('-panel', '-list'));

            return panelContent &&
                panelContent.children.length > 0 &&
                !panelContent.querySelector('.empty-message');
        });

        // First, hide all panels in the right container
        allPanels.forEach(panel => {
            panel.style.display = 'none';
        });

        // Display up to 4 panels in the right container
        const rightPanels = visiblePanels.slice(0, 4);
        rightPanels.forEach(panel => {
            panel.style.display = 'flex';
        });

        rightPanelContainer.style.display = visiblePanels.length > 0 ? 'flex' : 'none';
    }

    /**
     * Apply panel highlight effect
     * @param {String} panelId ID of the panel to highlight
     */
    highlightPanel(panelId) {
        const root = this.getRoot();
        const panel = root.getElementById(panelId);
        if (!panel) return;

        panel.classList.add('panel-highlighting');

        setTimeout(() => {
            panel.classList.remove('panel-highlighting');
        }, this.UI_CONSTANTS.PANEL_HIGHLIGHT_TIMEOUT_MS);
    }

    /**
     * Add IP type icons to each IP item in the HUD panel.
     * Uses FishBowlBadgeManager directly for IP classification.
     */
    addIpTypeIconsToPanel() {
        const root = this.getRoot();
        const ipItems = root.querySelectorAll('#ip-list .ip-item');
        ipItems.forEach(item => {
            const ip = item.getAttribute('data-ip');
            if (!ip) return;

            // Use FishBowlBadgeManager directly if available, else fall back to DomHighlighter
            let isPrivate = false;
            let isBogon = false;

            if (window.FishBowlDomHighlighter && window.FishBowlDomHighlighter.badgeManager) {
                isPrivate = window.FishBowlDomHighlighter.badgeManager.isPrivateIP(ip);
                isBogon = !isPrivate && window.FishBowlDomHighlighter.badgeManager.isBogonIP(ip);
            } else if (window.FishBowlDomHighlighter && typeof window.FishBowlDomHighlighter.isPrivateIP === 'function') {
                isPrivate = window.FishBowlDomHighlighter.isPrivateIP(ip);
                isBogon = !isPrivate && window.FishBowlDomHighlighter.isBogonIP(ip);
            }

            if (isPrivate || isBogon) {
                // Remove any existing icons for this IP in the item
                const existingIcons = item.querySelectorAll(`.fishbowl-ip-icon[data-ip="${ip}"]`);
                existingIcons.forEach(icon => icon.remove());

                item.classList.toggle('fishbowl-ip-private', isPrivate);
                item.classList.toggle('fishbowl-ip-bogon', isBogon);

                if (isPrivate) {
                    item.title = 'Private IP';
                } else if (isBogon) {
                    item.title = 'Bogon/Special IP';
                }
            }
        });
    }
}

window.FishBowlPanelManager = FishBowlPanelManager;
