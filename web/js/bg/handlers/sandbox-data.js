/**
 * FishBowl Security Extension - Background handler for Investigation Sandbox
 *
 * Handles:
 *   openSandbox         - open/focus the sandbox tab
 *   getInvestigations   - return all investigations from storage
 *   saveInvestigation   - create/update one investigation in storage
 *   deleteInvestigation - remove an investigation from storage
 *   setActiveInvestigation - set the active investigation ID
 *   importEntitiesToInvestigation - merge analysis entities into an investigation
 */
(function () {
    globalThis.FishBowlBgHandlers = globalThis.FishBowlBgHandlers || {};

    const STORAGE_KEY = 'fishbowl_investigations';
    const ACTIVE_KEY = 'fishbowl_active_investigation';

    /**
     * Extract derived entities from enrichment details.
     * Parses IPs, domains, ASNs, and hashes from string values.
     */
    function extractDerivedEntities(details, excludeValue) {
        const derived = [];
        const seen = new Set();

        function add(type, value) {
            if (value === excludeValue) return;
            const key = `${type}:${value}`;
            if (seen.has(key)) return;
            seen.add(key);
            derived.push({ type, value });
        }

        Object.entries(details).forEach(([_, v]) => {
            // Handle arrays (e.g. tags, detectedEngines)
            if (Array.isArray(v)) {
                v.forEach(item => {
                    if (typeof item === 'string') parseString(item);
                });
                return;
            }
            // Handle nested objects
            if (v && typeof v === 'object') {
                Object.values(v).forEach(sv => {
                    if (typeof sv === 'string') parseString(sv);
                });
                return;
            }
            if (typeof v === 'string' || typeof v === 'number') parseString(String(v));
        });

        function isValidIp(ip) {
            const parts = ip.split('.');
            return parts.length === 4 && parts.every(p => {
                const n = parseInt(p, 10);
                return n >= 0 && n <= 255 && String(n) === p;
            });
        }

        function parseString(str) {
            // IPs - reject malformed octets like 999.999.999.999
            (str.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []).forEach(ip => { if (isValidIp(ip)) add('ip', ip); });
            // Domains (exclude things starting with digits)
            (str.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi) || []).forEach(domain => {
                if (!domain.match(/^\d/)) add('domain', domain);
            });
            // ASN numbers (AS12345)
            (str.match(/\bAS\d+\b/gi) || []).forEach(asn => add('asn', asn.toUpperCase()));
            // SHA-256
            (str.match(/\b[a-f0-9]{64}\b/gi) || []).forEach(h => add('hash', h.toLowerCase()));
            // SHA-1
            (str.match(/\b[a-f0-9]{40}\b/gi) || []).forEach(h => add('hash', h.toLowerCase()));
            // MD5
            (str.match(/\b[a-f0-9]{32}\b/gi) || []).forEach(h => add('hash', h.toLowerCase()));
        }

        return derived;
    }

    async function readStorage(browserApi) {
        const result = await browserApi.storage.local.get([STORAGE_KEY, ACTIVE_KEY]);
        return {
            investigations: result[STORAGE_KEY] || {},
            activeId: result[ACTIVE_KEY] || null
        };
    }

    async function writeStorage(browserApi, investigations, activeId) {
        const data = { [STORAGE_KEY]: investigations };
        if (activeId !== undefined) data[ACTIVE_KEY] = activeId;
        await browserApi.storage.local.set(data);
    }

    /** Notify any open sandbox tabs that data changed */
    async function notifySandbox(browserApi) {
        try {
            const sandboxUrl = browserApi.runtime.getURL('html/sandbox.html');
            const tabs = await browserApi.tabs.query({});
            for (const tab of tabs) {
                if (tab.url && tab.url.startsWith(sandboxUrl)) {
                    browserApi.tabs.sendMessage(tab.id, { action: 'investigationUpdated' }).catch(() => { });
                }
            }
        } catch (e) {
            console.warn('[FB:SandboxData] Failed to notify sandbox tabs', e);
        }
    }

    FishBowlBgHandlers.handleOpenSandbox = function handleOpenSandbox(browserApi, _request, sendResponse) {
        const sandboxUrl = browserApi.runtime.getURL('html/sandbox.html');
        browserApi.tabs.query({}).then((tabs) => {
            const existing = (tabs || []).find(t => t.url && t.url.startsWith(sandboxUrl));
            if (existing) {
                browserApi.tabs.update(existing.id, { active: true });
                browserApi.windows.update(existing.windowId, { focused: true });
            } else {
                browserApi.tabs.create({ url: sandboxUrl });
            }
            sendResponse({ success: true });
        });
        return true;
    };

    FishBowlBgHandlers.handleGetInvestigations = async function handleGetInvestigations(browserApi, _request, sendResponse) {
        try {
            const { investigations, activeId } = await readStorage(browserApi);
            sendResponse({ success: true, investigations, activeId });
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
        return true;
    };

    FishBowlBgHandlers.handleSaveInvestigation = async function handleSaveInvestigation(browserApi, request, sendResponse) {
        try {
            const inv = request.investigation;
            if (!inv || !inv.id) { sendResponse({ success: false, error: 'missing_id' }); return true; }
            const { investigations, activeId } = await readStorage(browserApi);
            investigations[inv.id] = { ...inv, updatedAt: Date.now() };
            await writeStorage(browserApi, investigations, activeId);
            await notifySandbox(browserApi);
            sendResponse({ success: true });
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
        return true;
    };

    FishBowlBgHandlers.handleDeleteInvestigation = async function handleDeleteInvestigation(browserApi, request, sendResponse) {
        try {
            const { investigations, activeId } = await readStorage(browserApi);
            delete investigations[request.id];
            const newActiveId = (activeId === request.id)
                ? (Object.keys(investigations)[0] || null)
                : activeId;
            await writeStorage(browserApi, investigations, newActiveId);
            await notifySandbox(browserApi);
            sendResponse({ success: true, activeId: newActiveId });
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
        return true;
    };

    FishBowlBgHandlers.handleSetActiveInvestigation = async function handleSetActiveInvestigation(browserApi, request, sendResponse) {
        try {
            const { investigations } = await readStorage(browserApi);
            await writeStorage(browserApi, investigations, request.id);
            await notifySandbox(browserApi);
            sendResponse({ success: true });
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
        return true;
    };

    FishBowlBgHandlers.handleImportEntitiesToInvestigation = async function handleImportEntitiesToInvestigation(browserApi, request, sendResponse) {
        try {
            const { investigations, activeId } = await readStorage(browserApi);

            // investigationId semantics:
            //   explicit string → use that investigation
            //   undefined       → use active investigation
            //   null            → force-create a new investigation
            let targetId;
            if (request.investigationId === null) {
                targetId = null;
            } else if (request.investigationId !== undefined) {
                targetId = request.investigationId;
            } else {
                targetId = activeId;
            }
            if (!targetId || !investigations[targetId]) {
                targetId = `inv_${Date.now().toString(36)}`;
                investigations[targetId] = {
                    id: targetId,
                    name: request.name || `Investigation ${new Date().toLocaleString()}`,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    entities: { ip: [], domain: [], hash: [], file: [], event: [], sid: [], asn: [] },
                    workspaceEntities: [],  // { id, type, value, x, y }
                    enrichmentBlocks: [],   // { id, label, source, parentId, parentType, parentValue, details, verdict, derivedEntities }
                    links: []
                };
            }

            const inv = investigations[targetId];
            if (!inv.enrichmentBlocks) inv.enrichmentBlocks = [];
            if (!inv.workspaceEntities) inv.workspaceEntities = [];
            const incoming = request.entities || {};

            const allStorage = await browserApi.storage.local.get(null);
            const cachePrefix = 'fishbowl_cache_';
            const cacheExpiry = 60 * 60 * 1000;
            const now = Date.now();

            function getCachedResults(type, value) {
                const t = (type || '').toLowerCase();
                const vRaw = (value || '').toString().trim();
                const v = (t === 'domain' || t === 'hash' || t === 'file' || t === 'asn') ? vRaw.toLowerCase() : vRaw;
                const key = `${cachePrefix}reputation:${t}:${v}`;
                const item = allStorage[key];
                if (!item || !item.data) return null;
                if ((now - (item.timestamp || 0)) > cacheExpiry) return null;
                return item.data;
            }

            // Make sure an entity exists in Raw Materials (entities)
            function ensureEntity(type, val) {
                if (!Array.isArray(inv.entities[type])) inv.entities[type] = [];
                let existing = inv.entities[type].find(e => (e.value || e.ip || e.domain || e.number || e.eventId || e.sid || e.file || '') === val);
                if (!existing) {
                    existing = { type, value: val, results: [], notes: '', verdict: 'unknown' };
                    inv.entities[type].push(existing);
                }
                return existing;
            }

            // Add incoming entities to Raw Materials only.
            // The user drags them onto the canvas manually.
            for (const [type, items] of Object.entries(incoming)) {
                if (!Array.isArray(items) || items.length === 0) continue;
                for (const item of items) {
                    const val = item.value || item.ip || item.domain || item.number || item.eventId || item.sid || item.file || '';
                    if (!val) continue;

                    const entity = ensureEntity(type, val);

                    // Hydrate verdict from cache without spawning workspace blocks
                    const cached = getCachedResults(type, val);
                    if (cached) {
                        const cacheRoot = cached.results || cached;
                        const serviceResults = Object.entries(cacheRoot);
                        const verdicts = serviceResults.map(([, r]) => r.verdict || 'unknown');
                        const priority = globalThis.FishBowlConstants?.VERDICT_PRIORITY ?? ['malicious', 'suspicious', 'neutral', 'benign', 'unknown'];
                        entity.verdict = verdicts.reduce((worst, v) => priority.indexOf(v) < priority.indexOf(worst) ? v : worst, 'unknown');
                        entity.results = serviceResults.map(([id, r]) => ({ ...r, source: id }));
                    } else if (entity.verdict === 'unknown' && item.verdict && item.verdict !== 'unknown') {
                        // No cache hit: fall back to the verdict carried from the page so the
                        // entity still qualifies as "analyzed" for canvas auto-placement.
                        entity.verdict = item.verdict;
                    }
                }
            }

            // Mark the investigation so the sandbox auto-places analyzed entities on
            // the canvas once it loads (parity with the sandbox's New button).
            if (request.autoAddAnalyzed) {
                inv._pendingAutoAddAnalyzed = true;
            }

            inv.updatedAt = Date.now();
            await writeStorage(browserApi, investigations, targetId);
            await notifySandbox(browserApi);
            sendResponse({ success: true, investigationId: targetId });
        } catch (e) {
            console.error(`[FB:SandboxData] handleImportEntitiesToInvestigation failed:`, e);
            sendResponse({ success: false, error: e.message });
        }
        return true;
    };

    /**
     * Patch analysis results into the active investigation after allServicesComplete.
     * Creates/updates entity verdict, enrichment blocks, and links.
     */
    FishBowlBgHandlers.handlePatchInvestigationResults = async function handlePatchInvestigationResults(browserApi, request, sendResponse) {
        try {
            const { investigations, activeId } = await readStorage(browserApi);
            if (!activeId || !investigations[activeId]) {
                sendResponse({ success: false, error: 'No active investigation' });
                return true;
            }

            const inv = investigations[activeId];
            if (!inv.enrichmentBlocks) inv.enrichmentBlocks = [];
            if (!inv.workspaceEntities) inv.workspaceEntities = [];
            if (!inv.links) inv.links = [];

            const { entityType, value, results, worstReputation: _worstReputation } = request;
            if (!entityType || !value || !results) {
                sendResponse({ success: false, error: 'missing_params' });
                return true;
            }

            // Update entity verdict in raw materials.
            // Merge incoming results with existing ones so single-service
            // retries don't discard results from other services.
            if (Array.isArray(inv.entities[entityType])) {
                const entity = inv.entities[entityType].find(e =>
                    (e.value || e.ip || e.domain || e.number || e.eventId || e.sid || e.file || '') === value
                );
                if (entity) {
                    const existingBySource = {};
                    if (Array.isArray(entity.results)) {
                        entity.results.forEach(r => { if (r.source) existingBySource[r.source] = r; });
                    }
                    Object.entries(results).forEach(([id, r]) => {
                        existingBySource[id] = { ...r, source: id };
                    });
                    entity.results = Object.values(existingBySource);

                    // Recompute verdict from all merged results
                    const verdictPriority = globalThis.FishBowlConstants?.VERDICT_PRIORITY ?? ['malicious', 'suspicious', 'neutral', 'benign', 'unknown'];
                    let worst = 'unknown';
                    entity.results.forEach(r => {
                        const v = (r.verdict || 'unknown').toLowerCase();
                        if (verdictPriority.indexOf(v) >= 0 && verdictPriority.indexOf(v) < verdictPriority.indexOf(worst)) {
                            worst = v;
                        }
                    });
                    entity.verdict = worst;
                }
            }

            // Find the workspace entity for this analysed value
            const wid = `we_${entityType}_${value}`.replace(/[^a-zA-Z0-9_]/g, '_');
            let parentWe = inv.workspaceEntities.find(w => w.id === wid);

            // Create enrichment blocks for each service result if parent exists
            if (parentWe) {
                Object.entries(results).forEach(([serviceId, r]) => {
                    const blockId = `enrich_${entityType}_${value}_${serviceId}`.replace(/[^a-zA-Z0-9_]/g, '_');
                    if (inv.enrichmentBlocks.find(b => b.id === blockId)) {
                        // Update existing block
                        const existing = inv.enrichmentBlocks.find(b => b.id === blockId);
                        existing.verdict = r.verdict || 'unknown';
                        existing.details = r.details || {};
                        existing.error = r.error || null;

                        // Point 5: update derived entities as well
                        const updatedDerived = extractDerivedEntities(existing.details, value);
                        existing.derivedEntities = updatedDerived.slice(0, 10);

                        // Ensure link from parent workspace entity to existing block
                        const linkKey = `${parentWe.id} → ${blockId}`;
                        if (!inv.links.find(l => l.key === linkKey)) {
                            inv.links.push({ key: linkKey, from: { blockId: parentWe.id }, to: { blockId }, label: r.serviceName || serviceId });
                        }
                        return;
                    }

                    const details = r.details || {};

                    // Extract derived entities from details
                    const derivedEntities = extractDerivedEntities(details, value);
                    const cappedDerived = derivedEntities.slice(0, 10);

                    inv.enrichmentBlocks.push({
                        id: blockId,
                        label: r.serviceName || serviceId,
                        source: serviceId,
                        parentId: parentWe.id,
                        parentType: entityType,
                        parentValue: value,
                        verdict: r.verdict || 'unknown',
                        details,
                        error: r.error || null,
                        derivedEntities: cappedDerived,
                        x: parentWe.x + 320,
                        y: parentWe.y + (inv.enrichmentBlocks.filter(b => b.parentId === parentWe.id).length * 180)
                    });

                    // Link parent → enrichment
                    const linkKey = `${parentWe.id} → ${blockId}`;
                    if (!inv.links.find(l => l.key === linkKey)) {
                        inv.links.push({ key: linkKey, from: { blockId: parentWe.id }, to: { blockId }, label: r.serviceName || serviceId });
                    }
                });
            }

            inv.updatedAt = Date.now();
            await writeStorage(browserApi, investigations, activeId);
            await notifySandbox(browserApi);
            sendResponse({ success: true });
        } catch (e) {
            console.error('[FB:SandboxData] patchInvestigationResults failed', e);
            sendResponse({ success: false, error: e.message });
        }
        return true;
    };

    FishBowlBgHandlers.handleAddEntityToWorkspace = async function handleAddEntityToWorkspace(browserApi, request, sendResponse) {
        try {
            const { investigations, activeId } = await readStorage(browserApi);
            if (!activeId || !investigations[activeId]) {
                sendResponse({ success: false, error: 'No active investigation' });
                return true;
            }

            const inv = investigations[activeId];
            if (!inv.workspaceEntities) inv.workspaceEntities = [];
            if (!inv.enrichmentBlocks) inv.enrichmentBlocks = [];
            if (!inv.links) inv.links = [];

            const { type, value, x, y } = request;
            const wid = `we_${type}_${value}`.replace(/[^a-zA-Z0-9_]/g, '_');

            if (!inv.workspaceEntities.find(w => w.id === wid)) {
                inv.workspaceEntities.push({ id: wid, type, value, x, y });
            }

            // Hydrate from cache: create enrichment blocks if cached results exist
            const allStorage = await browserApi.storage.local.get(null);
            const cachePrefix = 'fishbowl_cache_';
            const cacheExpiry = 60 * 60 * 1000;
            const now = Date.now();

            const t = (type || '').toLowerCase();
            const vRaw = (value || '').toString().trim();
            const cacheV = (t === 'domain' || t === 'hash' || t === 'file' || t === 'asn') ? vRaw.toLowerCase() : vRaw;

            const cacheKey = `${cachePrefix}reputation:${t}:${cacheV}`;
            const cacheItem = allStorage[cacheKey];

            // Ensure entity exists in Raw Materials
            if (!inv.entities[t]) inv.entities[t] = [];
            let rawEntity = inv.entities[t].find(e => (e.value || '') === vRaw);
            if (!rawEntity) {
                rawEntity = { type: t, value: vRaw, results: [], notes: '', verdict: 'unknown' };
                inv.entities[t].push(rawEntity);
            }

            if (cacheItem && cacheItem.data && (now - (cacheItem.timestamp || 0)) <= cacheExpiry) {
                const cached = cacheItem.data;
                const cachedResults = cached.results || cached; // handle both new and old format
                const serviceResults = Object.entries(cachedResults);

                // Update entity verdict in raw materials
                const verdicts = serviceResults.map(([, r]) => r.verdict || 'unknown');
                const priority = globalThis.FishBowlConstants?.VERDICT_PRIORITY ?? ['malicious', 'suspicious', 'neutral', 'benign', 'unknown'];
                let worst = 'unknown';
                verdicts.forEach(v => {
                    if (priority.indexOf(v) < priority.indexOf(worst)) worst = v;
                });
                rawEntity.verdict = worst;
                rawEntity.results = serviceResults.map(([id, r]) => ({ ...r, source: id }));

                // Create or link enrichment blocks for each service result
                serviceResults.forEach(([serviceId, r]) => {
                    const blockId = `enrich_${type}_${value}_${serviceId}`.replace(/[^a-zA-Z0-9_]/g, '_');
                    if (inv.enrichmentBlocks.find(b => b.id === blockId)) {
                        // Block already exists - ensure link from parent workspace entity
                        const linkKey = `${wid} → ${blockId}`;
                        if (!inv.links.find(l => l.key === linkKey)) {
                            inv.links.push({ key: linkKey, from: { blockId: wid }, to: { blockId }, label: r.serviceName || serviceId });
                        }
                        return;
                    }

                    const details = r.details || {};
                    const derivedEntities = extractDerivedEntities(details, value);

                    const existingBlockCount = inv.enrichmentBlocks.filter(b => b.parentId === wid).length;

                    inv.enrichmentBlocks.push({
                        id: blockId,
                        label: r.serviceName || serviceId,
                        source: serviceId,
                        parentId: wid,
                        parentType: type,
                        parentValue: value,
                        verdict: r.verdict || 'unknown',
                        details,
                        error: r.error || null,
                        derivedEntities: derivedEntities.slice(0, 10),
                        x: (x || 100) + 320,
                        y: (y || 100) + existingBlockCount * 180
                    });

                    // Link parent → enrichment
                    const linkKey = `${wid} → ${blockId}`;
                    if (!inv.links.find(l => l.key === linkKey)) {
                        inv.links.push({ key: linkKey, from: { blockId: wid }, to: { blockId }, label: r.serviceName || serviceId });
                    }
                });
            }

            inv.updatedAt = Date.now();
            await writeStorage(browserApi, investigations, activeId);
            await notifySandbox(browserApi);
            sendResponse({ success: true, workspaceId: wid });
        } catch (e) {
            console.error('[FB:SandboxData] addEntityToWorkspace failed', e);
            sendResponse({ success: false, error: e.message });
        }
        return true;
    };
})();
