/**
 * FishBowl Security Extension - Entity Search
 * Provides a search overlay triggered by ":" in execution mode.
 * Searches across all aggregated entities with debounced filtering.
 */

class FishBowlEntitySearch {
    constructor() {
        this.overlayElement = null;
        this.inputElement = null;
        this.resultsElement = null;
        this.debounceTimer = null;
        this.selectedIndex = 0;
        this.currentMatches = [];

        this.DEBOUNCE_MS = 300;
        this.MAX_RESULTS = 20;

        this._boundOnKeyDown = this._onOverlayKeyDown.bind(this);
    }

    /**
     * Returns the shadow root where HUD elements live, or document as fallback.
     */
    getRoot() {
        return window.fishTankHUD?.hudShadowRoot || document;
    }

    /**
     * Whether the search overlay is currently open.
     */
    get isOpen() {
        return !!this.overlayElement;
    }

    /**
     * Open the search overlay.
     */
    open() {
        if (this.overlayElement) return;

        const root = this.getRoot();

        // --- Overlay container ---
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'fishbowl-entity-search-overlay';

        // --- Search box ---
        const searchBox = document.createElement('div');
        searchBox.className = 'fishbowl-entity-search-box';

        const header = document.createElement('div');
        header.className = 'fishbowl-entity-search-header';
        header.textContent = 'Search Entities';

        this.inputElement = document.createElement('input');
        this.inputElement.className = 'fishbowl-entity-search-input';
        this.inputElement.type = 'text';
        this.inputElement.placeholder = 'Type to search across all entities…';
        this.inputElement.setAttribute('autocomplete', 'off');
        this.inputElement.setAttribute('spellcheck', 'false');

        this.resultsElement = document.createElement('div');
        this.resultsElement.className = 'fishbowl-entity-search-results';

        searchBox.appendChild(header);
        searchBox.appendChild(this.inputElement);
        searchBox.appendChild(this.resultsElement);
        this.overlayElement.appendChild(searchBox);

        // Append to shadow root
        if (root && typeof root.appendChild === 'function') {
            root.appendChild(this.overlayElement);
        } else {
            document.body.appendChild(this.overlayElement);
        }

        // --- Event listeners ---
        this.inputElement.addEventListener('input', () => this._onInput());
        this.inputElement.addEventListener('keydown', this._boundOnKeyDown);

        // Close on backdrop click
        this.overlayElement.addEventListener('click', (e) => {
            if (e.target === this.overlayElement) {
                this.close();
            }
        });

        // Focus the input
        requestAnimationFrame(() => {
            if (this.inputElement) this.inputElement.focus();
        });

        // Show initial empty state
        this._renderEmpty('');
    }

