(function () {
    globalThis.FishBowlBgHandlers = globalThis.FishBowlBgHandlers || {};

    FishBowlBgHandlers.handleDomExtracted = function handleDomExtracted(request, sendResponse, deps) {
        if (request.domContent) {
            if (request.value) {
                const entityType = (request.entityType || '').toString().trim().toLowerCase();
                if (!entityType) {
                    console.warn('[Background] Missing entityType in domExtracted message');
                } else {
                    deps.analyzeContent(entityType, request.value, request.source, request.domContent, request.serviceName);
                }
            } else {
                console.error('[Background] Unknown content type in domExtracted message:', request);
            }
        }

        sendResponse({ success: true });
        return true;
    };
})();
