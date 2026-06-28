(function () {
    globalThis.FishBowlBgReputationServices = globalThis.FishBowlBgReputationServices || {};

    // Cached service capabilities (which services have a server-side API key).
    // Keys live only on the backend, so the extension asks /capabilities to choose
    // API mode vs scrape mode. Cached briefly to avoid a round-trip per analysis.
    let capsCache = null;
    let capsAt = 0;
    const CAPS_TTL_MS = 30000;

    async function getCapabilities() {
        const now = Date.now();
        if (capsCache && now - capsAt < CAPS_TTL_MS) return capsCache;
        try {
            const url = globalThis.FishBowlConfig?.CAPABILITIES_URL;
            capsCache = await globalThis.FishBowlNet.postJsonExpectJson(url, {});
            capsAt = now;
        } catch (e) {
            console.warn('[FB:Background] Failed to fetch capabilities:', e?.message || e);
            capsCache = capsCache || {};
        }
        return capsCache;
    }

    function normalizeEntityType(entityType) {
        const t = (entityType || '').toString().trim().toLowerCase();
        return t;
    }

    function resolveServiceEnabled(settings, entityType, serviceDef) {
        const svcId = (serviceDef?.id || '').toString();
        if (!svcId) return false;

        const t = normalizeEntityType(entityType);

        // New schema: settings.reputationServices[entityType][serviceId]
        const rep = settings?.reputationServices;
        const repMap = rep && typeof rep === 'object' ? rep[t] : null;
        if (repMap && typeof repMap === 'object' && Object.prototype.hasOwnProperty.call(repMap, svcId)) {
            return !!repMap[svcId];
        }

        return !!serviceDef?.defaultEnabled;
    }

    FishBowlBgReputationServices.getEnabledServicesCount = async function getEnabledServicesCount(storageApi, serviceDefs, entityType, _value) {
        try {
            const t = normalizeEntityType(entityType);
            if (!t) {
                console.warn('[FB:Background] Missing entityType for enabled services count');
                return 0;
            }

            const result = await storageApi.local.get(['settings']);
            const settings = result?.settings || {};

            const defsByType = (serviceDefs && typeof serviceDefs === 'object') ? serviceDefs : {};
            const defs = Array.isArray(defsByType[t]) ? defsByType[t] : [];

            const enabledCount = defs.filter((svc) => resolveServiceEnabled(settings, t, svc)).length;
            return enabledCount;
        } catch (e) {
            console.warn('[FB:Background] Failed to compute enabled services count for progress', e);
            return 0;
        }
    };

    /**
     * @param {Boolean} [includeAll=false] When true, return all service defs
     *   regardless of their enabled state (used for selective / picker-based analysis).
     */
    FishBowlBgReputationServices.getReputationServicesList = async function getReputationServicesList(storageApi, serviceDefs, entityType, value, valuePlaceholder, includeAll) {
        const t = normalizeEntityType(entityType);
        if (!t) {
            console.warn('[FB:Background] Missing entityType for services list');
            return [];
        }
        const v = (value || '').toString().trim();

        const result = await storageApi.local.get(['settings']);
        const settings = result?.settings || {};

        const defsByType = (serviceDefs && typeof serviceDefs === 'object') ? serviceDefs : {};
        const defs = Array.isArray(defsByType[t]) ? defsByType[t] : [];

        const caps = await getCapabilities();

        const all = defs.map((serviceDef) => {
            const svc = JSON.parse(JSON.stringify(serviceDef));
            // For services that support both API and scraping, use API mode only when
            // the backend reports a configured key for that service.
            if (svc.supportsApiMode) {
                svc.apiMode = !!caps[svc.id];
            }
            if (!svc.apiMode) {
                svc.url = (svc.urlTemplate || '').toString().replace(valuePlaceholder, v);
            }
            svc.enabled = resolveServiceEnabled(settings, t, svc);
            return svc;
        });

        if (includeAll) {
            return all;
        }

        return all.filter((svc) => svc.enabled);
    };
})();
