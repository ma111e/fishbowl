(function (root) {
    'use strict';

    function buildAnalysisHtml(doc = document) {
        try {
            const normalizedClone = doc.documentElement.cloneNode(true);
            root.FishBowlShadowDomTools.inlineOpenShadowDomIntoClone(normalizedClone, doc.documentElement);
            const normalizedHtml = normalizedClone.outerHTML;
            const parsedDoc = new DOMParser().parseFromString(normalizedHtml, 'text/html');
            const clone = parsedDoc.documentElement;

            try {
                if (root.FishBowlTinyMceInspectOverlay && typeof root.FishBowlTinyMceInspectOverlay === 'function') {
                    const overlay = new root.FishBowlTinyMceInspectOverlay();
                    const sources = overlay.collectIframeSources();
                    if (Array.isArray(sources) && sources.length) {
                        const container = clone.ownerDocument.createElement('div');
                        container.id = 'fishbowl-virtual-iframe-sources';
                        container.style.display = 'none';

                        for (const src of sources) {
                            const el = clone.ownerDocument.createElement('div');
                            if (src && typeof src.sourceId === 'string' && src.sourceId) {
                                el.setAttribute('data-fishbowl-source-id', src.sourceId);
                            }
                            el.setAttribute('data-fishbowl-source-kind', 'tinymce_iframe');
                            el.textContent = (src && typeof src.text === 'string') ? src.text : '';
                            container.appendChild(el);
                        }

                        const body = clone.querySelector('body');
                        if (body) {
                            body.appendChild(container);
                        }
                    }
                }
            } catch (e) {
                console.warn('[FishBowl HUD] Failed to inject iframe sources into analysis DOM clone', e);
            }

            const originalEditables = Array.from(doc.querySelectorAll('[contenteditable]'))
                .filter(el => {
                    const v = (el.getAttribute('contenteditable') || '').toLowerCase();
                    return v !== 'false';
                });
            const clonedEditables = Array.from(clone.querySelectorAll('[contenteditable]'))
                .filter(el => {
                    const v = (el.getAttribute('contenteditable') || '').toLowerCase();
                    return v !== 'false';
                });
            const edCount = Math.min(originalEditables.length, clonedEditables.length);
            for (let i = 0; i < edCount; i++) {
                try {
                    clonedEditables[i].innerHTML = originalEditables[i].innerHTML;
                } catch (e) {
                    console.warn('[FishBowl HUD] Failed to copy contenteditable HTML into analysis DOM clone', e);
                }
            }

            const originalTextareas = Array.from(doc.querySelectorAll('textarea'));
            const clonedTextareas = Array.from(clone.querySelectorAll('textarea'));
            const taCount = Math.min(originalTextareas.length, clonedTextareas.length);
            for (let i = 0; i < taCount; i++) {
                const v = (originalTextareas[i] && typeof originalTextareas[i].value === 'string') ? originalTextareas[i].value : '';
                clonedTextareas[i].textContent = v;
            }

            const originalInputs = Array.from(doc.querySelectorAll('input'));
            const clonedInputs = Array.from(clone.querySelectorAll('input'));
            const inCount = Math.min(originalInputs.length, clonedInputs.length);
            for (let i = 0; i < inCount; i++) {
                const orig = originalInputs[i];
                const cloned = clonedInputs[i];
                const type = ((orig && orig.type) ? orig.type : '').toLowerCase();
                if (type === 'password' || type === 'file' || type === 'hidden') {
                    continue;
                }
                if (orig && typeof orig.value === 'string') {
                    cloned.setAttribute('value', orig.value);
                }
            }

            return clone.outerHTML;
        } catch (e) {
            console.warn('Failed to serialize DOM with form values:', e);
            throw e;
        }
    }

    async function hydrateCachedResponse(response, cacheService, consts) {
        let hasCachedData = false;
        const clone = (obj) => JSON.parse(JSON.stringify(obj));
        const localResponse = {
            ...response,
            ipAddresses: response.ipAddresses ? [...response.ipAddresses] : [],
            asNumbers: response.asNumbers ? [...response.asNumbers] : [],
            domains: response.domains ? [...response.domains] : [],
            windowsEvents: response.windowsEvents ? [...response.windowsEvents] : [],
            sids: response.sids ? [...response.sids] : [],
            hashes: response.hashes ? [...response.hashes] : [],
            files: response.files ? [...response.files] : []
        };

        if (!cacheService) return localResponse;

        const hydrateCachedReputation = async (items, entityType, getValue, options = {}) => {
            if (!Array.isArray(items) || items.length === 0) return [];

            const out = [];
            for (const item of items) {
                const value = getValue(item);
                const cacheKey = consts.reputationCacheKey(entityType, value);
                const cachedData = await cacheService.getCache(cacheKey);

                if (cachedData) {
                    const next = {
                        ...clone(item),
                        cachedData: clone(cachedData)
                    };

                    if (options.overrideVerdictField) {
                        const cachedVerdict = cachedData.worstVerdict;
                        if (typeof cachedVerdict === 'string' && cachedVerdict.trim()) {
                            next[options.overrideVerdictField] = cachedVerdict;
                        }
                    }

                    out.push(next);
                    hasCachedData = true;
                    continue;
                }

                out.push(clone(item));
            }

            return out;
        };

        localResponse.ipAddresses = await hydrateCachedReputation(
            localResponse.ipAddresses,
            'ip',
            (addr) => addr.ip,
            { overrideVerdictField: 'verdict' }
        );
        localResponse.asNumbers = await hydrateCachedReputation(localResponse.asNumbers, 'asn', (asn) => asn.asn);
        localResponse.domains = await hydrateCachedReputation(
            localResponse.domains,
            'domain',
            (domain) => domain.domain,
            { overrideVerdictField: 'verdict' }
        );
        localResponse.hashes = await hydrateCachedReputation(localResponse.hashes, 'hash', (hash) => hash.value);
        localResponse.files = await hydrateCachedReputation(localResponse.files, 'file', (file) => file.file);

        if (hasCachedData) {
            console.debug('Enhanced response with cached data:', localResponse);
        }

        return localResponse;
    }

    root.FishBowlHudAnalysis = {
        buildAnalysisHtml,
        hydrateCachedResponse
    };
})(typeof window !== 'undefined' ? window : globalThis);
