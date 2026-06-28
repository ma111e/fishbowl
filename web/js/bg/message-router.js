(function () {
    globalThis.FishBowlBgMessageRouter = globalThis.FishBowlBgMessageRouter || {};

    FishBowlBgMessageRouter.registerEarlyListener = function registerEarlyListener(runtimeApi, initializeFn) {
        globalThis.__fishbowlBgInitPromise = globalThis.__fishbowlBgInitPromise || null;
        globalThis.__fishbowlBgMessageListener = globalThis.__fishbowlBgMessageListener || null;
        globalThis.__fishbowlBgEarlyListenerRegistered = globalThis.__fishbowlBgEarlyListenerRegistered || false;

        if (globalThis.__fishbowlBgEarlyListenerRegistered) {
            return;
        }

        globalThis.__fishbowlBgEarlyListenerRegistered = true;

        runtimeApi.onMessage.addListener((request, sender, sendResponse) => {
            const run = async () => {
                if (!globalThis.__fishbowlBgInitPromise) {
                    globalThis.__fishbowlBgInitPromise = initializeFn();
                }

                await globalThis.__fishbowlBgInitPromise;

                if (typeof globalThis.__fishbowlBgMessageListener === 'function') {
                    return await globalThis.__fishbowlBgMessageListener(request, sender, sendResponse);
                }

                sendResponse({ success: false, error: 'Background not ready' });
                return true;
            };

            run().catch((e) => {
                console.error('[FB:Background] Early listener failed:', e);
                try {
                    sendResponse({ success: false, error: e?.message || String(e) });
                } catch (err) {
                    console.error('[FB:Background] Failed to send error response from early listener:', err);
                }
            });

            return true;
        });
    };
})();
