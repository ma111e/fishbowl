(function () {
    globalThis.FishBowlBgDnrRules = globalThis.FishBowlBgDnrRules || {};

    FishBowlBgDnrRules.createManager = function createManager(browserApi, fishBowlConfig, fishBowlConsts) {
        const log = globalThis.FishBowlLog?.for('BG:DnrRules') || {
            debug: () => {}, info: () => {},
            warn: console.warn.bind(console, '[BG:DnrRules]'),
            error: console.error.bind(console, '[BG:DnrRules]')
        };

        const dashboardTabRuleIds = new Map();

        const getDashboardIframeDomains = () => {
            try {
                if (!fishBowlConfig?.ALL_SERVICES || !Array.isArray(fishBowlConfig.ALL_SERVICES)) {
                    return [];
                }

                const domains = new Set();
                for (const serviceConfig of fishBowlConfig.ALL_SERVICES) {
                    if (!serviceConfig?.url || typeof serviceConfig.url !== 'string') continue;

                    const url = serviceConfig.url.replace(fishBowlConsts.VALUE_PLACEHOLDER, '1.1.1.1');
                    try {
                        const host = new URL(url).hostname;
                        if (host) {
                            domains.add(host);
                            if (host.startsWith('www.')) {
                                domains.add(host.slice(4));
                            }
                        }
                    } catch (e) {
                        log.warn('Failed to parse service URL for iframe domain allowlist', e);
                    }
                }

                return Array.from(domains);
            } catch (e) {
                log.warn('Failed to compute dashboard iframe domains', e);
                return [];
            }
        };

        const setupHeaderModificationRules = async (tabId) => {
            if (typeof tabId !== 'number') {
                log.warn('No valid tabId provided; skipping header modification rules setup');
                return false;
            }

            const dashboardIframeDomains = getDashboardIframeDomains();

            if (!dashboardIframeDomains.length) {
                log.warn('No dashboard iframe domains found; skipping header modification rules setup');
                return false;
            }

            if (!(typeof browserApi !== 'undefined' && typeof browserApi.declarativeNetRequest !== 'undefined')) {
                log.error('declarativeNetRequest API not available; MV3-only mode cannot set up iframe header modification rules');
                return false;
            }

            try {
                const ruleId = 100000 + tabId;
                const rules = [
                    {
                        id: ruleId,
                        priority: 1,
                        action: {
                            type: 'modifyHeaders',
                            responseHeaders: [
                                { header: 'x-frame-options', operation: 'remove' },
                                { header: 'content-security-policy', operation: 'remove' },
                                { header: 'x-content-security-policy', operation: 'remove' },
                                { header: 'frame-options', operation: 'remove' }
                            ]
                        },
                        condition: {
                            requestDomains: dashboardIframeDomains,
                            resourceTypes: ['sub_frame'],
                            tabIds: [tabId]
                        }
                    }
                ];

                const previousRuleId = dashboardTabRuleIds.get(tabId);
                await browserApi.declarativeNetRequest.updateSessionRules({
                    removeRuleIds: previousRuleId ? [previousRuleId] : [],
                    addRules: rules
                });
                dashboardTabRuleIds.set(tabId, ruleId);
                return true;
            } catch (error) {
                log.error('Error setting up declarativeNetRequest rules:', error);
                return false;
            }
        };

        const registerTabCloseCleanup = () => {
            try {
                browserApi.tabs.onRemoved.addListener(async (removedTabId) => {
                    const ruleId = dashboardTabRuleIds.get(removedTabId);
                    if (!ruleId) return;

                    try {
                        await browserApi.declarativeNetRequest.updateSessionRules({
                            removeRuleIds: [ruleId],
                            addRules: []
                        });
                    } catch (e) {
                        log.warn('Failed to remove session DNR rule on tab close', e);
                    }

                    dashboardTabRuleIds.delete(removedTabId);
                });
            } catch (e) {
                log.warn('Failed to register dashboard tab cleanup listener', e);
            }
        };

        // On service-worker wake, reconcile dynamic rules against the known tab
        // set. Rules from a prior worker generation whose tabs are already closed
        // would otherwise accumulate until they hit the DNR limit.
        const reconcileOrphanedRules = async () => {
            if (!browserApi.declarativeNetRequest?.getSessionRules) return;
            try {
                const existingRules = await browserApi.declarativeNetRequest.getSessionRules();
                if (!existingRules.length) return;

                const openTabs = await browserApi.tabs.query({});
                const openTabIds = new Set(openTabs.map(t => t.id));

                const staleIds = existingRules
                    .filter(rule => {
                        const condTabIds = rule.condition?.tabIds;
                        if (!Array.isArray(condTabIds)) return false;
                        return condTabIds.every(tid => !openTabIds.has(tid));
                    })
                    .map(rule => rule.id);

                if (staleIds.length > 0) {
                    await browserApi.declarativeNetRequest.updateSessionRules({ removeRuleIds: staleIds, addRules: [] });
                    log.debug(`Reconciled ${staleIds.length} orphaned DNR rule(s) from prior worker generation`);
                }
            } catch (e) {
                log.warn('Failed to reconcile orphaned DNR rules', e);
            }
        };

        return {
            setupHeaderModificationRules,
            registerTabCloseCleanup,
            reconcileOrphanedRules
        };
    };
})();
