(function () {
    globalThis.FishBowlBgHandlers = globalThis.FishBowlBgHandlers || {};

    FishBowlBgHandlers.handleAnalyzeReputationSingle = async function handleAnalyzeReputationSingle(browserApi, request, sendResponse, deps) {
        const entityType = (request.entityType || '').toString().trim().toLowerCase();
        const value = (request.value || '').toString().trim();
        const serviceId = (request.serviceId || '').toString().trim();

        if (!entityType) {
            sendResponse({ success: false, error: 'missing_entity_type' });
            return true;
        }
        if (!value) {
            sendResponse({ success: false, error: 'missing_value' });
            return true;
        }
        if (!serviceId) {
            sendResponse({ success: false, error: 'missing_service_id' });
            return true;
        }

        const analysisKey = `${entityType}:${value}`;
        const singleKey = `${analysisKey}:${serviceId}`;

        if (deps.inFlightReputationAnalyses.has(singleKey)) {
            sendResponse({ success: true, skipped: true });
            return true;
        }

        deps.inFlightReputationAnalyses.add(singleKey);

        FishBowlBroadcast.broadcastToActiveTabs(browserApi.tabs, {
            action: 'addAnalysisIndicators',
            entityType,
            value,
            expectedCount: 1
        }).catch(() => {});

        const safetyMs = globalThis.FishBowlConstants?.TIMING.ANALYSIS_SAFETY_TIMEOUT_MS ?? 90_000;
        let safetyTimer;
        const safetyPromise = new Promise((resolve) => {
            safetyTimer = setTimeout(() => resolve('safety_timeout'), safetyMs);
        });
        try {
            const outcome = await Promise.race([
                deps.startReputationAnalysis(entityType, value, serviceId).then(() => 'done'),
                safetyPromise
            ]);
            if (outcome === 'safety_timeout') {
                console.warn(`[FB:Background] Single reputation analysis safety-timeout for ${singleKey}`);
            }
        } catch (e) {
            console.error('[FB:Background] Failed to start single reputation analysis', e);
        } finally {
            clearTimeout(safetyTimer);
            deps.inFlightReputationAnalyses.delete(singleKey);
        }

        sendResponse({ success: true });
        return true;
    };
})();
