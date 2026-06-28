(function () {
    globalThis.FishBowlBgDomExtract = globalThis.FishBowlBgDomExtract || {};

    FishBowlBgDomExtract.executeDomExtraction = async function executeDomExtraction(scriptingApi, tabId, serviceId, value, serviceName, entityType) {
        return scriptingApi.executeScript({
            target: { tabId },
            func: function (serviceIdInjected, valueInjected, serviceNameInjected, entityTypeInjected) {

                const buildAndSend = () => {
                    // Always send the full DOM with shadow roots inlined (replace-mode).
                    const clone = document.documentElement.cloneNode(true);
                    globalThis.FishBowlShadowDomTools.inlineOpenShadowDomIntoClone(clone, document.documentElement);
                    const domContent = clone.outerHTML;

                    const browserObj = typeof browser !== 'undefined' ? browser : chrome;
                    browserObj.runtime.sendMessage({
                        action: 'domExtracted',
                        source: serviceIdInjected,
                        entityType: (entityTypeInjected || '').toString().trim().toLowerCase(),
                        value: valueInjected,
                        domContent,
                        serviceName: serviceNameInjected || document.title
                    });

                    return true;
                };

                return buildAndSend();
            },
            args: [serviceId, value, serviceName, (entityType || '')]
        });
    };
})();
