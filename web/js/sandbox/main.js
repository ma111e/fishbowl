/**
 * FishBowl - Investigation Sandbox: Main Entry Point
 *
 * Orchestrates:
 *   - Investigation CRUD & selection
 *   - Rendering Sidebar & Workspace (entity boxes + enrichment blocks)
 *   - Handling drag & drop from sidebar to canvas
 *   - Dragging workspace items
 *   - Link rendering via SbLinks
 */

(function () {
    'use strict';

    /**
     * Non-blocking toast notification replacing alert().
     * @param {string} message
     * @param {'info'|'error'|'warning'} [type]
     */
    function showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `sb-toast sb-toast-${type || 'info'}`;
        toast.textContent = message;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        document.body.appendChild(toast);
        // Animate out then remove
        setTimeout(() => toast.classList.add('sb-toast-fade'), 2800);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3400);
    }

    /**
     * Accessible replacement for window.prompt().
     * Returns a Promise that resolves to the entered string, or null if cancelled.
     */
    function showTextPrompt(message, defaultValue) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'sb-prompt-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'sb-prompt-msg');

            const dialog = document.createElement('div');
            dialog.className = 'sb-prompt-dialog';

            const msg = document.createElement('p');
            msg.id = 'sb-prompt-msg';
            msg.className = 'sb-prompt-message';
            msg.textContent = message;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'sb-prompt-input';
            input.value = defaultValue || '';
            input.setAttribute('aria-labelledby', 'sb-prompt-msg');

            const actions = document.createElement('div');
            actions.className = 'sb-prompt-actions';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'sb-op-btn';
            cancelBtn.textContent = 'Cancel';

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'sb-op-btn sb-op-analyze';
            confirmBtn.textContent = 'OK';

            function close(value) {
                document.removeEventListener('keydown', onKeyDown);
                overlay.remove();
                resolve(value);
            }

            function onKeyDown(e) {
                if (e.key === 'Escape') { e.preventDefault(); close(null); }
                if (e.key === 'Enter' && document.activeElement !== cancelBtn) { e.preventDefault(); close(input.value); }
                // Keep focus inside the dialog
                if (e.key === 'Tab') {
                    const focusable = [input, cancelBtn, confirmBtn];
                    const idx = focusable.indexOf(document.activeElement);
                    e.preventDefault();
                    focusable[(idx + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
                }
            }

            cancelBtn.addEventListener('click', () => close(null));
            confirmBtn.addEventListener('click', () => close(input.value));
            document.addEventListener('keydown', onKeyDown);

            actions.appendChild(cancelBtn);
            actions.appendChild(confirmBtn);
            dialog.appendChild(msg);
            dialog.appendChild(input);
            dialog.appendChild(actions);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            input.focus();
            input.select();
        });
    }

    let investigations = {};
    let activeId = null;
    let sidebarSearchTerm = '';
    let connectingFromId = null; // link mode state
    let hideUnknownBlocks = false;
    let hideErrorBlocks = false;
    let valueFilters = [];

    const sidebarContent = document.getElementById('sb-sidebar-content');
    const workspaceArea = document.getElementById('sb-workspace-area');
    const canvas = document.getElementById('sb-canvas');
    const canvasInner = document.getElementById('sb-canvas-inner');
    const linksSvg = document.getElementById('sb-links-svg');
    const emptyState = document.getElementById('sb-empty');
    const emptyTextNone = document.getElementById('sb-empty-text-none');
    const emptyTextBlocks = document.getElementById('sb-empty-text-blocks');
    const emptyAddBtn = document.getElementById('sb-btn-add-analyzed-empty');
    const invSelect = document.getElementById('sb-inv-select');
    const statusEl = document.getElementById('sb-status');
    const importTabSelect = document.getElementById('sb-import-tab');
    const sidebarSearch = document.getElementById('sb-sidebar-search');
    const valueSearch = document.getElementById('sb-value-search');
    const valueOptions = document.getElementById('sb-value-options');
    const valuePills = document.getElementById('sb-value-pills');

    async function init() {
        SbLinks.init(linksSvg, canvasInner);
        SbViewport.init(canvas, canvasInner);
        await reload();
        await maybeAutoAddAnalyzed();

        // If no investigations exist, auto-create an empty one (point 2)
        if (Object.keys(investigations).length === 0) {
            await createEmptyInvestigation(`Investigation ${new Date().toLocaleDateString()}`);
        }

        document.getElementById('sb-btn-new').addEventListener('click', onNewInvestigation);
        document.getElementById('sb-btn-import').addEventListener('click', onImportPage);
        document.getElementById('sb-btn-rename').addEventListener('click', onRename);
        document.getElementById('sb-btn-delete').addEventListener('click', onDelete);

        const btnExport = document.getElementById('sb-btn-export');
        const btnCopyJson = document.getElementById('sb-btn-copy-json');
        const btnImportJson = document.getElementById('sb-btn-import-json');
        const fileImport = document.getElementById('sb-file-import');

        if (btnExport) btnExport.addEventListener('click', onExport);
        if (btnCopyJson) btnCopyJson.addEventListener('click', onCopyJson);
        if (btnImportJson && fileImport) {
            btnImportJson.addEventListener('click', () => fileImport.click());
            fileImport.addEventListener('change', onImportJson);
        }

        // Layout auto-arrange buttons
        document.querySelectorAll('.sb-layout-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const layout = btn.dataset.layout;
                if (layout === 'flow') await arrangeFlow();
else if (layout === 'force') await arrangeForce();
                else if (layout === 'grid') await arrangeGrid();
            });
        });

        const btnClear = document.getElementById('sb-btn-clear');
        if (btnClear) btnClear.addEventListener('click', onClearAll);

        const btnAddAnalyzed = document.getElementById('sb-btn-add-analyzed');
        if (btnAddAnalyzed) btnAddAnalyzed.addEventListener('click', onAddAllAnalyzed);

        if (emptyAddBtn) emptyAddBtn.addEventListener('click', onAddAllAnalyzed);

        invSelect.addEventListener('change', () => setActive(invSelect.value || null));

        // Sidebar search (point 5)
        if (sidebarSearch) {
            sidebarSearch.addEventListener('input', () => {
                sidebarSearchTerm = sidebarSearch.value;
                renderSidebarOnly();
            });
        }

        // Value filter: select values (as pills) to highlight every block referencing any of them
        if (valueSearch) {
            valueSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addValueFilter(valueSearch.value);
                } else if (e.key === 'Backspace' && valueSearch.value === '' && valueFilters.length) {
                    valueFilters.pop();
                    renderValuePills();
                    SbEntityBlocks.applyValueFilter(canvasInner, activeInv(), valueFilters);
                }
            });
            // Fires when a datalist option is picked (and on blur with typed text)
            valueSearch.addEventListener('change', () => addValueFilter(valueSearch.value));
        }

        // Hold Alt to reveal clickable values on the canvas, then click one to add it as a pill.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Alt') canvasInner.classList.add('sb-value-pick-mode');
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Alt') canvasInner.classList.remove('sb-value-pick-mode');
        });
        window.addEventListener('blur', () => canvasInner.classList.remove('sb-value-pick-mode'));
        canvasInner.addEventListener('click', (e) => {
            if (!canvasInner.classList.contains('sb-value-pick-mode')) return;
            const pickable = e.target.closest('.sb-pickable-val');
            const value = pickable
                ? pickable.dataset.value
                : e.target.closest('.sb-block-title')?.closest('[data-workspace-id]')?.dataset.value;
            if (value) {
                e.preventDefault();
                e.stopPropagation();
                addValueFilter(value);
            }
        }, true);

        const toggleUnknown = document.getElementById('sb-toggle-unknown');
        if (toggleUnknown) {
            toggleUnknown.checked = !hideUnknownBlocks;
            toggleUnknown.addEventListener('change', (e) => {
                hideUnknownBlocks = !e.target.checked;
                render();
            });
        }

        const toggleError = document.getElementById('sb-toggle-error');
        if (toggleError) {
            toggleError.checked = !hideErrorBlocks;
            toggleError.addEventListener('change', (e) => {
                hideErrorBlocks = !e.target.checked;
                render();
            });
        }

        // Populate import tab dropdown on focus (point 7)
        if (importTabSelect) {
            importTabSelect.addEventListener('focus', populateTabDropdown);
            importTabSelect.addEventListener('mousedown', populateTabDropdown);
        }

        browser.runtime.onMessage.addListener(msg => {
            if (msg.action === 'investigationUpdated') {
                reload().then(maybeAutoAddAnalyzed);
            }
        });

        // Link mode: clicking on a block while in link mode completes the connection
        canvasInner.addEventListener('click', onCanvasBlockClick);

        setupDragAndDrop();
    }

    async function reload() {
        try {
            const resp = await SbStore.getInvestigations();
            if (resp?.success) {
                investigations = resp.investigations || {};
                activeId = resp.activeId || null;
            }
        } catch (e) {
            console.warn('[Sandbox] Failed to load investigations', e);
        }
        render();
    }

    function activeInv() {
        return activeId ? investigations[activeId] : null;
    }

    async function persistInv(inv) {
        try {
            await SbStore.saveInvestigation(inv);
        } catch (e) {
            console.warn('[Sandbox] Failed to save investigation', e);
        }
    }

    async function setActive(id) {
        activeId = id || null;
        try {
            await SbStore.setActiveInvestigation(activeId);
        } catch (e) {
            console.warn('[Sandbox] Failed to set active investigation', e);
        }
        render();
    }

    // ── Helpers ────────────────────────────────────────────────────

    async function createEmptyInvestigation(name) {
        setStatus('Creating…');
        const resp = await SbStore.importEntitiesToInvestigation({
            investigationId: null,
            name,
            entities: {}
        });
        if (resp?.success) {
            await reload();
            await setActive(resp.investigationId);
        }
        setStatus('');
    }

    // ── Drop from Sidebar ─────────────────────────────────────────

    function setupDragAndDrop() {
        workspaceArea.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        workspaceArea.addEventListener('drop', async e => {
            e.preventDefault();
            const raw = e.dataTransfer.getData('application/json');
            if (!raw) return;

            try {
                const data = JSON.parse(raw);
                const canvasCoords = SbViewport.screenToCanvas(e.clientX, e.clientY);
                const baseX = canvasCoords.x;
                const baseY = canvasCoords.y;

                // Multi-select drop (point 8)
                if (data.source === 'sidebar-multi' && Array.isArray(data.items)) {
                    const addedIds = [];
                    for (let i = 0; i < data.items.length; i++) {
                        const item = data.items[i];
                        const resp = await SbStore.addEntityToWorkspace({
                            type: item.type,
                            value: item.value,
                            x: baseX + (i % 4) * 30,
                            y: baseY + Math.floor(i / 4) * 30
                        });
                        if (resp?.success && resp.workspaceId) {
                            addedIds.push({ type: item.type, value: item.value, workspaceId: resp.workspaceId });
                        }
                    }
                    await reload();
                    // Link all dropped entities to enrichment blocks
                    const freshInv = activeInv();
                    if (freshInv && addedIds.length > 0) {
                        let changed = false;
                        for (const added of addedIds) {
                            if (linkEntityToEnrichmentBlocks(freshInv, added.type, added.value, added.workspaceId)) {
                                changed = true;
                            }
                        }
                        if (changed) {
                            await persistInv(freshInv);
                            await reload();
                        }
                    }
                    return;
                }

                if (data.source !== 'sidebar') return;

                const resp = await SbStore.addEntityToWorkspace({
                    type: data.type,
                    value: data.value,
                    x: baseX, y: baseY
                });

                if (resp?.success) {
                    await reload();
                    // Link to enrichment blocks that have this entity
                    if (resp.workspaceId) {
                        const freshInv = activeInv();
                        if (freshInv && linkEntityToEnrichmentBlocks(freshInv, data.type, data.value, resp.workspaceId)) {
                            await persistInv(freshInv);
                            await reload();
                        }
                    }
                }
            } catch (err) {
                console.warn('Failed to drop', err);
            }
        });
    }

    /**
     * Link a workspace entity to all enrichment blocks that contain it
     * in their derivedEntities list. Returns true if any links were added.
     */
    function linkEntityToEnrichmentBlocks(inv, type, value, workspaceId) {
        return SbLayout.linkEntityToEnrichmentBlocks(inv, type, value, workspaceId);
    }

    // ── Double-click from Sidebar ────────────────────────────────

    async function handleSidebarDoubleClick(items) {
        if (!items || items.length === 0) return;

        // Place at viewport center
        const canvasRect = canvas.getBoundingClientRect();
        const center = SbViewport.screenToCanvas(
            canvasRect.left + canvasRect.width / 2,
            canvasRect.top + canvasRect.height / 2
        );

        const addedIds = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                const resp = await SbStore.addEntityToWorkspace({
                    type: item.type,
                    value: item.value,
                    x: center.x + (i % 4) * 30,
                    y: center.y + Math.floor(i / 4) * 30
                });
                if (resp?.success && resp.workspaceId) {
                    addedIds.push({ type: item.type, value: item.value, workspaceId: resp.workspaceId });
                }
            } catch (err) {
                console.warn('[Sandbox] Failed to add entity via double-click', item, err);
            }
        }

        await reload();

        // Link all added entities to enrichment blocks
        const freshInv = activeInv();
        if (freshInv && addedIds.length > 0) {
            let changed = false;
            for (const added of addedIds) {
                if (linkEntityToEnrichmentBlocks(freshInv, added.type, added.value, added.workspaceId)) {
                    changed = true;
                }
            }
            if (changed) {
                await persistInv(freshInv);
                await reload();
            }
        }
    }

    async function onAddAllAnalyzed() {
        const inv = activeInv();
        if (!inv) return;

        const TYPES_ORDER = ['ip', 'domain', 'hash', 'file', 'event', 'sid', 'asn'];
        const alreadyOnCanvas = new Set(
            (inv.workspaceEntities || []).map(we => `${we.type}:${we.value}`)
        );

        const items = [];
        TYPES_ORDER.forEach(type => {
            (inv.entities[type] || []).forEach(entity => {
                const isAnalyzed = (entity.results && entity.results.length > 0) ||
                                   (entity.verdict && entity.verdict !== 'unknown');
                if (!isAnalyzed) return;
                const val = SbEntityBlocks.entityValue(type, entity);
                if (!alreadyOnCanvas.has(`${type}:${val}`)) {
                    items.push({ type, value: val });
                }
            });
        });

        if (items.length === 0) {
            setStatus('No new analyzed entities to add.');
            return;
        }

        await handleSidebarDoubleClick(items);
        await arrangeForce();
        setStatus(`Added ${items.length} analyzed entr${items.length === 1 ? 'y' : 'ies'}.`);
    }

    // Run onAddAllAnalyzed() once for an investigation flagged by the background
    // (e.g. created via 'n' in execution mode). Clears the flag so it fires once.
    async function maybeAutoAddAnalyzed() {
        const inv = activeInv();
        if (!inv || !inv._pendingAutoAddAnalyzed) return;
        delete inv._pendingAutoAddAnalyzed;
        await persistInv(inv);
        await onAddAllAnalyzed();
    }

    // ── Header actions ────────────────────────────────────────────

    async function onNewInvestigation() {
        const name = await showTextPrompt('Investigation name:', `Investigation ${new Date().toLocaleDateString()}`);
        if (!name) return;

        // Create the (empty) investigation first; this also makes it active.
        await createEmptyInvestigation(name);

        // Auto-import the selected tab's entities and place the analyzed ones on
        // the canvas. If no tab is selected, leave the investigation empty.
        const tabId = importTabSelect ? parseInt(importTabSelect.value, 10) : null;
        if (!tabId || isNaN(tabId)) {
            showToast('Select a tab to auto-import analyzed entities.', 'info');
            return;
        }

        setStatus('Importing…');
        try {
            await importEntitiesFromTab(tabId);
        } catch (e) {
            console.error('[Sandbox] Auto-import on new investigation failed:', e);
            setStatus('Import failed');
            setTimeout(() => setStatus(''), 2000);
            return;
        }
        await onAddAllAnalyzed();
    }

    // Send 'getExtractedEntities' to a tab and merge the result into the active
    // investigation's Raw Materials, then reload. Throws on failure so callers
    // can decide how to surface the error.
    async function importEntitiesFromTab(tabId) {
        console.debug(`[Sandbox] Sending 'getExtractedEntities' action to tabId: ${tabId}`);
        const resp = await browser.tabs.sendMessage(tabId, { action: 'getExtractedEntities' });
        console.debug(`[Sandbox] Received response from tabId ${tabId}:`, resp);

        const entitiesPayload = resp?.entities || {};
        console.debug(`[Sandbox] Sending 'importEntitiesToInvestigation' to background script with entities:`, entitiesPayload);

        await SbStore.importEntitiesToInvestigation({
            investigationId: activeId,
            entities: entitiesPayload
        });
        console.debug(`[Sandbox] Import background task completed successfully. Reloading view.`);
        await reload();
    }

    async function onImportPage() {
        if (!activeId) {
            console.warn('[Sandbox] Import aborted: No active investigation selected.');
            return showToast('Select or create an investigation first.', 'warning');
        }

        // Point 7: use selected tab from dropdown
        const tabId = importTabSelect ? parseInt(importTabSelect.value, 10) : null;
        console.debug(`[Sandbox] onImportPage triggered. Target tab ID: ${tabId}, Active Inv ID: ${activeId}`);

        if (!tabId || isNaN(tabId)) {
            console.warn('[Sandbox] Import aborted: Invalid tab ID selected from dropdown.');
            return showToast('Select a tab to import from.', 'warning');
        }

        setStatus('Importing…');
        try {
            await importEntitiesFromTab(tabId);
        } catch (e) {
            console.error('[Sandbox] Import failed with exception:', e);
            setStatus('Import failed');
            setTimeout(() => setStatus(''), 2000);
            return;
        }
        setStatus('Imported ✓');
        setTimeout(() => setStatus(''), 2000);
    }

    async function populateTabDropdown() {
        if (!importTabSelect) return;
        try {
            const tabs = await browser.tabs.query({ currentWindow: true });
            const prev = importTabSelect.value;
            importTabSelect.innerHTML = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '— select a tab —';
            importTabSelect.appendChild(defaultOpt);

            const sandboxUrl = browser.runtime.getURL('html/sandbox.html');
            tabs.forEach(tab => {
                if (tab.url && tab.url.startsWith(sandboxUrl)) return;
                const opt = document.createElement('option');
                opt.value = tab.id;
                opt.textContent = tab.title || tab.url || `Tab ${tab.id}`;
                if (String(tab.id) === prev) opt.selected = true;
                importTabSelect.appendChild(opt);
            });
        } catch (e) {
            console.warn('[Sandbox] Failed to query tabs', e);
        }
    }

    async function onRename() {
        const inv = activeInv();
        if (!inv) return;
        const name = await showTextPrompt('New name:', inv.name);
        if (name && name !== inv.name) {
            inv.name = name;
            await persistInv(inv);
            await reload();
        }
    }

    async function onDelete() {
        const inv = activeInv();
        if (!inv) return;
        if (confirm(`Delete "${inv.name}"?`)) {
            await SbStore.deleteInvestigation(inv.id);
            await reload();
        }
    }

    async function onExport() {
        const inv = activeInv();
        if (!inv) return showToast('Select an investigation to export.', 'warning');

        try {
            const dataStr = JSON.stringify(inv, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `fishbowl_investigation_${inv.name || inv.id}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('[Sandbox] Export failed', e);
            showToast('Failed to export investigation.', 'error');
        }
    }

    async function onCopyJson() {
        const inv = activeInv();
        if (!inv) return showToast('Select an investigation to copy.', 'warning');

        try {
            const workspaceData = {
                workspaceEntities: inv.workspaceEntities || [],
                enrichmentBlocks: inv.enrichmentBlocks || [],
                links: inv.links || []
            };
            const dataStr = JSON.stringify(workspaceData, null, 2);
            await navigator.clipboard.writeText(dataStr);
            setStatus('JSON copied ✓');
            setTimeout(() => setStatus(''), 2000);
        } catch (e) {
            console.error('[Sandbox] Copy JSON failed', e);
            setStatus('Copy failed');
            setTimeout(() => setStatus(''), 2000);
        }
    }

    async function onImportJson(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const inv = JSON.parse(text);

            if (!inv || !inv.id || !inv.entities) {
                showToast('Invalid investigation JSON file.', 'error');
                return;
            }

            // Always create as a new investigation with a new ID to avoid overwriting
            inv.id = 'inv_' + Date.now();
            inv.name = `${inv.name || 'Imported'} (Imported)`;
            inv.updatedAt = Date.now();

            await SbStore.saveInvestigation(inv);
            await reload();
            await setActive(inv.id);

            setStatus('Investigation imported ✓');
            setTimeout(() => setStatus(''), 2000);
        } catch (err) {
            console.error('[Sandbox] Import JSON failed', err);
            showToast('Failed to parse the JSON file.', 'error');
        } finally {
            // Reset input so the same file can be selected again if needed
            e.target.value = '';
        }
    }

    // ── Layout Helpers ─────────────────────────────────────────────

    function buildAdjacency(inv, allEntities) {
        return SbLayout.buildAdjacency(inv, allEntities);
    }

    function buildClusters(allEntities, adj) {
        return SbLayout.buildClusters(allEntities, adj);
    }

    function getBlockSize(ent) {
        const blockEls = Array.from(document.querySelectorAll('.sb-workspace-block, .sb-block-enrichment'));
        const el = blockEls.find(b => b.dataset.workspaceId === ent.id || b.dataset.enrichmentId === ent.id);
        return { w: el ? el.offsetWidth : 250, h: el ? el.offsetHeight : 150 };
    }

    /**
     * Push overlapping blocks apart iteratively.
     * Uses actual block sizes when available, falls back to defaults.
     */
    function resolveOverlaps(allEntities) {
        SbLayout.resolveOverlaps(allEntities, getBlockSize);
    }

    async function finishArrange(inv) {
        const allEntities = [...(inv.workspaceEntities || []), ...(inv.enrichmentBlocks || [])];
        resolveOverlaps(allEntities);
        await persistInv(inv);
        render();
        if (window.SbViewport && SbViewport.resetView) {
            SbViewport.resetView();
        }
    }

    // ── Layout: Flow (left-to-right, cluster-aware) ──────────────

    async function arrangeFlow() {
        const inv = activeInv();
        if (!inv) return;

        const allEntities = [...(inv.workspaceEntities || []), ...(inv.enrichmentBlocks || [])];
        if (allEntities.length === 0) return;

        const adj = buildAdjacency(inv, allEntities);
        const clusters = buildClusters(allEntities, adj);

        const BLOCK_GAP = 30;
        const CLUSTER_GAP = 160;
        let currentY = 80;
        const maxWidth = Math.max(800, workspaceArea.clientWidth - 50);

        for (const cluster of clusters) {
            let currentX = 80;
            let rowMaxHeight = 0;
            let clusterMaxY = currentY;

            for (const ent of cluster) {
                const { w, h } = getBlockSize(ent);

                if (currentX + w > maxWidth && currentX > 80) {
                    currentX = 80;
                    currentY += rowMaxHeight + BLOCK_GAP;
                    rowMaxHeight = 0;
                }

                ent.x = currentX;
                ent.y = currentY;

                currentX += w + BLOCK_GAP;
                rowMaxHeight = Math.max(rowMaxHeight, h);
                clusterMaxY = Math.max(clusterMaxY, currentY + h);
            }

            currentY = clusterMaxY + CLUSTER_GAP;
        }

        await finishArrange(inv);
    }

    // ── Layout: Force-Directed ────────────────────────────────────

    async function arrangeForce() {
        const inv = activeInv();
        if (!inv) return;

        const allEntities = [...(inv.workspaceEntities || []), ...(inv.enrichmentBlocks || [])];
        if (allEntities.length === 0) return;

        const adj = buildAdjacency(inv, allEntities);

        // Initialize positions (use existing or random)
        const pos = new Map();
        allEntities.forEach(ent => {
            pos.set(ent.id, {
                x: ent.x || 400 + Math.random() * 600,
                y: ent.y || 300 + Math.random() * 400,
                vx: 0, vy: 0
            });
        });

        const ITERATIONS = 150;
        const REPULSION = 50000;
        const ATTRACTION = 0.005;
        const IDEAL_LENGTH = 250;
        const DAMPING = 0.85;
        const MIN_DIST = 50;

        for (let iter = 0; iter < ITERATIONS; iter++) {
            const temp = 1 - iter / ITERATIONS;

            // Repulsion between all pairs
            for (let i = 0; i < allEntities.length; i++) {
                for (let j = i + 1; j < allEntities.length; j++) {
                    const a = pos.get(allEntities[i].id);
                    const b = pos.get(allEntities[j].id);
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let dist = Math.sqrt(dx * dx + dy * dy) || MIN_DIST;
                    if (dist < MIN_DIST) dist = MIN_DIST;

                    const force = REPULSION / (dist * dist);
                    const fx = (dx / dist) * force * temp;
                    const fy = (dy / dist) * force * temp;

                    a.vx -= fx;
                    a.vy -= fy;
                    b.vx += fx;
                    b.vy += fy;
                }
            }

            // Attraction along edges
            for (const ent of allEntities) {
                const neighbors = adj.get(ent.id) || [];
                const a = pos.get(ent.id);
                for (const nId of neighbors) {
                    const b = pos.get(nId);
                    if (!b) continue;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = ATTRACTION * (dist - IDEAL_LENGTH) * temp;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    a.vx += fx;
                    a.vy += fy;
                }
            }

            // Apply velocities with damping
            for (const ent of allEntities) {
                const p = pos.get(ent.id);
                p.vx *= DAMPING;
                p.vy *= DAMPING;
                p.x += p.vx;
                p.y += p.vy;
            }
        }

        // Normalize to start at (80, 80)
        let minX = Infinity, minY = Infinity;
        for (const ent of allEntities) {
            const p = pos.get(ent.id);
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
        }
        for (const ent of allEntities) {
            const p = pos.get(ent.id);
            ent.x = Math.round(p.x - minX + 80);
            ent.y = Math.round(p.y - minY + 80);
        }

        await finishArrange(inv);
    }

    // ── Layout: Clustered Grid ────────────────────────────────────

    async function arrangeGrid() {
        const inv = activeInv();
        if (!inv) return;

        const allEntities = [...(inv.workspaceEntities || []), ...(inv.enrichmentBlocks || [])];
        if (allEntities.length === 0) return;

        const adj = buildAdjacency(inv, allEntities);
        const clusters = buildClusters(allEntities, adj);

        const CELL_W = 280;
        const CELL_H = 200;
        const CLUSTER_GAP = 120;
        let globalOffsetY = 80;

        for (const cluster of clusters) {
            const cols = Math.max(1, Math.ceil(Math.sqrt(cluster.length)));

            cluster.forEach((ent, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                ent.x = 80 + col * CELL_W;
                ent.y = globalOffsetY + row * CELL_H;
            });

            const rows = Math.ceil(cluster.length / cols);
            globalOffsetY += rows * CELL_H + CLUSTER_GAP;
        }

        await finishArrange(inv);
    }

    async function onClearAll() {
        const inv = activeInv();
        if (!inv) return;

        if (!confirm('Are you sure you want to clear all blocks from the workspace?')) return;

        inv.workspaceEntities = [];
        inv.enrichmentBlocks = [];
        inv.links = [];

        await persistInv(inv);
        render();
        if (window.SbViewport && SbViewport.resetView) {
            SbViewport.resetView();
        }
    }

    // ── Link Mode (point 9) ──────────────────────────────────────

    function enterLinkMode(fromId) {
        connectingFromId = fromId;
        document.body.classList.add('sb-link-mode');
        // Highlight source block
        const srcBlock = canvasInner.querySelector(`[data-workspace-id="${CSS.escape(fromId)}"]`);
        if (srcBlock) srcBlock.classList.add('sb-link-source');
        setStatus('Click another block to connect…');
    }

    function exitLinkMode() {
        connectingFromId = null;
        document.body.classList.remove('sb-link-mode');
        canvasInner.querySelectorAll('.sb-link-source').forEach(el => el.classList.remove('sb-link-source'));
        setStatus('');
    }

    // ── Placement Mode (ghost block for '+' derived entity) ──────

    function enterPlacementMode(type, value) {
        // Create ghost preview block
        const ghost = document.createElement('div');
        ghost.className = `sb-block sb-type-${type} sb-workspace-block sb-ghost-block`;
        ghost.style.pointerEvents = 'none';

        const ghostHeader = document.createElement('div');
        ghostHeader.className = 'sb-block-header';
        const ghostTitle = document.createElement('div');
        ghostTitle.className = 'sb-block-title';
        ghostTitle.textContent = value;
        ghostHeader.appendChild(ghostTitle);
        ghost.appendChild(ghostHeader);

        const ghostBody = document.createElement('div');
        ghostBody.className = 'sb-block-body';
        ghostBody.textContent = type;
        ghost.appendChild(ghostBody);

        canvasInner.appendChild(ghost);
        setStatus('Click on canvas to place block, or press Escape to cancel');

        function onMove(e) {
            const coords = SbViewport.screenToCanvas(e.clientX, e.clientY);
            ghost.style.left = `${coords.x - 130}px`;
            ghost.style.top = `${coords.y - 40}px`;
        }

        function onPlace(e) {
            // Don't place on existing blocks
            if (e.target.closest('.sb-block') && !e.target.closest('.sb-ghost-block')) return;

            const coords = SbViewport.screenToCanvas(e.clientX, e.clientY);
            const x = coords.x - 130;
            const y = coords.y - 40;

            cleanup();
            placeEntity(type, value, x, y);
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                cleanup();
            }
        }

        function cleanup() {
            ghost.remove();
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('click', onPlace);
            document.removeEventListener('keydown', onKey);
            setStatus('');
        }

        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('click', onPlace);
        document.addEventListener('keydown', onKey);
    }

    async function placeEntity(type, value, x, y) {
        const resp = await SbStore.addEntityToWorkspace({
            type, value, x, y
        });
        if (!resp?.success || !resp.workspaceId) return;

        await reload();
        const freshInv = activeInv();
        if (!freshInv) return;

        if (linkEntityToEnrichmentBlocks(freshInv, type, value, resp.workspaceId)) {
            await persistInv(freshInv);
            await reload();
        }
    }

    async function onCanvasBlockClick(e) {
        if (!connectingFromId) return;
        const block = e.target.closest('.sb-block');
        if (!block) return;

        const targetId = block.dataset.workspaceId || block.dataset.enrichmentId;
        if (!targetId || targetId === connectingFromId) return;

        const inv = activeInv();
        if (!inv) { exitLinkMode(); return; }
        if (!inv.links) inv.links = [];

        const key = `${connectingFromId} → ${targetId}`;
        const existingLink = inv.links.find(l => l.key === key);

        if (existingLink) {
            // Link exists - prompt to update or delete
            const newLabel = await showTextPrompt('Update link label (leave empty to delete link):', existingLink.label || '');
            if (newLabel === null) {
                // Cancelled
                exitLinkMode();
                return;
            }
            if (newLabel === '') {
                // Delete link
                inv.links = inv.links.filter(l => l.key !== key);
                SbLinks.removeLink(connectingFromId, targetId);
            } else {
                // Update label
                existingLink.label = newLabel;
                SbLinks.updateLink(connectingFromId, targetId, newLabel);
            }
        } else {
            const label = await showTextPrompt('Link label (optional):', '') || '';
            inv.links.push({
                key,
                from: { blockId: connectingFromId },
                to: { blockId: targetId },
                label
            });
            SbLinks.addLink(connectingFromId, targetId, label);
        }

        persistInv(inv);
        exitLinkMode();
    }

    // ── Value filter pills ────────────────────────────────────────

    function addValueFilter(raw) {
        const value = (raw || '').trim();
        if (!value) return;
        if (valueFilters.some(v => v.toLowerCase() === value.toLowerCase())) {
            if (valueSearch) valueSearch.value = '';
            return;
        }
        valueFilters.push(value);
        if (valueSearch) valueSearch.value = '';
        renderValuePills();
        SbEntityBlocks.applyValueFilter(canvasInner, activeInv(), valueFilters);
    }

    function renderValuePills() {
        if (!valuePills) return;
        valuePills.innerHTML = '';
        valueFilters.forEach((value, idx) => {
            const pill = document.createElement('span');
            pill.className = 'sb-value-pill';
            pill.title = 'Remove';
            pill.setAttribute('role', 'button');
            pill.appendChild(document.createTextNode(value));

            // Clicking anywhere on the pill (including the × button, which bubbles
            // up to this handler) removes the filter.
            pill.addEventListener('click', () => {
                valueFilters.splice(idx, 1);
                renderValuePills();
                SbEntityBlocks.applyValueFilter(canvasInner, activeInv(), valueFilters);
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = '×';
            removeBtn.title = 'Remove';
            removeBtn.setAttribute('aria-label', `Remove ${value}`);

            pill.appendChild(removeBtn);
            valuePills.appendChild(pill);
        });
    }

    // ── Render ────────────────────────────────────────────────────

    function renderSidebarOnly() {
        const inv = activeInv();
        if (!inv) return;
        SbEntityBlocks.renderSidebar(sidebarContent, inv.entities, sidebarSearchTerm, handleSidebarDoubleClick);
    }

    function render() {
        updatePicker();

        const inv = activeInv();
        const hasEntities = inv && Object.keys(inv.entities || {}).some(k => inv.entities[k] && inv.entities[k].length > 0);
        const hasWorkspace = inv && (inv.workspaceEntities || []).length > 0;

        // Overlay shows whenever the canvas has no blocks (even if the sidebar has entities)
        emptyState.style.display = hasWorkspace ? 'none' : '';
        if (!hasWorkspace) {
            const showAdd = hasEntities;
            if (emptyTextNone) emptyTextNone.style.display = showAdd ? 'none' : '';
            if (emptyTextBlocks) emptyTextBlocks.style.display = showAdd ? '' : 'none';
            if (emptyAddBtn) emptyAddBtn.style.display = showAdd ? '' : 'none';
        }

        if (!hasEntities && !hasWorkspace) {
            sidebarContent.innerHTML = '';
            Array.from(canvasInner.children).forEach(el => (!el.matches('svg') && el.remove()));
            return;
        }

        // Render Sidebar with search filter
        SbEntityBlocks.renderSidebar(sidebarContent, inv.entities || {}, sidebarSearchTerm, handleSidebarDoubleClick);

        // Callbacks for workspace entities
        const callbacks = makeCallbacks(inv);

        // Render Workspace Grid (standalone blocks)
        SbEntityBlocks.renderWorkspaceEntities(canvasInner, inv, callbacks);

        // Render Enrichment blocks linked to workspace
        const onLookupDerived = (type, val, btn) => SbOperations.lookup(type, val, btn, () => { });
        const onAddDerivedEntity = (type, value, _enrichmentBlockId) => {
            enterPlacementMode(type, value);
        };
        const onRetryLookup = (type, val, serviceId, btn) => SbOperations.retryLookup(type, val, serviceId, btn, () => { });
        SbEntityBlocks.renderEnrichmentBlocks(canvasInner, inv, onLookupDerived, onAddDerivedEntity, hideUnknownBlocks, hideErrorBlocks, onRetryLookup);

        // Refresh value-search autocomplete and re-apply the highlight (survives re-renders)
        if (valueOptions) {
            valueOptions.innerHTML = '';
            SbEntityBlocks.collectValueOptions(inv).forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                valueOptions.appendChild(opt);
            });
        }
        renderValuePills();
        SbEntityBlocks.applyValueFilter(canvasInner, inv, valueFilters);

        // Enable moving anything on the canvas
        SbDrag.enableDrag(canvasInner, (updates) => {
            if (!Array.isArray(updates)) return; // safeguard

            let changed = false;
            updates.forEach(u => {
                let we = (inv.workspaceEntities || []).find(w => w.id === u.id);
                if (we) {
                    we.x = u.x; we.y = u.y;
                    changed = true;
                } else {
                    let eb = (inv.enrichmentBlocks || []).find(b => b.id === u.id);
                    if (eb) {
                        eb.x = u.x; eb.y = u.y;
                        changed = true;
                    }
                }
            });

            if (changed) persistInv(inv);
        });

        SbLinks.setLinks(inv.links || []);
        SbLinks.render();

        // Update minimap after render
        SbViewport.renderMinimap();
    }

    function makeCallbacks(inv) {
        return {
            onRemoveWorkspace: async (workspaceId) => {
                inv.workspaceEntities = (inv.workspaceEntities || []).filter(w => w.id !== workspaceId);

                inv.links = (inv.links || []).filter(l =>
                    !(l.from.blockId === workspaceId) && !(l.to.blockId === workspaceId)
                );

                const orphanedEnrichments = (inv.enrichmentBlocks || []).filter(b => b.parentId === workspaceId);
                const orphanedIds = orphanedEnrichments.map(b => b.id);

                inv.enrichmentBlocks = (inv.enrichmentBlocks || []).filter(b => b.parentId !== workspaceId);
                inv.links = (inv.links || []).filter(l => !orphanedIds.includes(l.from.blockId) && !orphanedIds.includes(l.to.blockId));

                await persistInv(inv);
                render();
            },

            onLookup: (type, val, card, btn) => {
                SbOperations.lookup(type, val, btn, () => { });
            },

            onCopy: (val, btn) => {
                SbOperations.copy(val);
                setStatus('Copied!');

                if (btn) {
                    const originalWidth = btn.offsetWidth;
                    const originalHTML = btn.innerHTML;

                    btn.style.width = `${originalWidth}px`;
                    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    btn.classList.add('sb-op-btn-success');

                    setTimeout(() => {
                        btn.innerHTML = originalHTML;
                        btn.style.width = '';
                        btn.classList.remove('sb-op-btn-success');
                    }, 1000);
                }

                setTimeout(() => setStatus(''), 1000);
            },

            // Point 6: note feature
            onNote: (type, val, cardBody) => {
                SbOperations.editNote(type, val, cardBody, async (t, v, noteText) => {
                    const typeList = inv.entities[t] || [];
                    const entity = typeList.find(e =>
                        (e.value || e.ip || e.domain || e.number || e.eventId || e.sid || e.file || '') === v
                    );
                    if (entity) {
                        entity.notes = noteText;
                        await persistInv(inv);
                    }
                });
            },

            // Point 9: custom link
            onConnect: (workspaceId, _block) => {
                if (connectingFromId) {
                    exitLinkMode();
                } else {
                    enterLinkMode(workspaceId);
                }
            },

            // Disconnect Dropdown Callbacks
            onGetConnections: (workspaceId) => {
                if (!inv.links) return [];
                return inv.links.filter(l =>
                    l.from.blockId === workspaceId || l.to.blockId === workspaceId
                ).map(l => {
                    const otherId = l.from.blockId === workspaceId ? l.to.blockId : l.from.blockId;
                    const label = l.label ? ` (${l.label})` : '';
                    return {
                        key: l.key,
                        from: l.from.blockId,
                        to: l.to.blockId,
                        label: `${otherId}${label}`
                    };
                });
            },

            onRemoveConnection: async (linkKey, fromId, toId) => {
                SbLinks.removeLink(fromId, toId);
                inv.links = inv.links.filter(l => l.key !== linkKey);
                await persistInv(inv);
                render();
            }
        };
    }

    // ── Live Results Update ───────────────────────────────────────

    // NOTE: keep this listener synchronous (NOT async). An async callback always
    // returns a Promise, which the messaging layer treats as "I will send the
    // response", so this page would reply (with undefined) to EVERY runtime
    // message - including proxyAnalyzePage - racing and clobbering the
    // background's real reply whenever the sandbox is open. We never send a
    // response here, so run async work in a fire-and-forget IIFE and return
    // undefined synchronously to leave the response channel to the background.
    browser.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'allServicesComplete') {
            (async () => {
                // Patch the investigation with analysis results in the background
                try {
                    await SbStore.patchInvestigationResults({
                        entityType: msg.entityType,
                        value: msg.value,
                        results: msg.results,
                        worstReputation: msg.worstReputation
                    });
                } catch (e) {
                    console.warn('[Sandbox] Failed to patch investigation results', e);
                }
                await reload();
            })();
            return;
        }

        if (msg.action === 'updateVerdict') {
            // Single-service result arrived - update sidebar verdict dot in-place
            const inv = activeInv();
            if (!inv) return;
            const typeList = inv.entities[msg.entityType] || [];
            const entity = typeList.find(e =>
                (e.value || e.ip || e.domain || e.number || e.eventId || e.sid || e.file || '') === msg.value
            );
            if (entity) {
                // Keep the worst verdict: a single-service progress update must not
                // downgrade a more-severe verdict already attached from another service.
                // Legitimate downgrades are recomputed by allServicesComplete (which
                // merges and replaces that service's result).
                const priority = (window.FishBowlConstants?.VERDICT_PRIORITY) || ['malicious', 'suspicious', 'neutral', 'benign', 'unknown'];
                const rank = (val) => { const i = priority.indexOf((val || '').toString().toLowerCase()); return i < 0 ? Infinity : i; };
                const incoming = msg.verdict;
                if (incoming && rank(incoming) <= rank(entity.verdict)) {
                    entity.verdict = incoming;
                }
            }
            // Light re-render of sidebar only (don't wipe canvas mid-analysis)
            renderSidebarOnly();
        }
    });

    function updatePicker() {
        invSelect.innerHTML = '';
        const ids = Object.keys(investigations);
        if (ids.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '— no investigations —';
            invSelect.appendChild(opt);
            return;
        }
        ids.forEach(id => {
            const inv = investigations[id];
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = inv.name || id;
            opt.selected = id === activeId;
            invSelect.appendChild(opt);
        });
    }

    function setStatus(msg) {
        if (statusEl) statusEl.textContent = msg;
    }

    document.addEventListener('DOMContentLoaded', init);
})();
