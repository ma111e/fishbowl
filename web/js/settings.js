(function (root) {
    'use strict';

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function mergeDeep(base, override) {
        const out = clone(base);
        if (!isPlainObject(override)) return out;

        Object.entries(override).forEach(([key, value]) => {
            if (isPlainObject(value) && isPlainObject(out[key])) {
                out[key] = mergeDeep(out[key], value);
                return;
            }
            if (value !== undefined) {
                out[key] = clone(value);
            }
        });

        return out;
    }

    function normalize(stored, domainOverride) {
        const defaults = root.FishBowlConfig.DEFAULT_SETTINGS;
        const globalSettings = mergeDeep(defaults, stored || {});
        const merged = mergeDeep(globalSettings, domainOverride || {});
        root.FishBowlConfig.validateSettings(merged);
        return merged;
    }

    async function loadGlobal(storageApi) {
        const result = await storageApi.local.get(['settings']);
        const normalized = normalize(result?.settings || {});
        await storageApi.local.set({ settings: normalized });
        return normalized;
    }

    async function loadForHost(storageApi, host) {
        const hostname = (host || '').toString().trim().toLowerCase();
        const domainKey = root.FishBowlConsts.domainSettingsKeyForHost(hostname);
        const keys = domainKey ? ['settings', domainKey] : ['settings'];
        const result = await storageApi.local.get(keys);
        const globalSettings = normalize(result?.settings || {});
        await storageApi.local.set({ settings: globalSettings });

        return {
            domainKey,
            settings: normalize(globalSettings, domainKey ? (result?.[domainKey] || {}) : {})
        };
    }

    function isHostAllowed(settings, host) {
        if (!settings.useDomainWhitelist || !Array.isArray(settings.domainWhitelist) || settings.domainWhitelist.length === 0) {
            return true;
        }

        const currentHost = (host || '').toString().trim().toLowerCase();
        if (!currentHost) return false;

        return settings.domainWhitelist
            .map(d => (d || '').toString().trim().toLowerCase())
            .filter(Boolean)
            .some(domain => currentHost === domain || currentHost.endsWith(`.${domain}`));
    }

    root.FishBowlSettings = {
        isHostAllowed,
        loadForHost,
        loadGlobal,
        normalize
    };
})(typeof window !== 'undefined' ? window : globalThis);
