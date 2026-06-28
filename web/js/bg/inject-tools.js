(function () {
    globalThis.FishBowlBgInjectTools = globalThis.FishBowlBgInjectTools || {};

    FishBowlBgInjectTools.injectFileWhenHttpReady = function injectFileWhenHttpReady(browserApi, tabId, filePath, opts) {
        const maxAttempts = Number.isFinite(opts?.maxAttempts) ? opts.maxAttempts : 20;
        const intervalMs = Number.isFinite(opts?.intervalMs) ? opts.intervalMs : 250;
        const label = (opts && typeof opts.label === 'string') ? opts.label : '';

        let attempt = 0;

        const tryInject = () => {
            attempt += 1;

            return browserApi.tabs.get(tabId).then((freshTab) => {
                const url = (freshTab && typeof freshTab.url === 'string') ? freshTab.url : '';
                const injectable = url.startsWith('http://') || url.startsWith('https://');

                if (!injectable) {
                    if (attempt >= maxAttempts) {
                        console.warn(`[FB:Background] Skipping injection${label ? ' (' + label + ')' : ''} for tab ${tabId}; not an injectable URL:`, url);
                        return;
                    }
                    setTimeout(tryInject, intervalMs);
                    return;
                }

                return browserApi.scripting.executeScript({
                    target: { tabId },
                    files: [filePath]
                }).then(() => {
                }).catch((e) => {
                    const msg = e?.message || String(e);
                    if (msg.includes('Missing host permission') && attempt < maxAttempts) {
                        setTimeout(tryInject, intervalMs);
                        return;
                    }
                    console.warn(`[FB:Background] Failed to inject ${filePath} into tab ${tabId}${label ? ' (' + label + ')' : ''}`, e);
                });
            }).catch((e) => {
                if (attempt < maxAttempts) {
                    setTimeout(tryInject, intervalMs);
                    return;
                }
                console.warn(`[FB:Background] Failed to read tab URL before injecting ${filePath} into tab ${tabId}${label ? ' (' + label + ')' : ''}`, e);
            });
        };

        tryInject();
    };
})();
