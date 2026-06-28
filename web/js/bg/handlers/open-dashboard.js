(function () {
    globalThis.FishBowlBgHandlers = globalThis.FishBowlBgHandlers || {};

    FishBowlBgHandlers.handleOpenDashboard = function handleOpenDashboard(browserApi, request, sendResponse) {
        const dashboardUrl = browserApi.runtime.getURL(`dashboard.html?ip=${encodeURIComponent(request.value)}`);

        browserApi.tabs.query({}).then((tabs) => {
            const existingTab = (tabs || []).find((tab) => tab.url && tab.url.includes(dashboardUrl));

            if (existingTab) {
                browserApi.tabs.update(existingTab.id, { active: true }).then(() => {
                    browserApi.windows.update(existingTab.windowId, { focused: true });
                });
            } else {
                browserApi.tabs.create({ url: dashboardUrl });
            }

            sendResponse({ success: true, dashboardUrl: dashboardUrl });
        });

        return true;
    };
})();
