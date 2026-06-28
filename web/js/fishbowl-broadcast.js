(function () {
    globalThis.FishBowlBroadcast = globalThis.FishBowlBroadcast || {};

    // Tabs without our content script (extension pages, about:/view-source:, the
    // dashboard/sandbox, blocked pages) reject with "Receiving end does not
    // exist". That's expected for a fan-out broadcast - log it at debug so it
    // doesn't masquerade as a real error in the background console.
    function handleSendError(err) {
        const m = (err && err.message) || String(err);
        if (m.includes('Receiving end does not exist') || m.includes('Could not establish connection')) {
            console.debug('[FishBowlBroadcast] no receiver for tab (expected):', m);
            return;
        }
        console.error('[FishBowlBroadcast] sendMessage failed:', err);
    }

    FishBowlBroadcast.broadcastToAllTabs = async function broadcastToAllTabs(tabsApi, msg) {
        const tabs = await tabsApi.query({});
        await Promise.all(
            (tabs || []).map((tab) => {
                if (!tab || typeof tab.id !== 'number') return Promise.resolve();
                return tabsApi.sendMessage(tab.id, msg).catch(handleSendError);
            })
        );
    };

    FishBowlBroadcast.broadcastToActiveTabs = async function broadcastToActiveTabs(tabsApi, msg) {
        const tabs = await tabsApi.query({ active: true });
        await Promise.all(
            (tabs || []).map((tab) => {
                if (!tab || typeof tab.id !== 'number') return Promise.resolve();
                return tabsApi.sendMessage(tab.id, msg).catch(handleSendError);
            })
        );
    };
})();
