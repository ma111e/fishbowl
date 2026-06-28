/**
 * FishBowl Security Extension - Entity Inspector
 *
 * A consolidated master-detail drawer that presents every entity found on the
 * current page together with its linked info: verdict, enrichment (badges and
 * raw per-source results), external actions, and lightweight relationships
 * (an IP/domain's referenced ASN and the other entities co-found on the page).
 *
 * Reads the same normalized entity list as the search overlay via
 * window.FishBowlUiManager.collectAllEntities(). No backend calls.
 *
 * Triggers: the HUD "entities" chip, or the E key in execution mode.
 */

class FishBowlEntityInspector {
    constructor() {
        this.overlayElement = null;
        this.railElement = null;
        this.detailElement = null;
        this.subtitleElement = null;

        this.entities = [];
        this.orderedKeys = [];
        this.selectedKey = null;
        this._refreshTimer = null;

        this._boundOnOverlayKeyDown = this._onOverlayKeyDown.bind(this);
    }

    // Display order and headings for the rail groups.
    static GROUPS = [
        ['ip', 'IPs'],
        ['domain', 'Domains'],
        ['asn', 'ASNs'],
        ['hash', 'Hashes'],
        ['file', 'Files'],
        ['event', 'Events'],
        ['sid', 'SIDs'],
    ];

    // Maps an entity type to its design-token color (defined in common.css).
    static TYPE_COLOR_VAR = {
        ip: '--c-ip',
        domain: '--c-domain',
        asn: '--c-asn',
        hash: '--c-hash',
        file: '--c-file',
        event: '--c-eventid',
        sid: '--c-sid',
    };

    // Detail fields that may form a relationship, normalized (lowercase, no
    // separators) to cover camelCase/snake_case spellings across parsers.
    static RELATIONSHIP_FIELDS = new Set([
        // ASN
        'asn', 'as', 'asnumber', 'asnname', 'asntype',
        // ASN org / company
        'asncompany', 'org', 'organization', 'company',
        // Network / ISP
        'isp', 'usagetype', 'hostnames', 'hostname', 'domain', 'domainname',
        // IP range
        'iprange', 'range', 'cidr', 'route', 'network', 'prefix',
        // Geo
        'country', 'countryname', 'countrycode', 'city', 'region', 'regionname',
        'state', 'continent', 'location', 'loc',
        // Abuse
        'abusecontact', 'abuse', 'abuseemail', 'abusecontactemail',
        // Network flags (matched only when true; see RELATIONSHIP_TRUE_ONLY)
        'proxy', 'tor', 'istor', 'relay', 'vpn',
    ]);

    // Boolean network flags that relate only on a positive (true) match.
    static RELATIONSHIP_TRUE_ONLY = new Set(['proxy', 'tor', 'istor', 'relay', 'vpn']);

    getRoot() {
        return window.fishTankHUD?.hudShadowRoot || document;
    }

    get isOpen() {
        return !!this.overlayElement;
    }

    /**
     * Whether a text-input element currently has focus (so we don't hijack typing).
     */
    _isInputFocused() {
        try {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
                el.isContentEditable === true;
        } catch (e) {
            console.warn('[FishBowl EntityInspector] Failed to read active element', e);
            return false;
        }
    }

    /**
     * A stable key for an entity row.
     */
    _entityKey(entity) {
        return `${entity.type}::${entity.value}`;
    }

    /**
     * The value to hand to external services / clipboard for an entity.
     * ASN rows display "AS123 Name" but should act on the bare number.
     */
    _actionValue(entity) {
        if (entity.type === 'asn') {
            return (entity.raw?.number || entity.value || '').toString();
        }
        return entity.value;
    }

