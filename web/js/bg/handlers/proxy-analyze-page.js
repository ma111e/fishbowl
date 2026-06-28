(function () {
    globalThis.FishBowlBgHandlers = globalThis.FishBowlBgHandlers || {};

    FishBowlBgHandlers.handleProxyAnalyzePage = async function handleProxyAnalyzePage(request, config) {
        try {
            const data = await FishBowlNet.postJsonExpectJson(config.EXTRACT_INDICATORS_FROM_DOM_URL, request.payload);
            return { ok: true, data };
        } catch (e) {
            console.error('[FB:Background] Proxy analysis request error:', e);
            return { ok: false, error: e?.message || String(e) };
        }
    };
})();
