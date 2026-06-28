(function () {
    globalThis.FishBowlBgTabLifecycle = globalThis.FishBowlBgTabLifecycle || {};

    const log = globalThis.FishBowlLog?.for('BG:TabLifecycle') || {
        debug: () => {}, info: () => {},
        warn: console.warn.bind(console, '[BG:TabLifecycle]'),
        error: console.error.bind(console, '[BG:TabLifecycle]')
    };

    // tabId → { tabInfo, service, value, deps } for any analysis tab we are
    // currently polling. Lets us react to user-closed tabs (see onRemoved
    // wiring below) instead of waiting ~4 s for executeScript to error out.
    const _activeTabs = new Map();
    let _onRemovedRegistered = false;

    // ── Unified cleanup helper ────────────────────────────────────────────────
    // Every exit path (timeout, not-found, extract-failed, check-failed,
    // tab_closed) calls this once so we never leave a dangling interval,
    // timeout, or activeTabs entry.
    function cleanupTabInfo(tabInfo, reason) {
        try {
            if (tabInfo.checkInterval) {
                clearInterval(tabInfo.checkInterval);
                tabInfo.checkInterval = null;
            }
        } catch (e) {
            log.warn(`Failed to clear check interval (${reason})`, e);
        }
        try {
            if (tabInfo.timeout) {
                clearTimeout(tabInfo.timeout);
                tabInfo.timeout = null;
            }
        } catch (e) {
            log.warn(`Failed to clear timeout (${reason})`, e);
        }
        if (typeof tabInfo.tabId === 'number') {
            _activeTabs.delete(tabInfo.tabId);
        }
    }

    function _registerOnRemovedOnce(browserApi) {
        if (_onRemovedRegistered) return;
        if (!browserApi?.tabs?.onRemoved?.addListener) return;
        _onRemovedRegistered = true;
        browserApi.tabs.onRemoved.addListener((removedTabId) => {
            const entry = _activeTabs.get(removedTabId);
            if (!entry) return;
            log.debug(`Analysis tab ${removedTabId} closed externally - releasing ${entry.service?.name}`);
            cleanupTabInfo(entry.tabInfo, 'tab_closed');
            if (typeof entry.deps?.markServiceCompleteWithError === 'function') {
                entry.deps.markServiceCompleteWithError(entry.value, entry.service, 'tab_closed');
            }
            FishBowlBgTabQueue.release();
        });
    }

    function startSingleServiceTab(browserApi, value, service, deps) {
        const entityType = (deps?.entityType || '').toString().trim().toLowerCase();
        const markServiceCompleteWithError = deps?.markServiceCompleteWithError;
        const closeTabSafely = deps?.closeTabSafely;

        const analysisUrl = service.url + (service.url.includes('?') ? '&' : '?') + 'fishbowl_analysis=true';

        log.debug(`Creating tab for ${service.name} at ${analysisUrl}`);

        browserApi.tabs.create({ url: analysisUrl, active: false }).then((tab) => {
            log.debug(`Tab created with ID ${tab.id} for ${service.name}`);

            FishBowlBgInjectTools.injectFileWhenHttpReady(browserApi, tab.id, 'js/bg/reputation/shadow-dom-tools.js', {
                label: service.name
            });

            const tabInfo = {
                tabId: tab.id,
                serviceId: service.id,
                value: value,
                entityType,
                serviceName: service.name,
                checkInterval: null,
                waitingForChallenge: false,
                timeout: null,
                checkErrorCount: 0
            };
            _activeTabs.set(tab.id, { tabInfo, service, value, deps });

            tabInfo.timeout = setTimeout(() => {
                cleanupTabInfo(tabInfo, 'timeout');

                if (typeof markServiceCompleteWithError === 'function') {
                    markServiceCompleteWithError(value, service, 'timeout');
                }
                if (typeof closeTabSafely === 'function') {
                    closeTabSafely(tab.id, 'timeout');
                }
                FishBowlBgTabQueue.release();
            }, (globalThis.FishBowlConstants?.TIMING.TAB_ANALYSIS_TIMEOUT_MS ?? 30000));

            tabInfo.checkInterval = setInterval(() => {
                try {
                    browserApi.scripting.executeScript({
                        target: { tabId: tab.id },
                        args: [service.loadSelectors || [], service.notFoundSelectors || []],
                        // NOTE: this function runs in the page context, not the service worker.
                        // console.log calls here are intentional and cannot use FishBowlLog.
                        func: function (loadSelectors, notFoundSelectors) {
                            const isLoaded = document.readyState === 'complete';

                            let pageFullyLoaded = isLoaded;

                            const querySelectorAllDeep = (selector) => {
                                try {
                                    if (globalThis.FishBowlShadowDomTools && typeof globalThis.FishBowlShadowDomTools.querySelectorAllDeep === 'function') {
                                        return globalThis.FishBowlShadowDomTools.querySelectorAllDeep(selector, document);
                                    }
                                } catch (e) {
                                    console.warn('[Tab Context] Failed to use FishBowlShadowDomTools.querySelectorAllDeep', e);
                                }

                                return [];
                            };

                            const normalizeSignalText = (value) => (value || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();

                            const isNotFoundSignalPresent = (signal) => {
                                const selector = (typeof signal === 'string') ? signal : signal && signal.selector;
                                if (!selector) return false;

                                const elements = Array.from(querySelectorAllDeep(selector) || []);
                                const expectedText = (typeof signal === 'object' && signal)
                                    ? normalizeSignalText(signal.textEquals || signal.text)
                                    : '';
                                if (!expectedText) {
                                    return elements.length >= 1;
                                }

                                return elements.some((element) => normalizeSignalText(element && element.textContent) === expectedText);
                            };

                            if (isLoaded && loadSelectors && loadSelectors.length > 0) {
                                const selectorResults = loadSelectors.map((selector) => {
                                    const elements = querySelectorAllDeep(selector);
                                    return elements.length >= 1;
                                });

                                pageFullyLoaded = selectorResults.every((result) => result);
                            }

                            let isNotFound = false;
                            if (isLoaded && notFoundSelectors && notFoundSelectors.length > 0) {
                                isNotFound = notFoundSelectors.some(isNotFoundSignalPresent);
                            }

                            let hasChallenge = false;
                            if (document.querySelector('title')?.textContent === 'Just a moment...') {
                                hasChallenge = true;
                            }

                            return { isLoaded: pageFullyLoaded, hasChallenge, isNotFound };
                        }
                    }).then((result) => {
                        if (!result || result.length === 0) {
                            tabInfo.checkErrorCount += 1;
                            log.error(`No result from script execution in tab ${tab.id} [attempt ${tabInfo.checkErrorCount}]`);
                            if (tabInfo.checkErrorCount > 3) {
                                cleanupTabInfo(tabInfo, 'no_result');
                                if (typeof markServiceCompleteWithError === 'function') {
                                    markServiceCompleteWithError(value, service, 'check_failed');
                                }
                                if (typeof closeTabSafely === 'function') {
                                    closeTabSafely(tab.id, 'no_result');
                                }
                                FishBowlBgTabQueue.release();
                            }
                            return;
                        }

                        let normalized = result[0].result;
                        if (!normalized) {
                            tabInfo.checkErrorCount += 1;
                            log.error(`Invalid result format from script in tab ${tab.id} [attempt ${tabInfo.checkErrorCount}]`);
                            if (tabInfo.checkErrorCount > 3) {
                                cleanupTabInfo(tabInfo, 'invalid_result');
                                if (typeof markServiceCompleteWithError === 'function') {
                                    markServiceCompleteWithError(value, service, 'check_failed');
                                }
                                if (typeof closeTabSafely === 'function') {
                                    closeTabSafely(tab.id, 'invalid_result');
                                }
                                FishBowlBgTabQueue.release();
                            }
                            return;
                        }

                        tabInfo.checkErrorCount = 0;

                        if (normalized.hasChallenge && !tabInfo.waitingForChallenge) {
                            tabInfo.waitingForChallenge = true;

                            browserApi.tabs.update(tab.id, { active: true }).then(() => {
                                browserApi.windows.update(tab.windowId, { focused: true });
                                log.debug(`Tab ${tab.id} focused for ${service.name} captcha challenge`);
                            });

                            return;
                        }

                        if (normalized.isNotFound) {
                            log.debug(`Service ${service.name} reported 'not found' for ${value} in tab ${tab.id}`);

                            cleanupTabInfo(tabInfo, 'not_found');

                            if (typeof markServiceCompleteWithError === 'function') {
                                markServiceCompleteWithError(value, service, 'not_found');
                            }
                            if (typeof closeTabSafely === 'function') {
                                closeTabSafely(tab.id, 'not_found');
                            }
                            FishBowlBgTabQueue.release();
                            return;
                        }

                        if (normalized.isLoaded && !normalized.hasChallenge) {
                            log.debug(`Page loaded in tab ${tab.id} without challenges`);

                            cleanupTabInfo(tabInfo, 'page_loaded');

                            const postChallengeDelayMs = tabInfo.waitingForChallenge ? (globalThis.FishBowlConstants?.TIMING.POST_CHALLENGE_DELAY_MS ?? 2000) : 0;

                            setTimeout(() => {
                                FishBowlBgDomExtract.executeDomExtraction(browserApi.scripting, tab.id, service.id, value, service.name, entityType)
                                .then(() => {
                                    setTimeout(() => {
                                        browserApi.tabs.get(tab.id).then(() => {
                                            browserApi.tabs.remove(tab.id)
                                                .then(() => { FishBowlBgTabQueue.release(); })
                                                .catch((err) => {
                                                    log.error(`Error removing tab ${tab.id}:`, err);
                                                    FishBowlBgTabQueue.release();
                                                });
                                        }).catch(() => {
                                            FishBowlBgTabQueue.release();
                                        });
                                    }, (globalThis.FishBowlConstants?.TIMING.DOM_EXTRACT_DELAY_MS ?? 500));
                                })
                                .catch((error) => {
                                    log.error(`Error extracting DOM from ${service.name}:`, error);

                                    if (typeof markServiceCompleteWithError === 'function') {
                                        markServiceCompleteWithError(value, service, 'extract_failed');
                                    }
                                    if (typeof closeTabSafely === 'function') {
                                        closeTabSafely(tab.id, 'extract_failed');
                                    }
                                    FishBowlBgTabQueue.release();
                                });
                            }, postChallengeDelayMs);
                        }
                    }).catch((error) => {
                        tabInfo.checkErrorCount += 1;
                        const errMsg = error?.message || String(error);
                        log.error(`Error checking tab ${tab.id} for ${service.name} (${value}) [attempt ${tabInfo.checkErrorCount}]:`, errMsg);

                        if (tabInfo.checkErrorCount <= 3) {
                            return;
                        }

                        cleanupTabInfo(tabInfo, 'check_failed');

                        if (typeof markServiceCompleteWithError === 'function') {
                            markServiceCompleteWithError(value, service, 'check_failed');
                        }
                        if (typeof closeTabSafely === 'function') {
                            closeTabSafely(tab.id, 'check_failed');
                        }
                        FishBowlBgTabQueue.release();
                    });
                } catch (error) {
                    log.error(`Exception executing script in tab ${tab.id}:`, error);
                }
            }, (globalThis.FishBowlConstants?.TIMING.TAB_CHECK_INTERVAL_MS ?? 1000));
        }).catch((err) => {
            log.warn(`Failed to create tab for ${service.name}`, err);
            if (typeof markServiceCompleteWithError === 'function') {
                markServiceCompleteWithError(value, service, 'tab_create_failed');
            }
            FishBowlBgTabQueue.release();
        });
    }

    FishBowlBgTabLifecycle.startServiceTabs = function startServiceTabs(browserApi, value, servicesList, deps) {
        const entityType = (deps?.entityType || '').toString().trim().toLowerCase();
        if (!entityType) {
            log.warn('Missing entityType when starting service tabs');
        }

        _registerOnRemovedOnce(browserApi);

        const markServiceCompleteWithError = deps?.markServiceCompleteWithError;

        (servicesList || []).forEach((service) => {
            const launcher = () => startSingleServiceTab(browserApi, value, service, deps);
            // If the queue drops this launcher (full queue, watchdog, synchronous
            // throw), we must still drain analysisRegistry.pending for this
            // service or the coordinator never emits allServicesComplete.
            launcher.onDrop = (reason) => {
                if (typeof markServiceCompleteWithError === 'function') {
                    markServiceCompleteWithError(value, service, `queue_${reason || 'dropped'}`);
                }
            };
            FishBowlBgTabQueue.enqueue(launcher);
        });
    };
})();