    /**
     * Open the inspector. Optionally pre-select an entity.
     * @param {{type: string, value: string}|null} target
     */
    open(target = null) {
        if (this.overlayElement) return;

        this.entities = (window.FishBowlUiManager &&
            typeof window.FishBowlUiManager.collectAllEntities === 'function')
            ? window.FishBowlUiManager.collectAllEntities()
            : [];

        const root = this.getRoot();

        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'fishbowl-inspector-overlay';

        const drawer = document.createElement('div');
        drawer.className = 'fishbowl-inspector-drawer';
        drawer.setAttribute('tabindex', '-1');

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'fishbowl-inspector-header';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'fishbowl-inspector-titlewrap';

        const title = document.createElement('div');
        title.className = 'fishbowl-inspector-title';
        title.textContent = 'Entity Inspector';

        this.subtitleElement = document.createElement('div');
        this.subtitleElement.className = 'fishbowl-inspector-subtitle';

        titleWrap.appendChild(title);
        titleWrap.appendChild(this.subtitleElement);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fishbowl-inspector-close';
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });

        header.appendChild(titleWrap);
        header.appendChild(closeBtn);

        // --- Body: rail + detail ---
        const body = document.createElement('div');
        body.className = 'fishbowl-inspector-body';

        this.railElement = document.createElement('div');
        this.railElement.className = 'fishbowl-inspector-rail';

        this.detailElement = document.createElement('div');
        this.detailElement.className = 'fishbowl-inspector-detail';

        body.appendChild(this.railElement);
        body.appendChild(this.detailElement);

        drawer.appendChild(header);
        drawer.appendChild(body);
        this.overlayElement.appendChild(drawer);

        if (root && typeof root.appendChild === 'function') {
            root.appendChild(this.overlayElement);
        } else {
            document.body.appendChild(this.overlayElement);
        }

        // Close on backdrop click.
        this.overlayElement.addEventListener('click', (e) => {
            if (e.target === this.overlayElement) this.close();
        });
        drawer.addEventListener('keydown', this._boundOnOverlayKeyDown);

        this._renderRail();

        // Pre-select the requested entity, else fall back to the first.
        let initialKey = this.orderedKeys[0] || null;
        if (target && target.type) {
            const match = this.entities.find(en => en.type === target.type &&
                (en.value === target.value || this._actionValue(en) === target.value));
            if (match) initialKey = this._entityKey(match);
        }
        if (initialKey) {
            this._select(initialKey, true);
        } else {
            this._renderEmptyDetail();
        }

        requestAnimationFrame(() => drawer.focus());

        // Pull the freshest cached reputation shortly after opening, in case
        // enrichment completed after the last analysis hydrate.
        this.scheduleRefresh();
    }

    close() {
        if (this.overlayElement && this.overlayElement.parentNode) {
            this.overlayElement.parentNode.removeChild(this.overlayElement);
        }
        this.overlayElement = null;
        this.railElement = null;
        this.detailElement = null;
        this.subtitleElement = null;
        this.entities = [];
        this.orderedKeys = [];
        this.selectedKey = null;

        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    /**
     * Debounced trailing refresh, coalescing the burst of streamed verdict
     * updates into a single re-hydrate + re-render.
     */
    scheduleRefresh(delay = 250) {
        if (!this.overlayElement) return;
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = null;
            this.refresh();
        }, delay);
    }

    /**
     * Re-read the latest reputation (from the cache, not the one-time analysis
     * snapshot) and re-render while open, so streamed verdicts/enrichment show
     * without reopening. Keeps the current selection when that entity still
     * exists.
     */
    async refresh() {
        if (!this.overlayElement) return;

        const prevKey = this.selectedKey;
        const collect = (resp) => (window.FishBowlUiManager &&
            typeof window.FishBowlUiManager.collectAllEntities === 'function')
            ? window.FishBowlUiManager.collectAllEntities(resp)
            : [];

        // Re-hydrate from the cache so streamed reputation (which only lives in
        // FishBowlCacheService, not lastAnalysisResponse) is reflected.
        try {
            const base = window.fishTankHUD?.lastAnalysisResponse;
            const hydrate = window.FishBowlHudAnalysis?.hydrateCachedResponse;
            if (base && typeof hydrate === 'function' && window.FishBowlCacheService) {
                const fresh = await hydrate(base, window.FishBowlCacheService, FishBowlConsts);
                if (!this.overlayElement) return; // closed mid-flight
                this.entities = collect(fresh);
            } else {
                this.entities = collect(base);
            }
        } catch (e) {
            console.warn('[FishBowl EntityInspector] Failed to re-hydrate on refresh', e);
            this.entities = collect(window.fishTankHUD?.lastAnalysisResponse);
        }

        this._renderRail();

        const key = (prevKey && this.orderedKeys.includes(prevKey))
            ? prevKey
            : (this.orderedKeys[0] || null);
        if (key) {
            this._select(key, false);
        } else {
            this._renderEmptyDetail();
        }
    }

    _onOverlayKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.close();
            return;
        }

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            if (this.orderedKeys.length === 0) return;
            const idx = Math.max(0, this.orderedKeys.indexOf(this.selectedKey));
            const next = e.key === 'ArrowDown'
                ? Math.min(idx + 1, this.orderedKeys.length - 1)
                : Math.max(idx - 1, 0);
            this._select(this.orderedKeys[next], true);
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const entity = this._entityByKey(this.selectedKey);
            if (entity) this._search(entity);
        }
    }

    _entityByKey(key) {
        return this.entities.find(en => this._entityKey(en) === key) || null;
    }

    // =====================================================================
    // Rail (left: grouped entity list)
    // =====================================================================

    _renderRail() {
        if (!this.railElement) return;
        this.railElement.innerHTML = '';
        this.orderedKeys = [];

        const total = this.entities.length;
        if (this.subtitleElement) {
            this.subtitleElement.textContent = total === 1
                ? '1 entity on this page'
                : `${total} entities on this page`;
        }

        if (total === 0) {
            const empty = document.createElement('div');
            empty.className = 'fishbowl-inspector-rail-empty';
            empty.textContent = 'No entities found on this page yet.';
            this.railElement.appendChild(empty);
            return;
        }

        for (const [type, label] of FishBowlEntityInspector.GROUPS) {
            const group = this.entities.filter(en => en.type === type);
            if (group.length === 0) continue;

            const groupEl = document.createElement('div');
            groupEl.className = 'fishbowl-inspector-group';

            const groupHeader = document.createElement('div');
            groupHeader.className = 'fishbowl-inspector-group-header';

            const dot = document.createElement('span');
            dot.className = 'fishbowl-inspector-group-dot';
            const colorVar = FishBowlEntityInspector.TYPE_COLOR_VAR[type];
            if (colorVar) dot.style.background = `var(${colorVar})`;

            const groupLabel = document.createElement('span');
            groupLabel.className = 'fishbowl-inspector-group-label';
            groupLabel.textContent = label;

            const groupCount = document.createElement('span');
            groupCount.className = 'fishbowl-inspector-group-count';
            groupCount.textContent = group.length.toString();

            groupHeader.appendChild(dot);
            groupHeader.appendChild(groupLabel);
            groupHeader.appendChild(groupCount);
            groupEl.appendChild(groupHeader);

            for (const entity of group) {
                const key = this._entityKey(entity);
                this.orderedKeys.push(key);

                const row = document.createElement('div');
                row.className = 'fishbowl-inspector-row';
                if (entity.verdict) row.classList.add(`fishbowl-verdict-${entity.verdict}`);
                row.dataset.key = key;

                const value = document.createElement('span');
                value.className = 'fishbowl-inspector-row-value';
                value.textContent = entity.value;
                value.title = entity.value;
                row.appendChild(value);

                if (entity.verdict) {
                    const vdot = document.createElement('span');
                    vdot.className = 'fishbowl-inspector-row-verdict';
                    row.appendChild(vdot);
                }

                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._select(key);
                });

                groupEl.appendChild(row);
            }

            this.railElement.appendChild(groupEl);
        }
    }

    _select(key, scrollIntoView = false) {
        this.selectedKey = key;

        if (this.railElement) {
            const rows = this.railElement.querySelectorAll('.fishbowl-inspector-row');
            rows.forEach(row => {
                const isSel = row.dataset.key === key;
                row.classList.toggle('fishbowl-inspector-row-selected', isSel);
                if (isSel && scrollIntoView) row.scrollIntoView({ block: 'nearest' });
            });
        }

        const entity = this._entityByKey(key);
        if (entity) {
            this._renderDetail(entity);
        } else {
            this._renderEmptyDetail();
        }
    }

    // =====================================================================
    // Detail (right: selected entity's linked info)
    // =====================================================================

    _renderEmptyDetail() {
        if (!this.detailElement) return;
        this.detailElement.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'fishbowl-inspector-detail-empty';
        empty.textContent = 'Select an entity to see its details.';
        this.detailElement.appendChild(empty);
    }

    _renderDetail(entity) {
        if (!this.detailElement) return;
        this.detailElement.innerHTML = '';

        // --- Header: type, value, verdict ---
        const head = document.createElement('div');
        head.className = 'fishbowl-inspector-detail-head';

        const typeLabel = document.createElement('div');
        typeLabel.className = 'fishbowl-inspector-detail-type';
        typeLabel.textContent = entity.typeLabel;
        head.appendChild(typeLabel);

        const valueEl = document.createElement('div');
        valueEl.className = 'fishbowl-inspector-detail-value';
        valueEl.textContent = entity.value;
        head.appendChild(valueEl);

        if (entity.verdict) {
            const pill = document.createElement('span');
            pill.className = `fishbowl-inspector-verdict-pill fishbowl-verdict-${entity.verdict}`;
            pill.textContent = entity.verdict.toUpperCase();
            head.appendChild(pill);
        }
        this.detailElement.appendChild(head);

        // --- Description (events / SIDs / ASN names carry one) ---
        const description = entity.raw?.description;
        if (typeof description === 'string' && description.trim()) {
            this.detailElement.appendChild(
                this._section('Description', this._textNode(description.trim()))
            );
        }

        // --- Enrichment: badges ---
        if (Array.isArray(entity.badges) && entity.badges.length > 0) {
            const badgesWrap = document.createElement('div');
            badgesWrap.className = 'fishbowl-inspector-badges';
            for (const badge of entity.badges) {
                const badgeEl = document.createElement('span');
                badgeEl.className = 'fishbowl-inspector-badge';
                badgeEl.textContent = this._formatBadge(badge);
                badgesWrap.appendChild(badgeEl);
            }
            this.detailElement.appendChild(this._section('Enrichment', badgesWrap));
        }

        // --- Raw per-source results ---
        const resultsEl = this._renderResults(entity.cachedData?.results);
        if (resultsEl) {
            this.detailElement.appendChild(this._section('Sources', resultsEl));
        }

        // --- Relationships ---
        const related = this._renderRelationships(entity);
        if (related) {
            this.detailElement.appendChild(this._section('Relationships', related));
        }

        // --- Actions ---
        this.detailElement.appendChild(this._renderActions(entity));
    }

    _section(label, contentEl) {
        const section = document.createElement('div');
        section.className = 'fishbowl-inspector-section';

        const heading = document.createElement('div');
        heading.className = 'fishbowl-inspector-section-label';
        heading.textContent = label;

        section.appendChild(heading);
        section.appendChild(contentEl);
        return section;
    }

    _textNode(text) {
        const el = document.createElement('div');
        el.className = 'fishbowl-inspector-text';
        el.textContent = text;
        return el;
    }

    /**
     * Render a compact table of scalar fields from each enrichment source's
     * `details` object. Nested objects/arrays are summarized, not expanded.
     */
    _renderResults(results) {
        if (!results || typeof results !== 'object') return null;
        const sourceKeys = Object.keys(results);
        if (sourceKeys.length === 0) return null;

        const wrap = document.createElement('div');
        wrap.className = 'fishbowl-inspector-sources';
        let rendered = 0;

        for (const sourceKey of sourceKeys) {
            const details = results[sourceKey]?.details;
            if (!details || typeof details !== 'object') continue;

            const sourceEl = document.createElement('div');
            sourceEl.className = 'fishbowl-inspector-source';

            const name = document.createElement('div');
            name.className = 'fishbowl-inspector-source-name';
            name.textContent = sourceKey;
            sourceEl.appendChild(name);

            for (const field of Object.keys(details)) {
                const raw = details[field];
                let display;
                if (raw === null || raw === undefined) {
                    continue;
                } else if (Array.isArray(raw)) {
                    if (raw.length === 0) continue;
                    display = raw.every(v => typeof v !== 'object')
                        ? raw.join(', ')
                        : `${raw.length} items`;
                } else if (typeof raw === 'object') {
                    continue; // skip nested objects (e.g. engineResults)
                } else {
                    display = String(raw);
                }
                if (!display) continue;

                const row = document.createElement('div');
                row.className = 'fishbowl-inspector-source-row';

                const k = document.createElement('span');
                k.className = 'fishbowl-inspector-source-key';
                k.textContent = this._humanizeKey(field);

                const v = document.createElement('span');
                v.className = 'fishbowl-inspector-source-val';
                v.textContent = display;
                v.title = display;

                row.appendChild(k);
                row.appendChild(v);
                sourceEl.appendChild(row);
            }

            wrap.appendChild(sourceEl);
            rendered++;
        }

        return rendered > 0 ? wrap : null;
    }

    _normalizeFieldKey(field) {
        return String(field || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /**
     * Build the set of "field=value" pairs used to relate entities. Only the
     * relevant identity/network fields (RELATIONSHIP_FIELDS) are considered, with
     * scalar and array-of-scalar values; null/undefined, nested objects, and
     * object-arrays are skipped. The boolean network flags (RELATIONSHIP_TRUE_ONLY:
     * proxy/tor/relay/vpn) only count when true. Pairs are lowercased so matching
     * is case-insensitive, and fields are not namespaced by source (e.g.
     * country=germany matches across sources).
     * @returns {Set<string>}
     */
    _fieldValuePairs(entity) {
        const pairs = new Set();
        const results = entity.cachedData?.results;
        if (!results || typeof results !== 'object') return pairs;

        for (const sourceKey of Object.keys(results)) {
            const details = results[sourceKey]?.details;
            if (!details || typeof details !== 'object') continue;

            for (const field of Object.keys(details)) {
                const normField = this._normalizeFieldKey(field);
                if (!FishBowlEntityInspector.RELATIONSHIP_FIELDS.has(normField)) continue;

                const raw = details[field];
                let val;
                if (raw === null || raw === undefined) {
                    continue;
                } else if (Array.isArray(raw)) {
                    if (raw.length === 0 || !raw.every(v => typeof v !== 'object')) continue;
                    val = raw.join(', ');
                } else if (typeof raw === 'object') {
                    continue;
                } else {
                    val = String(raw);
                }
                val = val.trim();
                if (!val) continue;

                // Boolean network flags relate only on a positive match.
                if (FishBowlEntityInspector.RELATIONSHIP_TRUE_ONLY.has(normField)
                    && !['true', 'yes', '1'].includes(val.toLowerCase())) {
                    continue;
                }

                // Lowercased so relationship matching is case-insensitive.
                pairs.add(`${field}=${val}`.toLowerCase());
            }
        }
        return pairs;
    }

    /**
     * Relationships = other entities that share at least one exact identical
     * source field:value (see _fieldValuePairs) with the selected entity.
     */
    _renderRelationships(entity) {
        const selfPairs = this._fieldValuePairs(entity);
        if (selfPairs.size === 0) return null;

        const selfKey = this._entityKey(entity);
        const related = this.entities.filter(en => {
            if (this._entityKey(en) === selfKey) return false;
            for (const pair of this._fieldValuePairs(en)) {
                if (selfPairs.has(pair)) return true;
            }
            return false;
        });

        if (related.length === 0) return null;

        const wrap = document.createElement('div');
        wrap.appendChild(this._chips(related.slice(0, 40)));
        return wrap;
    }

    _chips(entities) {
        const row = document.createElement('div');
        row.className = 'fishbowl-inspector-chips';
        for (const entity of entities) {
            const key = this._entityKey(entity);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'fishbowl-inspector-chip';
            if (entity.verdict) chip.classList.add(`fishbowl-verdict-${entity.verdict}`);

            const colorVar = FishBowlEntityInspector.TYPE_COLOR_VAR[entity.type];
            const dot = document.createElement('span');
            dot.className = 'fishbowl-inspector-chip-dot';
            if (colorVar) dot.style.background = `var(${colorVar})`;
            chip.appendChild(dot);

            const text = document.createElement('span');
            text.textContent = entity.value;
            chip.appendChild(text);

            chip.title = `${entity.typeLabel}: ${entity.value}`;
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                this._select(key, true);
                this._highlight(entity);
            });
            row.appendChild(chip);
        }
        return row;
    }

    _renderActions(entity) {
        const actions = document.createElement('div');
        actions.className = 'fishbowl-inspector-actions';

        const search = this._actionButton('Dashboard', () => this._search(entity));
        const highlight = this._actionButton('Highlight on page', () => this._highlight(entity));
        const copy = this._actionButton('Copy', () => this._copy(entity));

        actions.appendChild(search);
        actions.appendChild(highlight);
        actions.appendChild(copy);
        return actions;
    }

    _actionButton(label, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fishbowl-inspector-action';
        btn.textContent = label;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }

    _search(entity) {
        try {
            if (window.FishBowlUiManager &&
                typeof window.FishBowlUiManager.executeDoubleClickAction === 'function') {
                window.FishBowlUiManager.executeDoubleClickAction(entity.type, this._actionValue(entity));
            }
        } catch (e) {
            console.warn('[FishBowl EntityInspector] Failed to run search action', e);
        }
    }

    _highlight(entity) {
        try {
            const value = this._actionValue(entity);
            if (window.FishBowlUiManager &&
                typeof window.FishBowlUiManager.scrollToHighlightedContent === 'function') {
                window.FishBowlUiManager.scrollToHighlightedContent(entity.type, value);
            }
        } catch (e) {
            console.warn('[FishBowl EntityInspector] Failed to highlight entity', e);
        }
    }

    _copy(entity) {
        try {
            const value = this._actionValue(entity);
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(value).catch(err => {
                    console.warn('[FishBowl EntityInspector] Clipboard write failed', err);
                });
            }
        } catch (e) {
            console.warn('[FishBowl EntityInspector] Failed to copy entity', e);
        }
    }

    /**
     * Turn a raw field key into a Title Case label, e.g.
     * "asnName" → "Asn Name", "abuse_confidence_score" → "Abuse Confidence Score".
     */
    _humanizeKey(key) {
        const words = String(key || '')
            .replace(/[_-]+/g, ' ')
            .replace(/([a-z\d])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim();
        if (!words) return '';
        return words.split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    /**
     * Turn a badge key (e.g. "vt:12/89", "flag:🇩🇪:Germany", "abuseipdb:WL")
     * into a human-readable label.
     */
    _formatBadge(badge) {
        if (typeof badge !== 'string') return String(badge);
        const parts = badge.split(':');
        const prefix = parts[0];
        const rest = parts.slice(1).join(':');
        switch (prefix) {
            case 'flag':
                return parts.length >= 3 ? `${parts[1]} ${parts.slice(2).join(':')}` : (parts[1] || badge);
            case 'vt':
                return `VirusTotal ${rest}`;
            case 'abuseipdb':
                return rest === 'WL' ? 'AbuseIPDB whitelisted' : `AbuseIPDB ${rest}`;
            case 'spur':
                return `Spur ${parts[1] || ''}`.trim();
            case 'org':
            case 'type':
                return rest || badge;
            default:
                return badge;
        }
    }
}

window.FishBowlEntityInspector = FishBowlEntityInspector;
