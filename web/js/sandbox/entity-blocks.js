/**
 * FishBowl - Investigation Sandbox: Entity Blocks Renderer
 *
 * Renders the Raw Materials sidebar and standalone Workspace entity blocks + enrichment blocks.
 * Exposed on `window.SbEntityBlocks`.
 */

(function () {
    // Tracks which sidebar containers already have delegated listeners attached.
    const _sidebarDelegated = new WeakSet();
    // Stores the current dblclick callback per container (updated each render call).
    const _sidebarDblClickCb = new WeakMap();

    function _attachSidebarDelegation(container) {
        container.addEventListener('dragstart', e => {
            const el = e.target.closest('.sb-sidebar-item');
            if (!el) return;
            const selected = container.querySelectorAll('.sb-sidebar-item.sb-item-selected');
            const isSelected = el.classList.contains('sb-item-selected');
            const payload = [];
            if (isSelected && selected.length > 0) {
                selected.forEach(s => payload.push({ source: 'sidebar', type: s.dataset.type, value: s.dataset.value }));
            } else {
                payload.push({ source: 'sidebar', type: el.dataset.type, value: el.dataset.value });
            }
            e.dataTransfer.setData('application/json', JSON.stringify(payload.length === 1 ? payload[0] : { source: 'sidebar-multi', items: payload }));
            e.dataTransfer.effectAllowed = 'copy';
        });

        container.addEventListener('click', e => {
            const el = e.target.closest('.sb-sidebar-item');
            if (!el) return;
            if (e.ctrlKey || e.metaKey) {
                // Enforce single entity type: selections can never mix types
                // (e.g. 2 IPs and a domain). If this item's type differs from
                // the current selection, clear the selection before adding it.
                if (!el.classList.contains('sb-item-selected')) {
                    const selected = container.querySelectorAll('.sb-sidebar-item.sb-item-selected');
                    if (selected.length > 0 && selected[0].dataset.type !== el.dataset.type) {
                        selected.forEach(s => s.classList.remove('sb-item-selected'));
                    }
                }
                el.classList.toggle('sb-item-selected');
            } else {
                const wasSelected = el.classList.contains('sb-item-selected');
                container.querySelectorAll('.sb-sidebar-item.sb-item-selected').forEach(s => s.classList.remove('sb-item-selected'));
                if (!wasSelected) el.classList.add('sb-item-selected');
            }
        });

        container.addEventListener('dblclick', e => {
            const el = e.target.closest('.sb-sidebar-item');
            if (!el) return;
            const cb = _sidebarDblClickCb.get(container);
            if (typeof cb !== 'function') return;
            e.preventDefault();
            const selected = container.querySelectorAll('.sb-sidebar-item.sb-item-selected');
            const isSelected = el.classList.contains('sb-item-selected');
            const items = [];
            if (isSelected && selected.length > 1) {
                selected.forEach(s => items.push({ type: s.dataset.type, value: s.dataset.value }));
            } else {
                items.push({ type: el.dataset.type, value: el.dataset.value });
            }
            cb(items);
        });
    }

    const TYPE_META = {
        ip: { label: 'IPs', color: 'var(--c-ip)' },
        domain: { label: 'Domains', color: 'var(--c-domain)' },
        hash: { label: 'Hashes', color: 'var(--c-hash)' },
        file: { label: 'Files', color: 'var(--c-file)' },
        event: { label: 'Events', color: 'var(--c-eventid)' },
        sid: { label: 'SIDs', color: 'var(--c-sid)' },
        asn: { label: 'ASNs', color: 'var(--c-asn)' },
    };

    function entityValue(type, entity) {
        return entity.value || entity.ip || entity.domain || (entity.number != null ? `AS${entity.number}` : null) || entity.eventId || entity.sid || entity.file || '(unknown)';
    }

    function buildVerdictEl(verdict) {
        const v = (verdict || 'unknown').toLowerCase();
        const el = document.createElement('span');
        el.className = `sb-verdict sb-verdict-${v}`;
        // const dots = { malicious: '🔴', suspicious: '🟡', benign: '🟢', clean: '🟢', neutral: '⚫', unknown: '⚪' };
        // el.textContent = `${dots[v] || '⚪'} ${v}`;
        el.textContent = `${v}`;
        return el;
    }

    /** Extract tags from entity results (IPInfo tags, VT ratio, AbuseIPDB score) */
    function extractTags(entityData) {
        const tags = [];
        const results = entityData.results || [];
        for (const r of results) {
            const src = (r.source || '').toLowerCase();
            const details = r.details || {};

            if (src === 'ipinfo') {
                if (Array.isArray(details.tags)) tags.push(...details.tags);
                if (details.hosting) tags.push('hosting');
                if (details.vpn) tags.push('vpn');
                if (details.tor) tags.push('tor');
                if (details.proxy) tags.push('proxy');
                if (details.relay) tags.push('relay');
            }

            if (src === 'virustotal' && details.engineResults) {
                const er = details.engineResults;
                if (Number.isFinite(er.detected) && Number.isFinite(er.total) && er.total > 0) {
                    tags.push(`VT ${er.detected}/${er.total}`);
                }
            }

            if (src === 'abuseipdb') {
                const score = parseInt(details.abuseConfidenceScore, 10);
                if (Number.isFinite(score)) tags.push(`Abuse ${score}%`);
            }

            if (src === 'spur') {
                if (Array.isArray(details.tunnels)) {
                    details.tunnels.forEach(t => {
                        if (t && t.operator) {
                            const iconUrl = t.iconUrl || `https://storage.googleapis.com/spur.us/website/resources/tags/logos/${t.operator}.png`;
                            tags.push({ text: t.operator, iconUrl });
                        }
                    });
                }
            }

            if (src === 'shodan') {
                if (Array.isArray(details.tags)) tags.push(...details.tags);
                if (Array.isArray(details.ports) && details.ports.length > 0) {
                    tags.push(`Ports ${details.ports.length}`);
                }
                if (Array.isArray(details.vulns) && details.vulns.length > 0) {
                    tags.push(`CVE ${details.vulns.length}`);
                }
            }
        }
        // Deduplicate: plain strings by value, objects by .text
        const seen = new Set();
        return tags.filter(tag => {
            const key = typeof tag === 'object' ? tag.text : tag;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // ─── Sidebar Rendering ───────────────────────────────────────────

    function renderSidebar(sidebarContainer, entitiesMap, searchFilter, onDoubleClick) {
        // Store latest callback and ensure delegated listeners are attached only once per container.
        _sidebarDblClickCb.set(sidebarContainer, onDoubleClick || null);
        if (!_sidebarDelegated.has(sidebarContainer)) {
            _sidebarDelegated.add(sidebarContainer);
            _attachSidebarDelegation(sidebarContainer);
        }

        sidebarContainer.innerHTML = '';
        const TYPES_ORDER = ['ip', 'domain', 'hash', 'file', 'event', 'sid', 'asn'];
        const filter = (searchFilter || '').toLowerCase();

        TYPES_ORDER.forEach(type => {
            let items = entitiesMap[type] || [];
            if (filter) {
                items = items.filter(item => entityValue(type, item).toLowerCase().includes(filter));
            }
            if (items.length === 0) return;

            const section = document.createElement('div');
            section.className = 'sb-sidebar-section';

            const title = document.createElement('div');
            title.className = 'sb-sidebar-section-title';
            const dot = document.createElement('div');
            dot.className = `sb-block-type-dot sb-type-${type}-dot`;
            title.appendChild(dot);
            title.appendChild(document.createTextNode(` ${TYPE_META[type].label} (${items.length})`));
            section.appendChild(title);

            const list = document.createElement('div');
            list.className = 'sb-sidebar-list';

            items.forEach(item => {
                const val = entityValue(type, item);
                const el = document.createElement('div');
                el.className = 'sb-sidebar-item';
                el.draggable = true;
                el.dataset.type = type;
                el.dataset.value = val;

                if (item.verdict && item.verdict !== 'unknown') {
                    el.dataset.verdict = item.verdict.toLowerCase();
                }

                const textSpan = document.createElement('span');
                textSpan.className = 'sb-sidebar-item-text';
                textSpan.title = val;
                textSpan.textContent = val;
                el.appendChild(textSpan);

                const icon = document.createElement('span');
                icon.className = 'sb-sidebar-icon';
                icon.textContent = '▤';
                icon.setAttribute('aria-hidden', 'true');
                el.appendChild(icon);

                list.appendChild(el);
            });

            section.appendChild(list);
            sidebarContainer.appendChild(section);
        });
    }

    // ─── Workspace Rendering ─────────────────────────────────────────

    let _hoveredBlockId = null;
    let _shiftListenersAttached = false;

    function getConnectedIds(blockId, allDepths) {
        const links = window.SbLinks ? window.SbLinks.getLinks() : [];
        const result = new Set();
        if (!allDepths) {
            links.forEach(l => {
                if (l.from.blockId === blockId) result.add(l.to.blockId);
                else if (l.to.blockId === blockId) result.add(l.from.blockId);
            });
            return result;
        }
        // BFS - seen includes blockId so we don't highlight the hovered block itself
        const seen = new Set([blockId]);
        const queue = [blockId];
        while (queue.length) {
            const current = queue.shift();
            links.forEach(l => {
                let neighbor = null;
                if (l.from.blockId === current) neighbor = l.to.blockId;
                else if (l.to.blockId === current) neighbor = l.from.blockId;
                if (neighbor && !seen.has(neighbor)) {
                    seen.add(neighbor);
                    result.add(neighbor);
                    queue.push(neighbor);
                }
            });
        }
        return result;
    }

    function applyConnectedHighlight(blockId, allDepths) {
        document.querySelectorAll('.sb-block-connected').forEach(el => el.classList.remove('sb-block-connected'));
        if (!blockId) return;
        getConnectedIds(blockId, allDepths).forEach(id => {
            const el = document.querySelector(`[data-workspace-id="${CSS.escape(id)}"]`) ||
                       document.querySelector(`[data-enrichment-id="${CSS.escape(id)}"]`);
            if (el) el.classList.add('sb-block-connected');
        });
    }

    function attachConnectedHighlight(block) {
        if (!_shiftListenersAttached) {
            _shiftListenersAttached = true;
            document.addEventListener('keydown', e => {
                if (e.key === 'Shift' && _hoveredBlockId) applyConnectedHighlight(_hoveredBlockId, true);
            });
            document.addEventListener('keyup', e => {
                if (e.key === 'Shift' && _hoveredBlockId) applyConnectedHighlight(_hoveredBlockId, false);
            });
        }

        block.addEventListener('mouseenter', e => {
            _hoveredBlockId = block.dataset.workspaceId || block.dataset.enrichmentId;
            applyConnectedHighlight(_hoveredBlockId, e.shiftKey);
        });
        block.addEventListener('mouseleave', () => {
            _hoveredBlockId = null;
            document.querySelectorAll('.sb-block-connected').forEach(el => el.classList.remove('sb-block-connected'));
        });
    }

    function buildWorkspaceEntityBox(we, entityData, callbacks) {
        const type = we.type;
        const val = we.value;

        // Standalone box - uses CSS class .sb-workspace-block for sizing
        const block = document.createElement('div');
        block.className = `sb-block sb-type-${type} sb-workspace-block`;
        block.dataset.workspaceId = we.id;
        block.dataset.type = type;
        block.dataset.value = val;
        block.style.left = `${we.x}px`;
        block.style.top = `${we.y}px`;

        // Header - no type dot on canvas blocks (point 4), keep reputation dot
        const header = document.createElement('div');
        header.className = 'sb-block-header';

        const title = document.createElement('div');
        title.className = 'sb-block-title';
        title.textContent = val;
        title.title = val;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'sb-entity-remove';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove from workspace';
        removeBtn.setAttribute('aria-label', 'Remove from workspace');
        removeBtn.addEventListener('click', () => callbacks.onRemoveWorkspace && callbacks.onRemoveWorkspace(we.id));

        header.appendChild(title);
        header.appendChild(removeBtn);
        block.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'sb-block-body';

        // Add verdict badge
        body.appendChild(buildVerdictEl(entityData.verdict));

        // Show existing note text
        if (entityData.notes) {
            const noteEl = document.createElement('div');
            noteEl.className = 'sb-entity-note';
            noteEl.textContent = entityData.notes;
            body.appendChild(noteEl);
        }

        // Add operation buttons inside the body
        const ops = document.createElement('div');
        ops.className = 'sb-entity-ops';

        const hasReputation = ['ip', 'domain', 'hash', 'file', 'asn'].includes(type);
        if (hasReputation) {
            const analyzeBtn = document.createElement('button');
            analyzeBtn.className = 'sb-op-btn sb-op-analyze';
            analyzeBtn.textContent = 'Analyze';
            analyzeBtn.addEventListener('click', () => callbacks.onLookup && callbacks.onLookup(type, val, block, analyzeBtn));
            ops.appendChild(analyzeBtn);
        }

        const copyBtn = document.createElement('button');
        copyBtn.className = 'sb-op-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => callbacks.onCopy && callbacks.onCopy(val, copyBtn));
        ops.appendChild(copyBtn);

        const noteBtn = document.createElement('button');
        noteBtn.className = 'sb-op-btn';
        noteBtn.textContent = 'Note';
        noteBtn.addEventListener('click', () => callbacks.onNote && callbacks.onNote(type, val, body));
        ops.appendChild(noteBtn);

        const connectBtn = document.createElement('button');
        connectBtn.className = 'sb-op-btn sb-op-connect';
        connectBtn.textContent = 'Connect';
        connectBtn.addEventListener('click', () => callbacks.onConnect && callbacks.onConnect(we.id, block));
        ops.appendChild(connectBtn);

        const disconnectContainer = document.createElement('div');
        disconnectContainer.className = 'sb-op-dropdown-container';

        const disconnectBtn = document.createElement('button');
        disconnectBtn.className = 'sb-op-btn sb-op-disconnect';
        disconnectBtn.textContent = 'Disconnect ▼';

        const disconnectMenu = document.createElement('div');
        disconnectMenu.className = 'sb-disconnect-menu';
        disconnectMenu.style.display = 'none';

        disconnectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (disconnectMenu.style.display === 'block') {
                disconnectMenu.style.display = 'none';
                return;
            }
            // Close other menus
            document.querySelectorAll('.sb-disconnect-menu').forEach(m => m.style.display = 'none');

            disconnectMenu.innerHTML = '';
            const conns = callbacks.onGetConnections ? callbacks.onGetConnections(we.id) : [];
            if (conns.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'sb-disconnect-item';
                empty.style.pointerEvents = 'none';
                empty.style.color = 'var(--fg-3)';
                empty.textContent = 'No connections';
                disconnectMenu.appendChild(empty);
            } else {
                conns.forEach(c => {
                    const item = document.createElement('div');
                    item.className = 'sb-disconnect-item';
                    item.textContent = c.label;
                    item.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        disconnectMenu.style.display = 'none';
                        if (callbacks.onRemoveConnection) {
                            callbacks.onRemoveConnection(c.key);
                        }
                    });
                    disconnectMenu.appendChild(item);
                });
            }

            // Position the menu globally to avoid overflow clipping from sb-block-body
            const rect = disconnectBtn.getBoundingClientRect();
            disconnectMenu.style.left = `${rect.left}px`;
            disconnectMenu.style.top = `${rect.bottom + 4}px`;
            disconnectMenu.style.display = 'block';
        });

        // Hide menus when clicking outside
        document.addEventListener('click', () => {
            document.querySelectorAll('.sb-disconnect-menu').forEach(m => m.style.display = 'none');
        });

        document.body.appendChild(disconnectMenu);
        disconnectContainer.appendChild(disconnectBtn);
        ops.appendChild(disconnectContainer);
        block.appendChild(body);
        body.appendChild(ops);

        // Tags extracted from results
        const tags = extractTags(entityData);
        if (tags.length > 0) {
            const tagsEl = document.createElement('div');
            tagsEl.className = 'sb-entity-tags';
            tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'sb-entity-tag';

                if (typeof tag === 'object' && tag.iconUrl) {
                    const img = document.createElement('img');
                    img.src = tag.iconUrl;
                    img.alt = '';
                    img.style.cssText = 'width:14px;height:14px;vertical-align:middle;margin-right:3px;border-radius:2px;';
                    tagSpan.appendChild(img);
                    tagSpan.appendChild(document.createTextNode(tag.text));
                } else {
                    tagSpan.textContent = typeof tag === 'object' ? tag.text : tag;
                }

                tagsEl.appendChild(tagSpan);
            });
            body.insertBefore(tagsEl, ops);
        }

        attachConnectedHighlight(block);
        return block;
    }

    function renderWorkspaceEntities(canvasInner, inv, callbacks) {
        // Clear all blocks except SVG lines
        Array.from(canvasInner.children).forEach(el => {
            if (!el.matches('svg')) el.remove();
        });

        const rendered = new Map();
        const wes = inv.workspaceEntities || [];

        wes.forEach(we => {
            // Find underlying entity data for verdicts etc
            const typeList = inv.entities[we.type] || [];
            const data = typeList.find(e => entityValue(we.type, e) === we.value) || { verdict: 'unknown' };

            const block = buildWorkspaceEntityBox(we, data, callbacks);
            canvasInner.appendChild(block);
            rendered.set(we.id, block);
        });

        return rendered;
    }

    // ─── Enrichment Rendering ────────────────────────────────────────

    function buildServiceUrl(source, value) {
        if (!source || !value) return null;
        const svc = (FishBowlConfig.ALL_SERVICES || []).find(s => s.id === source);
        if (svc && svc.url) {
            return svc.url.replace(FishBowlConsts.VALUE_PLACEHOLDER, encodeURIComponent(value));
        }
        return null;
    }

    // Mark an element as an Alt-click pickable value (carries the value + class for styling).
    function markPickable(el, val) {
        const s = (val == null ? '' : String(val)).trim();
        if (!s) return;
        el.dataset.value = s;
        el.classList.add('sb-pickable-val');
    }

    function buildEnrichmentBlock(enrichment, position, onLookupDerived, onAddDerivedEntity, workspaceEntities = [], onRetryLookup = null) {
        const block = document.createElement('div');
        block.className = 'sb-block sb-block-enrichment';
        block.dataset.enrichmentId = enrichment.id;
        if (enrichment.parentId) block.dataset.parentId = enrichment.parentId;
        block.style.left = `${enrichment.x || position.x}px`;
        block.style.top = `${enrichment.y || position.y}px`;

        const header = document.createElement('div');
        header.className = 'sb-block-header';

        const v = (enrichment.verdict || 'unknown').toLowerCase();

        // Service logo - resolved from the owning service id the same way the bottom bar does
        let logo = null;
        try {
            const iconPath = FishBowlConsts.SHORTCUT_ICON_PATHS[enrichment.source];
            if (iconPath) {
                logo = document.createElement('img');
                logo.className = 'sb-enrichment-logo';
                logo.alt = enrichment.label || enrichment.source;
                logo.src = iconPath.startsWith('http')
                    ? iconPath
                    : browser.runtime.getURL(iconPath);
                logo.addEventListener('error', function () { this.style.display = 'none'; });
            }
        } catch (e) {
            console.warn('[FishBowl Sandbox] Failed to resolve service logo', e);
        }

        const title = document.createElement('div');
        title.className = 'sb-block-title';
        title.textContent = enrichment.label || enrichment.source;

        const badge = document.createElement('div');
        badge.className = `sb-verdict sb-verdict-${v} sb-enrichment-verdict-badge`;
        badge.textContent = enrichment.verdict || 'unknown';

        // External link button - opens the service page for this entity in a new tab
        const visitBtn = document.createElement('button');
        visitBtn.className = 'sb-op-btn sb-op-visit';
        visitBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V7"/><path d="M7 1h4v4"/><path d="M5 7L11 1"/></svg>';
        visitBtn.title = 'Open service page in new tab';
        const serviceUrl = buildServiceUrl(enrichment.source, enrichment.parentValue);
        if (serviceUrl) {
            visitBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                window.open(serviceUrl, '_blank');
            });
        } else {
            visitBtn.disabled = true;
            visitBtn.title = 'N/A';
            visitBtn.style.opacity = '0.4';
            visitBtn.style.cursor = 'not-allowed';
        }

        if (logo) header.appendChild(logo);
        header.appendChild(title);
        header.appendChild(visitBtn);
        header.appendChild(badge);
        block.appendChild(header);

        const body = document.createElement('div');
        body.className = 'sb-block-body';

        const details = enrichment.details || {};
        // Float the most meaningful reputation fields to the front so they survive the
        // 8-key cap below. Backends serialize detail maps with alphabetically-sorted keys,
        // which would otherwise push AbuseIPDB's reportCount (9th alphabetically) out of view.
        const DETAIL_PRIORITY = ['abuseConfidenceScore', 'reportCount', 'distinctUsers'];
        const detailKeys = [
            ...DETAIL_PRIORITY.filter(k => k in details),
            ...Object.keys(details).filter(k => !DETAIL_PRIORITY.includes(k))
        ].slice(0, 8);
        if (detailKeys.length > 0) {
            const detailsEl = document.createElement('div');
            detailsEl.className = 'sb-enrichment-details';
            detailKeys.forEach(k => {
                const row = document.createElement('div');
                row.className = 'sb-enrichment-detail-row';
                const keySpan = document.createElement('span');
                keySpan.className = 'sb-detail-key';
                keySpan.textContent = k;
                const valSpan = document.createElement('span');
                valSpan.className = 'sb-detail-val';
                const rawVal = details[k];
                if (rawVal === null || rawVal === undefined) {
                    valSpan.textContent = '';
                } else if (Array.isArray(rawVal)) {
                    const list = document.createElement('ul');
                    list.className = 'sb-detail-list';
                    rawVal.forEach(item => {
                        const li = document.createElement('li');
                        if (item && typeof item === 'object' && item.name) {
                            li.textContent = item.name;
                            if (item.tooltip) li.title = item.tooltip;
                        } else {
                            li.textContent = typeof item === 'object' ? JSON.stringify(item) : String(item);
                        }
                        markPickable(li, li.textContent);
                        list.appendChild(li);
                    });
                    valSpan.appendChild(list);
                } else if (typeof rawVal === 'object') {
                    const table = document.createElement('div');
                    table.className = 'sb-detail-table';
                    Object.entries(rawVal).forEach(([subKey, subVal]) => {
                        const tableRow = document.createElement('div');
                        tableRow.className = 'sb-detail-table-row';
                        const kEl = document.createElement('span');
                        kEl.className = 'sb-detail-table-key';
                        kEl.textContent = subKey;
                        const vEl = document.createElement('span');
                        vEl.className = 'sb-detail-table-val';
                        vEl.textContent = typeof subVal === 'object' ? JSON.stringify(subVal) : String(subVal);
                        markPickable(vEl, vEl.textContent);
                        tableRow.appendChild(kEl);
                        tableRow.appendChild(vEl);
                        table.appendChild(tableRow);
                    });
                    valSpan.appendChild(table);
                } else {
                    valSpan.textContent = String(rawVal);
                    markPickable(valSpan, valSpan.textContent);
                }
                row.appendChild(keySpan);
                row.appendChild(valSpan);
                detailsEl.appendChild(row);
            });
            body.appendChild(detailsEl);
        }

        if (enrichment.error) {
            const errEl = document.createElement('div');
            errEl.className = 'sb-enrichment-error';
            
            const errText = document.createElement('span');
            errText.textContent = `Error: ${enrichment.error}`;
            errEl.appendChild(errText);

            if (onRetryLookup && enrichment.parentType && enrichment.parentValue) {
                const retryBtn = document.createElement('button');
                retryBtn.className = 'sb-op-btn sb-op-retry';
                retryBtn.textContent = 'Retry';
                retryBtn.style.marginLeft = '10px';
                retryBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    onRetryLookup(enrichment.parentType, enrichment.parentValue, enrichment.source, retryBtn);
                });
                errEl.appendChild(retryBtn);
            }

            body.appendChild(errEl);
        }

        block.appendChild(body);

        // Derived entities pinned at bottom (outside scrollable body)
        const derived = enrichment.derivedEntities || [];
        if (derived.length > 0) {
            const footer = document.createElement('div');
            footer.className = 'sb-enrichment-footer';

            const derivedHeader = document.createElement('div');
            derivedHeader.className = 'sb-enrichment-derived-header';
            derivedHeader.textContent = 'Entities found';
            footer.appendChild(derivedHeader);

            const derivedList = document.createElement('div');
            derivedList.className = 'sb-enrichment-derived-list';

            derived.forEach(de => {
                const row = document.createElement('div');
                row.className = 'sb-enrichment-derived-row';

                const valEl = document.createElement('span');
                valEl.className = 'sb-enrichment-derived-val';
                valEl.textContent = de.value;
                markPickable(valEl, de.value);

                row.appendChild(valEl);

                // "+" button and double-click to add entity to workspace
                if (onAddDerivedEntity) {
                    const addBtn = document.createElement('button');
                    addBtn.className = 'sb-op-btn sb-op-add-derived';
                    addBtn.textContent = '+';

                    const isConnected = workspaceEntities.some(we => we.type === de.type && we.value === de.value);
                    if (isConnected) {
                        addBtn.disabled = true;
                        addBtn.textContent = '✓';
                        addBtn.title = 'Already on workspace';
                        addBtn.classList.add('sb-op-add-derived-connected');
                        row.classList.add('sb-derived-connected');
                        row.title = 'Already on workspace';
                    } else {
                        addBtn.title = 'Add to workspace';
                        row.title = 'Double-click to add to workspace';
                        row.style.cursor = 'pointer';

                        const handleAdd = (ev) => {
                            ev.stopPropagation();
                            onAddDerivedEntity(de.type, de.value, enrichment.id);
                        };

                        addBtn.addEventListener('click', handleAdd);
                        
                        // Allow double clicking on the row to achieve the same result
                        row.addEventListener('dblclick', (ev) => {
                            ev.preventDefault(); // Prevents text selection
                            handleAdd(ev);
                        });
                    }
                    row.appendChild(addBtn);
                }

                derivedList.appendChild(row);
            });

            footer.appendChild(derivedList);
            block.appendChild(footer);
        }

        attachConnectedHighlight(block);
        return block;
    }

    function renderEnrichmentBlocks(canvasInner, inv, onLookupDerived, onAddDerivedEntity, hideUnknown = false, hideError = false, onRetryLookup = null) {
        let blocks = inv.enrichmentBlocks || [];
        const enrichMap = new Map();

        if (hideUnknown || hideError) {
            blocks = blocks.filter(b => {
                const verdict = (b.verdict || 'unknown').toLowerCase();
                if (hideUnknown && verdict === 'unknown' && !b.error) return false;
                if (hideError && b.error) return false;
                return true;
            });
        }

        blocks.forEach((enrichment, _idx) => {
            const el = buildEnrichmentBlock(enrichment, { x: enrichment.x || 300, y: enrichment.y || 100 }, onLookupDerived, onAddDerivedEntity, inv.workspaceEntities || [], onRetryLookup);
            canvasInner.appendChild(el);
            enrichMap.set(enrichment.id, el);
        });

        return enrichMap;
    }

    // ─── Value Filter ────────────────────────────────────────────────

    // Distinct, sorted list of every value present anywhere in the investigation:
    // workspace entity values, enrichment parent values, and derived entity values.
    function collectValueOptions(inv) {
        if (!inv) return [];
        const set = new Set();
        (inv.workspaceEntities || []).forEach(we => { if (we.value) set.add(we.value); });
        (inv.enrichmentBlocks || []).forEach(eb => {
            if (eb.parentValue) set.add(eb.parentValue);
            (eb.derivedEntities || []).forEach(de => { if (de.value) set.add(de.value); });
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }

    // Highlight every block that references ANY of `values` (union); dim the rest.
    // Empty list clears the filter.
    function applyValueFilter(canvasInner, inv, values) {
        if (!canvasInner) return;
        canvasInner.querySelectorAll('.sb-value-match').forEach(el => el.classList.remove('sb-value-match'));

        const needles = new Set(
            (values || [])
                .map(v => (v || '').trim().toLowerCase())
                .filter(Boolean)
        );
        if (needles.size === 0 || !inv) {
            canvasInner.classList.remove('sb-value-filter');
            return;
        }

        // Match against the DOM, which is the source of truth for what is pickable.
        // Every workspace block carries its value in dataset.value, and every other
        // pickable value (enrichment details, derived entities, …) lives on a
        // `.sb-pickable-val` element — so this stays correct for any pickable content.
        const matched = new Set();
        const hit = v => needles.has((v || '').trim().toLowerCase());

        canvasInner.querySelectorAll('[data-workspace-id]').forEach(block => {
            if (hit(block.dataset.value)) matched.add(block);
        });
        canvasInner.querySelectorAll('.sb-pickable-val').forEach(el => {
            if (!hit(el.dataset.value)) return;
            const block = el.closest('.sb-block');
            if (block) matched.add(block);
        });

        // Also highlight the entity block each matched service block is linked to.
        // Snapshot first so the parents we add aren't re-scanned.
        Array.from(matched).forEach(block => {
            const eid = block.dataset.enrichmentId;
            if (!eid) return;
            const eb = (inv.enrichmentBlocks || []).find(b => b.id === eid);
            if (!eb || !eb.parentId) return;
            const parent = canvasInner.querySelector(`[data-workspace-id="${CSS.escape(eb.parentId)}"]`);
            if (parent) matched.add(parent);
        });

        canvasInner.classList.add('sb-value-filter');
        matched.forEach(block => block.classList.add('sb-value-match'));
    }

    // ─── Exports ─────────────────────────────────────────────────────

    window.SbEntityBlocks = {
        renderSidebar,
        renderWorkspaceEntities,
        renderEnrichmentBlocks,
        updateCard: () => { }, // placeholder for now, handled by total re-render usually
        entityValue,
        collectValueOptions,
        applyValueFilter,
        TYPE_META
    };
})();
