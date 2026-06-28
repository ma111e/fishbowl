(function (root) {
    'use strict';

    function create(browserApi, config, consts) {
        const log = root.FishBowlLog?.for('BG:Coordinator') || {
            debug: () => {}, info: () => {},
            warn: console.warn.bind(console, '[BG:Coordinator]'),
            error: console.error.bind(console, '[BG:Coordinator]')
        };

        // Single registry replaces the previous dual-map design
        // (pendingServicesByKey + reputationCompletedServicesByKey).
        // Shape: { [analysisKey]: { pending: Set<serviceId>, completed: Record<serviceId, result> } }
        const analysisRegistry = {};

        // Kept for handlers that guard against duplicate in-flight requests.
        const inFlightReputationAnalyses = new Set();

        const buildAnalysisKey = (entityType, value) => {
            const t = (entityType || '').toString().trim().toLowerCase();
            if (!t) return '';
            const v = (value || '').toString().trim();
            return `${t}:${v}`;
        };

        function getOrCreateEntry(analysisKey) {
            if (!analysisRegistry[analysisKey]) {
                analysisRegistry[analysisKey] = { pending: new Set(), completed: {} };
            }
            return analysisRegistry[analysisKey];
        }

        async function closeTabSafely(tabId, note = '') {
            try {
                if (typeof tabId !== 'number') return;
                try {
                    await browserApi.tabs.get(tabId);
                } catch (e) {
                    if (e) log.warn(`closeTabSafely: tab ${tabId} no longer exists`, e);
                    return;
                }
                await browserApi.tabs.remove(tabId);
                if (note) log.debug(`Closed tab ${tabId} (${note})`);
            } catch (e) {
                log.warn(`Failed to close tab ${tabId}`, e);
            }
        }

        async function getEnabledServicesCount(entityType, value) {
            return root.FishBowlBgReputationServices.getEnabledServicesCount(
                browserApi.storage,
                config.REPUTATION_SERVICE_DEFS,
                entityType,
                value
            );
        }

        async function getReputationServicesList(entityType, value, includeAll = false) {
            return root.FishBowlBgReputationServices.getReputationServicesList(
                browserApi.storage,
                config.REPUTATION_SERVICE_DEFS,
                entityType,
                value,
                consts.VALUE_PLACEHOLDER,
                includeAll
            );
        }

        function getWorstReputation(completedMap) {
            const priority = (globalThis.FishBowlConstants?.VERDICT_PRIORITY) ?? ['malicious', 'suspicious', 'neutral', 'benign', 'unknown'];
            let worst = 'unknown';
            Object.values(completedMap || {}).forEach(result => {
                const cur = result.verdict || 'unknown';
                const ci = priority.indexOf(cur);
                const wi = priority.indexOf(worst);
                if (ci >= 0 && (wi < 0 || ci < wi)) worst = cur;
            });
            return worst;
        }

        function broadcastServiceProgress(entityType, value, source, serviceName, details, errorLabel) {
            const analysisKey = buildAnalysisKey(entityType, value);
            const entry = getOrCreateEntry(analysisKey);
            const completedCount = Object.keys(entry.completed).length;

            getEnabledServicesCount(entityType, value)
                .then((enabledServicesCount) => {
                    try {
                        root.FishBowlBroadcast.broadcastToAllTabs(browserApi.tabs, {
                            action: root.FishBowlContracts?.ACTIONS?.UPDATE_VERDICT || 'updateVerdict',
                            source,
                            entityType,
                            value,
                            serviceName,
                            verdict: getWorstReputation(entry.completed),
                            details: details || {},
                            error: errorLabel || null,
                            expectedCount: enabledServicesCount,
                            completedCount
                        }).catch((e) => {
                            log.warn('Failed to broadcast updateVerdict', e);
                        });

                        entry.pending.delete(source);
                        if (entry.pending.size === 0) {
                            delete analysisRegistry[analysisKey];
                            root.FishBowlBroadcast.broadcastToAllTabs(browserApi.tabs, {
                                action: root.FishBowlContracts?.ACTIONS?.ALL_SERVICES_COMPLETE || 'allServicesComplete',
                                entityType,
                                value,
                                results: entry.completed,
                                worstReputation: getWorstReputation(entry.completed),
                                expectedCount: enabledServicesCount,
                                completedCount: Object.keys(entry.completed).length
                            }).catch((e) => {
                                log.warn('Failed to broadcast allServicesComplete', e);
                            });
                        }
                    } finally {
                        // guard: ensure pending is always cleaned even if broadcast throws
                        if (analysisRegistry[analysisKey]) {
                            entry.pending.delete(source);
                        }
                    }
                })
                .catch((e) => {
                    log.warn('Failed to broadcast service progress', e);
                });
        }

        function markServiceCompleteWithError(entityType, value, service, errorLabel) {
            try {
                const analysisKey = buildAnalysisKey(entityType, value);
                if (!analysisKey || !service?.id) return;
                const entry = getOrCreateEntry(analysisKey);

                if (entry.completed[service.id]) return;

                entry.completed[service.id] = {
                    serviceName: service.name || service.id,
                    verdict: 'unknown',
                    details: {},
                    error: errorLabel || 'error'
                };

                broadcastServiceProgress(entityType, value, service.id, service.name || service.id, {}, errorLabel || 'error');
            } catch (e) {
                log.warn('Failed to mark service complete with error', e);
            }
        }

        async function runApiServices(entityType, value, analysisKey, apiServices) {
            if (apiServices.length === 0) return;

            const perServiceTimeoutMs = globalThis.FishBowlConstants?.TIMING.API_SERVICE_TIMEOUT_MS ?? 25_000;

            // API keys are configured server-side; the backend reads its own copy.
            const promises = apiServices.map((service) => {
                const payload = { source: service.id, content: '', value, entityType };

                // Per-service deadline: one hung provider must not stall the
                // whole Promise.allSettled (which would block the handler's
                // finally{} that drains inFlightReputationAnalyses).
                let timer;
                const fetchPromise = root.FishBowlNet.postJsonExpectJson(config.PARSE_DOM_FOR_IP_VERDICT_URL, payload);
                const timeoutPromise = new Promise((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error(`API service ${service.name} timed out after ${perServiceTimeoutMs}ms`)),
                        perServiceTimeoutMs
                    );
                });

                return Promise.race([fetchPromise, timeoutPromise])
                    .then((data) => {
                        const entry = getOrCreateEntry(analysisKey);
                        entry.completed[service.id] = {
                            serviceName: service.name,
                            verdict: data.verdict || 'unknown',
                            details: data.details || {},
                            error: null
                        };
                        broadcastServiceProgress(entityType, value, service.id, service.name, data.details || {}, null);
                    })
                    .catch((error) => {
                        log.error(`API-mode analysis error for ${value} from ${service.name}:`, error);
                        markServiceCompleteWithError(entityType, value, service, 'api_failed');
                    })
                    .finally(() => clearTimeout(timer));
            });

            await Promise.allSettled(promises);
        }

        async function startReputationAnalysis(entityType, value, targetServiceId = null) {
            const analysisKey = buildAnalysisKey(entityType, value);
            const targetIds = targetServiceId
                ? (Array.isArray(targetServiceId) ? targetServiceId : [targetServiceId])
                : null;
            log.debug(`Starting reputation analysis for ${analysisKey}${targetIds ? ' (services: ' + targetIds.join(', ') + ')' : ''}`);

            const entry = getOrCreateEntry(analysisKey);

            if (targetIds) {
                targetIds.forEach(id => { delete entry.completed[id]; });
            }

            let servicesList = await getReputationServicesList(entityType, value, !!targetIds);
            if (targetIds) {
                servicesList = servicesList.filter(service => targetIds.includes(service.id));
            }

            servicesList.forEach(service => entry.pending.add(service.id));

            const tabServices = servicesList.filter(service => !service.apiMode);
            const apiServices = servicesList.filter(service => !!service.apiMode);

            root.FishBowlBgTabLifecycle.startServiceTabs(browserApi, value, tabServices, {
                entityType,
                markServiceCompleteWithError: (v, service, errorLabel) => markServiceCompleteWithError(entityType, v, service, errorLabel),
                closeTabSafely
            });

            await runApiServices(entityType, value, analysisKey, apiServices);
        }

        function analyzeContent(entityType, value, source, domContent, serviceName = null) {
            log.debug(`Sending DOM for ${value} from ${source} to backend for analysis`);

            const t = (entityType || '').toString().trim().toLowerCase();
            const service = { id: source, name: serviceName || source };
            if (!t) {
                log.warn('Missing entityType for DOM analysis payload');
                markServiceCompleteWithError(entityType, value, service, 'parse_failed');
                return;
            }

            if (!config || !config.PARSE_DOM_FOR_IP_VERDICT_URL) {
                log.error('DOM analysis configuration not available');
                markServiceCompleteWithError(entityType, value, service, 'parse_config_missing');
                return;
            }

            const payload = { source, content: domContent, value, entityType: t };

            root.FishBowlNet.postJsonExpectJson(config.PARSE_DOM_FOR_IP_VERDICT_URL, payload)
                .then((data) => {
                    const analysisKey = buildAnalysisKey(entityType, value);
                    const entry = getOrCreateEntry(analysisKey);
                    entry.completed[source] = {
                        serviceName: serviceName || source,
                        verdict: data.verdict || 'unknown',
                        details: data.details || {},
                        error: null
                    };
                    broadcastServiceProgress(entityType, value, source, serviceName || source, data.details || {}, null);
                })
                .catch(error => {
                    log.error(`Error analyzing ${value} from ${source}:`, error);
                    markServiceCompleteWithError(entityType, value, service, 'parse_failed');
                });
        }

        return {
            inFlightReputationAnalyses,
            getEnabledServicesCount,
            getWorstReputation,
            startReputationAnalysis,
            analyzeContent
        };
    }

    root.FishBowlBgReputationCoordinator = { create };
})(globalThis);
