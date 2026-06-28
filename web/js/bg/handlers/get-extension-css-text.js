(function () {
    globalThis.FishBowlBgHandlers = globalThis.FishBowlBgHandlers || {};

    const ALLOWED_CSS_PATHS = new Set([
        'styles/common.css',
        'styles/adaptive-colors.css',
        'styles/highlights.css',
        'styles/badges.css',
        'styles/modal.css',
        'styles/draggable-panels.css',
        'styles/activity-feed.css',
        'styles/region-selector.css'
    ]);

    const cssCacheByPath = new Map();

    FishBowlBgHandlers.handleGetExtensionCssText = async function handleGetExtensionCssText(browserApi, request) {
        const requestedPaths = Array.isArray(request?.paths) ? request.paths : [];
        const cssByPath = {};

        for (const rawPath of requestedPaths) {
            const path = (rawPath || '').toString().trim();
            if (!path || !ALLOWED_CSS_PATHS.has(path)) {
                continue;
            }

            if (cssCacheByPath.has(path)) {
                cssByPath[path] = cssCacheByPath.get(path) || '';
                continue;
            }

            const resourceUrl = browserApi.runtime.getURL(path);

            try {
                const response = await fetch(resourceUrl);
                if (!response.ok) {
                    console.warn('[Background] Failed to load extension CSS resource', path, response.status);
                    cssByPath[path] = '';
                    continue;
                }

                const cssText = await response.text();
                cssCacheByPath.set(path, cssText);
                cssByPath[path] = cssText;
            } catch (e) {
                console.warn('[Background] Failed to load extension CSS resource', path, e);
                cssByPath[path] = '';
            }
        }

        return {
            ok: true,
            cssByPath
        };
    };
})();