    /**
     * Close the search overlay and clean up.
     */
    close() {
        if (this.overlayElement && this.overlayElement.parentNode) {
            this.overlayElement.parentNode.removeChild(this.overlayElement);
        }
        this.overlayElement = null;
        this.inputElement = null;
        this.resultsElement = null;
        this.currentMatches = [];
        this.selectedIndex = 0;

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    /**
     * Debounced input handler.
     */
    _onInput() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this._performSearch();
        }, this.DEBOUNCE_MS);
    }

    /**
     * Handle keyboard navigation inside the overlay.
     */
    _onOverlayKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }
            this.close();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

            if (this.currentMatches.length > 0) {
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.currentMatches.length - 1);
                this._updateSelectedHighlight();
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

            if (this.currentMatches.length > 0) {
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this._updateSelectedHighlight();
            }
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

            if (this.currentMatches.length > 0 && this.selectedIndex >= 0 && this.selectedIndex < this.currentMatches.length) {
                this._selectMatch(this.currentMatches[this.selectedIndex]);
            }
            return;
        }
    }

    /**
     * Perform the search against all aggregated entities.
     */
    _performSearch() {
        const query = (this.inputElement?.value || '').trim().toLowerCase();

        if (!query) {
            this.currentMatches = [];
            this.selectedIndex = 0;
            this._renderEmpty('');
            return;
        }

        const allEntities = this._collectAllEntities();
        const matches = [];

        for (const entity of allEntities) {
            if (matches.length >= this.MAX_RESULTS) break;
            if (entity.value.toLowerCase().includes(query)) {
                matches.push(entity);
            }
        }

        this.currentMatches = matches;
        this.selectedIndex = matches.length > 0 ? 0 : -1;

        if (matches.length === 0) {
            this._renderEmpty('No matches found');
        } else {
            this._renderResults(matches);
        }
    }

    /**
     * Collect all entities from lastAnalysisResponse into a flat list.
     * Delegates to the shared collector on the UI manager so the search overlay
     * and the entity inspector stay in lockstep.
     * @returns {Array<{value: string, type: string, verdict: string, badges: Array, cachedData: Object}>}
     */
    _collectAllEntities() {
        if (window.FishBowlUiManager && typeof window.FishBowlUiManager.collectAllEntities === 'function') {
            return window.FishBowlUiManager.collectAllEntities();
        }
        return [];
    }

    /**
     * Render search results.
     */
    _renderResults(matches) {
        if (!this.resultsElement) return;
        this.resultsElement.innerHTML = '';

        matches.forEach((match, index) => {
            const row = document.createElement('div');
            row.className = 'fishbowl-entity-search-result';
            if (match.verdict) {
                row.classList.add(`fishbowl-verdict-${match.verdict}`);
            }
            if (index === this.selectedIndex) {
                row.classList.add('fishbowl-entity-search-selected');
            }
            row.setAttribute('data-index', index.toString());

            // Type label
            const typeSpan = document.createElement('span');
            typeSpan.className = 'fishbowl-entity-search-type';
            typeSpan.textContent = match.typeLabel;
            row.appendChild(typeSpan);

            // Value
            const valueSpan = document.createElement('span');
            valueSpan.className = 'fishbowl-entity-search-value';
            valueSpan.textContent = match.value;
            row.appendChild(valueSpan);

            // Badges (if any)
            if (Array.isArray(match.badges) && match.badges.length > 0) {
                const badgesSpan = document.createElement('span');
                badgesSpan.className = 'fishbowl-entity-search-badges';
                const displayBadges = match.badges.slice(0, 5); // limit displayed badges
                displayBadges.forEach(badge => {
                    const badgeEl = document.createElement('span');
                    badgeEl.className = 'fishbowl-entity-search-badge';
                    badgeEl.textContent = this._formatBadgeLabel(badge);
                    badgesSpan.appendChild(badgeEl);
                });
                row.appendChild(badgesSpan);
            }

            // Click handler
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                this._selectMatch(match);
            });

            // Hover selects the row
            row.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
                this._updateSelectedHighlight();
            });

            this.resultsElement.appendChild(row);
        });
    }

    /**
     * Update the selected highlight on result rows.
     */
    _updateSelectedHighlight() {
        if (!this.resultsElement) return;
        const rows = this.resultsElement.querySelectorAll('.fishbowl-entity-search-result');
        rows.forEach((row, i) => {
            row.classList.toggle('fishbowl-entity-search-selected', i === this.selectedIndex);
        });

        // Scroll selected into view
        const selectedRow = this.resultsElement.querySelector('.fishbowl-entity-search-selected');
        if (selectedRow) {
            selectedRow.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Handle selecting a match: select the entity in the panel and close the overlay.
     */
    _selectMatch(match) {
        if (!match) return;

        try {
            if (window.FishBowlUiManager && typeof window.FishBowlUiManager.toggleSelection === 'function') {
                window.FishBowlUiManager.toggleSelection(match.type, match.value, false, false);
            }

            // Scroll to the highlighted entity on the page
            if (window.FishBowlUiManager && typeof window.FishBowlUiManager.scrollToHighlightedContent === 'function') {
                window.FishBowlUiManager.scrollToHighlightedContent(match.type, match.value);
            }
        } catch (e) {
            console.warn('[FishBowl EntitySearch] Failed to select match', e);
        }

        this.close();
    }

    /**
     * Render empty state message.
     */
    _renderEmpty(message) {
        if (!this.resultsElement) return;
        this.resultsElement.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'fishbowl-entity-search-empty';
        empty.textContent = message;
        this.resultsElement.appendChild(empty);
    }

    /**
     * Format a badge key into a human-readable label.
     */
    _formatBadgeLabel(badge) {
        if (typeof badge !== 'string') return String(badge);

        // Remove common prefixes like 'vt:', 'abuseipdb:', 'spur:', 'flag:', 'org:', 'type:'
        const colonIdx = badge.indexOf(':');
        if (colonIdx >= 0) {
            return badge.substring(colonIdx + 1).trim();
        }
        return badge;
    }
}

window.FishBowlEntitySearch = FishBowlEntitySearch;
