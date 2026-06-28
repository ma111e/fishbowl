(function () {
    globalThis.FishBowlBgHandlers = globalThis.FishBowlBgHandlers || {};

    FishBowlBgHandlers.handleAnalyzeReputation = async function handleAnalyzeReputation(browserApi, request, sendResponse, deps) {
        const entityType = (request.entityType || '').toString().trim().toLowerCase();
        const value = (request.value || '').toString().trim();
        if (!entityType) {
            sendResponse({ success: false, error: 'missing_entity_type' });
            return true;
        }
        if (!value) {
            sendResponse({ success: false, error: 'missing_value' });
            return true;
        }

        const analysisKey = `${entityType}:${value}`;

        if (deps.inFlightReputationAnalyses.has(analysisKey)) {
            sendResponse({ success: true, skipped: true });
            return true;
        }

        deps.inFlightReputationAnalyses.add(analysisKey);

        const serviceIds = Array.isArray(request.serviceIds) ? request.serviceIds : null;

        const expectedCount = serviceIds
            ? serviceIds.length
            : await deps.getEnabledServicesCount(entityType, value);

        FishBowlBroadcast.broadcastToActiveTabs(browserApi.tabs, {
            action: 'addAnalysisIndicators',
            entityType,
            value,
            expectedCount
        }).catch(() => {});

        // Outer safety net: even if startReputationAnalysis hangs, drop the
        // in-flight key so the next request for the same entity isn't silently
        // skipped. The per-fetch and per-service timeouts inside the
        // coordinator should make this unreachable in practice.
        const safetyMs = globalThis.FishBowlConstants?.TIMING.ANALYSIS_SAFETY_TIMEOUT_MS ?? 90_000;
        let safetyTimer;
        const safetyPromise = new Promise((resolve) => {
            safetyTimer = setTimeout(() => resolve('safety_timeout'), safetyMs);
        });
        try {
            const outcome = await Promise.race([
                deps.startReputationAnalysis(entityType, value, serviceIds).then(() => 'done'),
                safetyPromise
            ]);
            if (outcome === 'safety_timeout') {
                console.warn(`[FB:Background] Reputation analysis safety-timeout for ${analysisKey}`);
            }
        } catch (e) {
            console.error('[FB:Background] Reputation analysis failed:', e);
        } finally {
            clearTimeout(safetyTimer);
            deps.inFlightReputationAnalyses.delete(analysisKey);
        }

        sendResponse({ success: true });
        return true;
    };
})();
