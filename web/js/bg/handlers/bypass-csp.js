(function () {
    globalThis.FishBowlBgHandlers = globalThis.FishBowlBgHandlers || {};

    FishBowlBgHandlers.handleBypassCSP = async function handleBypassCSP(browserApi, request, sender, sendResponse, deps) {

        try {
            const dashboardUrlPrefix = browserApi.runtime.getURL('dashboard.html');
            const isDashboardUrl = (u) => typeof u === 'string' && u.startsWith(dashboardUrlPrefix);

            const resolveDashboardTabId = async () => {
                try {
                    if (sender?.tab?.id && isDashboardUrl(sender?.tab?.url)) {
                        return sender.tab.id;
                    }

                    const senderUrl = sender?.url;
                    if (isDashboardUrl(senderUrl)) {
                        const tabs = await browserApi.tabs.query({ url: senderUrl });
                        if (Array.isArray(tabs) && tabs.length) {
                            return tabs[0]?.id;
                        }
                    }

                    const fallbackTabs = await browserApi.tabs.query({ url: dashboardUrlPrefix + '*' });
                    if (Array.isArray(fallbackTabs) && fallbackTabs.length) {
                        return fallbackTabs[0]?.id;
                    }
                } catch (e) {
                    console.warn('[FB:Background] Failed to resolve dashboard tab id for bypassCSP', e);
                }
                return null;
            };

            const dashboardTabId = await resolveDashboardTabId();
            if (typeof dashboardTabId !== 'number') {
                console.warn('[FB:Background] bypassCSP ignored: could not resolve dashboard tab id');
                sendResponse({ success: false, error: 'Could not resolve dashboard tab id' });
                return true;
            }

            await deps.setupHeaderModificationRules(dashboardTabId);
        } catch (e) {
            console.warn('[FB:Background] Failed to handle bypassCSP request', e);
        }

        fetch(request.url, {
            method: 'GET',
            mode: 'no-cors',
            credentials: 'omit',
            cache: 'no-cache'
        }).catch(() => {});

        sendResponse({
            success: true,
            note: 'CSP bypass attempt via declarativeNetRequest API'
        });
        return true;
    };
})();
