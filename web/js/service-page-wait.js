(function () {
    globalThis.FishBowlServicePageWait = globalThis.FishBowlServicePageWait || {};

    FishBowlServicePageWait.getHostnameFromHref = function getHostnameFromHref(href) {
        const raw = (href || '').toString().trim();
        if (!raw) return '';

        const url = new URL(raw);
        return (url.hostname || '').toLowerCase();
    };

    FishBowlServicePageWait.getServiceHostname = function getServiceHostname(service) {
        const template = (service && typeof service.url === 'string') ? service.url : '';
        if (!template) {
            throw new Error('Service url template is required');
        }

        if (typeof FishBowlConsts === 'undefined' || !FishBowlConsts || !FishBowlConsts.VALUE_PLACEHOLDER) {
            throw new Error('FishBowlConsts.VALUE_PLACEHOLDER is required');
        }
        const placeholder = FishBowlConsts.VALUE_PLACEHOLDER;

        const exampleUrl = template.includes(placeholder) ? template.replace(placeholder, '127.0.0.1') : template;
        return FishBowlServicePageWait.getHostnameFromHref(exampleUrl);
    };

    FishBowlServicePageWait.findServiceConfigForCurrentPage = function findServiceConfigForCurrentPage(services, href) {
        const currentHref = (href || (window.location && window.location.href) || '').toString();
        const currentHostname = FishBowlServicePageWait.getHostnameFromHref(currentHref);
        if (!currentHostname) return null;

        const list = Array.isArray(services) ? services : [];
        for (const service of list) {
            const serviceHostname = FishBowlServicePageWait.getServiceHostname(service);
            if (serviceHostname && serviceHostname === currentHostname) {
                return service;
            }
        }

        return null;
    };

    FishBowlServicePageWait.waitForServiceSelectors = async function waitForServiceSelectors(service, options) {
        const loadSelectors = Array.isArray(service && service.loadSelectors) ? service.loadSelectors.filter(Boolean) : [];
        const notFoundSelectors = Array.isArray(service && service.notFoundSelectors) ? service.notFoundSelectors.filter(Boolean) : [];
        if (loadSelectors.length === 0 && notFoundSelectors.length === 0) return;

        if (!globalThis.FishBowlShadowDomTools || typeof globalThis.FishBowlShadowDomTools.querySelectorAllDeep !== 'function') {
            throw new Error('FishBowlShadowDomTools.querySelectorAllDeep is required but not available');
        }

        const timeoutMs = (options && Number.isFinite(options.timeoutMs)) ? options.timeoutMs : 15000;
        const intervalMs = (options && Number.isFinite(options.intervalMs)) ? options.intervalMs : 250;
        const start = Date.now();

        const areLoadSelectorsPresent = () => loadSelectors.length > 0 && loadSelectors.every(sel => {
            const found = globalThis.FishBowlShadowDomTools.querySelectorAllDeep(sel, document);
            return Array.isArray(found) ? found.length > 0 : (found && found.length > 0);
        });

        const normalizeSignalText = (value) => (value || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();

        const isNotFoundSignalPresent = (signal) => {
            const selector = (typeof signal === 'string') ? signal : signal && signal.selector;
            if (!selector) return false;

            const found = globalThis.FishBowlShadowDomTools.querySelectorAllDeep(selector, document);
            const elements = Array.from(found || []);
            const expectedText = (typeof signal === 'object' && signal)
                ? normalizeSignalText(signal.textEquals || signal.text)
                : '';
            if (!expectedText) {
                return elements.length > 0;
            }

            return elements.some((element) => normalizeSignalText(element && element.textContent) === expectedText);
        };

        const isNotFoundPresent = () => notFoundSelectors.some(isNotFoundSignalPresent);

        while (!areLoadSelectorsPresent()) {
            if (isNotFoundPresent()) {
                console.debug(`[FishBowl HUD] Found 'not found' selector for ${service.id || service.name || 'service'}, stopping wait.`);
                return;
            }

            if (Date.now() - start > timeoutMs) {
                console.warn(`[FishBowl HUD] Timed out waiting for service selectors for ${service.id || service.name || 'service'}:`, loadSelectors);
                return;
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }
    };

    FishBowlServicePageWait.waitForCurrentPageServiceLoadSelectorsIfNeeded = async function waitForCurrentPageServiceLoadSelectorsIfNeeded(services, options) {
        const service = FishBowlServicePageWait.findServiceConfigForCurrentPage(services);
        if (!service) return;
        await FishBowlServicePageWait.waitForServiceSelectors(service, options);
    };
})();
