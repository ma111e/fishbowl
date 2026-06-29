/**
 * FishBowl Security Extension - Configuration
 * Global configuration settings for the FishBowl extension
 */


const FishBowlConsts = {
    VALUE_PLACEHOLDER: "__VALUE__",
    VIRUSTOTAL_NOT_FOUND_SELECTOR: { selector: 'a.btn', textEquals: 'try a new search' },

    // Shared entity type definitions used by ui-manager, region-selector, and dom-highlighter
    ENTITY_TYPES: {
        ip: { itemClass: 'ip-item', dataAttr: 'data-ip', panelId: 'ip-panel', contentId: 'ip-list' },
        asn: { itemClass: 'asn-item', dataAttr: 'data-asn', panelId: 'asn-panel', contentId: 'asn-list' },
        domain: { itemClass: 'domain-item', dataAttr: 'data-domain', panelId: 'domain-panel', contentId: 'domain-list' },
        file: { itemClass: 'file-item', dataAttr: 'data-file', panelId: 'file-panel', contentId: 'file-list' },
        event: { itemClass: 'event-item', dataAttr: 'data-event-id', panelId: 'event-panel', contentId: 'event-list' },
        sid: { itemClass: 'sid-item', dataAttr: 'data-sid', panelId: 'sid-panel', contentId: 'sid-list' },
        hash: { itemClass: 'hash-item', dataAttr: 'data-hash', panelId: 'hash-panel', contentId: 'hash-list-sha1' },
    },

    // Icon paths for selection panel shortcut buttons
    SHORTCUT_ICON_PATHS: {
        virustotal: 'icons/virustotal.png',
        abuseipdb: 'icons/abuseipdb.png',
        whois: 'icons/whois.png',
        ipinfo: 'icons/ipinfo.png',
        alienvault: 'icons/alienvault.png',
        greynoise: 'icons/greynoise.png',
        asn: 'icons/asn.png',
        google: 'icons/google.png',
        spur: 'icons/spur.png',
        shodan: 'icons/shodan.png',
        bazaar: 'icons/bazaar.png',
        microsoft: 'icons/microsoft.png',
        chatgpt: 'icons/chatgpt.png',
        perplexity: 'icons/perplexity.png'
    },

    extractDomainFromUserInput(input) {
        const raw = (input || '').toString().trim();
        if (!raw) return null;

        const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;

        try {
            const url = new URL(withScheme);
            const host = (url.hostname || '').toLowerCase();
            return host || null;
        } catch (urlErr) {
            console.warn('[FishBowl Config] Failed to parse URL for host extraction', urlErr);
            return null;
        }
    },

    domainSettingsKeyForHost(host) {
        const safe = (host || '').toString().trim().toLowerCase();
        return safe ? `settingsByDomain:${safe}` : '';
    },

    reputationCacheKey(entityType, value) {
        const t = (entityType || '').toString().trim().toLowerCase();
        if (!t) return '';
        const vRaw = (value || '').toString().trim();
        if (!vRaw) return '';

        const v = (t === 'domain' || t === 'hash' || t === 'file' || t === 'asn')
            ? vRaw.toLowerCase()
            : vRaw;

        return `reputation:${t}:${v}`;
    }
};

// Global configuration object
const FishBowlConfig = {
    EXTRACT_INDICATORS_FROM_DOM_URL: "http://localhost:7158/analyze-page",
    PARSE_DOM_FOR_IP_VERDICT_URL: "http://localhost:7158/analyze-ip-verdict-from-dom",
    CAPABILITIES_URL: "http://localhost:7158/capabilities",
    PAIR_URL: "http://localhost:7158/pair",
    PING_URL: "http://localhost:7158/ping",
    SETUP_INSTALLED_URL: "http://localhost:3001/installed",
    HUD_ID: "fishbowl-security-hud",

    // Default settings for scanning and visual features
    DEFAULT_SETTINGS: {
        scanIpAddresses: true,
        scanEventIds: true,
        scanSids: true,
        scanAsn: true,
        scanDomains: true,
        scanHashes: true,
        scanFiles: true,
        showEventDescriptions: false,
        textareaInspectOverlayEnabled: false,
        textareaInspectOverlayDefault: false,
        textareaInspectOverlayHoldToShow: false,
        showVisualUpdates: true,
        showActivityFeed: true,
        showPanelHeaders: true,
        animateActivityFeedText: true,
        enableCache: true,
        reputationServices: {
            ip: {
                virustotal: false,
                abuseipdb: true,
                ipinfo: true,
                alienvault: false,
                greynoise: false,
                whois: false,
                spur: true,
                shodan: false
            },
            domain: {
                virustotal: true
            },
            hash: {
                virustotal: true,
                bazaar: true
            },
            file: {
                virustotal: true
            },
            asn: {
                ipinfo: true
            }
        },
        infoPanelOpacity: 0.35,
        theme: 'dark',
        domainWhitelist: [],
        useDomainWhitelist: false,
        cspBackendOverrideDomains: [],
        hudPanelPositionsByDomain: {},
        hudPanelVisibilityByDomain: {}
    },

    REPUTATION_SERVICE_DEFS: {
        ip: [
            {
                id: 'virustotal',
                name: 'VirusTotal',
                shortcut: 'v',
                urlTemplate: `https://www.virustotal.com/gui/search/${FishBowlConsts.VALUE_PLACEHOLDER}`,
                defaultEnabled: false,
                supportsApiMode: true,
                loadSelectors: ['#engine-text-0'],
                notFoundSelectors: [FishBowlConsts.VIRUSTOTAL_NOT_FOUND_SELECTOR]
            },
            {
                id: 'ipinfo',
                name: 'IPinfo',
                shortcut: 'i',
                urlTemplate: `https://ipinfo.io/${FishBowlConsts.VALUE_PLACEHOLDER}`,
                defaultEnabled: true,
                loadSelectors: []
            },
            {
                id: 'abuseipdb',
                name: 'AbuseIPDB',
                shortcut: 'a',
                urlTemplate: `https://www.abuseipdb.com/check/${FishBowlConsts.VALUE_PLACEHOLDER}`,
                defaultEnabled: true,
                loadSelectors: [],
                supportsApiMode: true
            },
            // {
            //     id: 'alienvault',
            //     name: 'AlienVault OTX',
            //     urlTemplate: `https://otx.alienvault.com/indicator/ip/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            //     defaultEnabled: false,
            //     loadSelectors: ['.pulse-list']
            // },
            // {
            //     id: 'greynoise',
            //     name: 'GreyNoise',
            //     urlTemplate: `https://www.greynoise.io/viz/ip/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            //     defaultEnabled: false,
            //     loadSelectors: ['.v-popper.v-popper--theme-tooltip']
            // },
            // {
            //     id: 'whois',
            //     name: 'Whois',
            //     urlTemplate: `https://whois.domaintools.com/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            //     defaultEnabled: false,
            //     loadSelectors: []
            // },
            {
                id: 'spur',
                name: 'Spur',
                shortcut: 's',
                urlTemplate: `https://app.spur.us/search?q=${FishBowlConsts.VALUE_PLACEHOLDER}`,
                defaultEnabled: true,
                loadSelectors: ['div.col-span-1:nth-child(2) > div:nth-child(1) > div:nth-child(1)'],
                notFoundSelectors: ['.cl-logoBox']
            },
            {
                id: 'shodan',
                name: 'Shodan',
                shortcut: 'o',
                apiMode: true,
                defaultEnabled: false
            }
        ],
        domain: [
            {
                id: 'virustotal',
                name: 'VirusTotal',
                shortcut: 'v',
                urlTemplate: `https://www.virustotal.com/gui/search/${FishBowlConsts.VALUE_PLACEHOLDER}`,
                defaultEnabled: true,
                supportsApiMode: true,
                loadSelectors: ['#engine-text-0'],
                notFoundSelectors: [FishBowlConsts.VIRUSTOTAL_NOT_FOUND_SELECTOR]

            }
        ],
        hash: [
            {
                id: 'virustotal',
                name: 'VirusTotal',
                shortcut: 'v',
                urlTemplate: `https://www.virustotal.com/gui/search/${FishBowlConsts.VALUE_PLACEHOLDER}`,
                defaultEnabled: true,
                supportsApiMode: true,
                loadSelectors: ['#engine-text-0'],
                notFoundSelectors: [FishBowlConsts.VIRUSTOTAL_NOT_FOUND_SELECTOR]

            },
            {
                id: 'bazaar',
                name: 'MalwareBazaar',
                shortcut: 'b',
                apiMode: true,
                defaultEnabled: true
            }
        ],
        file: [
            {
                id: 'virustotal',
                name: 'VirusTotal',
                shortcut: 'v',
                urlTemplate: `https://www.virustotal.com/gui/search/${FishBowlConsts.VALUE_PLACEHOLDER}`,
                defaultEnabled: true,
                loadSelectors: ['#engine-text-0'],
                notFoundSelectors: [FishBowlConsts.VIRUSTOTAL_NOT_FOUND_SELECTOR]

            }
        ],
        asn: [
            {
                id: 'ipinfo',
                name: 'IPinfo',
                shortcut: 'i',
                urlTemplate: `https://ipinfo.io/${FishBowlConsts.VALUE_PLACEHOLDER}`,
                defaultEnabled: true,
                loadSelectors: ['#summary']
            }
        ]
    },

    // Filter the services based on enabled settings
    ALL_SERVICES: [
        {
            id: 'virustotal',
            name: 'VirusTotal',
            url: `https://www.virustotal.com/gui/search/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            enabled: false,
            loadSelectors: [
                '#engine-text-0'
            ],
            notFoundSelectors: [FishBowlConsts.VIRUSTOTAL_NOT_FOUND_SELECTOR]
        },
        {
            id: 'ipinfo',
            name: 'IPinfo',
            url: `https://ipinfo.io/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            enabled: true,
            loadSelectors: []
        },
        {
            id: 'abuseipdb',
            name: 'AbuseIPDB',
            url: `https://www.abuseipdb.com/check/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            enabled: true,
            loadSelectors: []
        },
        {
            id: 'alienvault',
            name: 'AlienVault OTX',
            url: `https://otx.alienvault.com/indicator/ip/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            enabled: false,
            loadSelectors: ['.pulse-list']
        },
        {
            id: 'greynoise',
            name: 'GreyNoise',
            url: `https://www.greynoise.io/viz/ip/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            enabled: false,
            loadSelectors: ['.v-popper.v-popper--theme-tooltip']
        },
        {
            id: 'whois',
            name: 'Whois',
            url: `https://whois.domaintools.com/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            enabled: false,
            loadSelectors: []
        },
        {
            id: 'spur',
            name: 'Spur',
            url: `https://app.spur.us/search?q=${FishBowlConsts.VALUE_PLACEHOLDER}`,
            enabled: false,
            loadSelectors: ['div.col-span-1:nth-child(2) > div:nth-child(1) > div:nth-child(1)'],
            notFoundSelectors: ['.cl-logoBox']
        },
        {
            id: 'shodan',
            name: 'Shodan',
            url: `https://www.shodan.io/host/${FishBowlConsts.VALUE_PLACEHOLDER}`,
            enabled: false,
            loadSelectors: []
        }
    ]
};

FishBowlConfig.validateSettings = function validateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        throw new Error('Invalid settings: expected object');
    }

    const requireBool = (key) => {
        if (typeof settings[key] !== 'boolean') {
            throw new Error(`Invalid settings: ${key} must be boolean`);
        }
    };

    requireBool('scanIpAddresses');
    requireBool('scanEventIds');
    requireBool('scanSids');
    requireBool('scanAsn');
    requireBool('scanDomains');
    requireBool('scanHashes');
    requireBool('scanFiles');
    if (typeof settings.showEventDescriptions !== 'boolean') {
        settings.showEventDescriptions = false;
    }
    requireBool('showEventDescriptions');
    if (typeof settings.textareaInspectOverlayEnabled !== 'boolean') {
        settings.textareaInspectOverlayEnabled = false;
    }
    requireBool('textareaInspectOverlayEnabled');
    requireBool('textareaInspectOverlayDefault');
    requireBool('textareaInspectOverlayHoldToShow');
    requireBool('showVisualUpdates');
    requireBool('showActivityFeed');
    requireBool('showPanelHeaders');

    if (typeof settings.animateActivityFeedText !== 'boolean') {
        settings.animateActivityFeedText = true;
    }
    requireBool('animateActivityFeedText');

    requireBool('enableCache');
    requireBool('useDomainWhitelist');

    if (!Array.isArray(settings.domainWhitelist)) {
        throw new Error('Invalid settings: domainWhitelist must be an array');
    }
    if (!Array.isArray(settings.cspBackendOverrideDomains)) {
        throw new Error('Invalid settings: cspBackendOverrideDomains must be an array');
    }

    if (typeof settings.infoPanelOpacity !== 'number' || !Number.isFinite(settings.infoPanelOpacity)) {
        throw new Error('Invalid settings: infoPanelOpacity must be a finite number');
    }

    if (settings.theme !== 'dark' && settings.theme !== 'light') {
        throw new Error('Invalid settings: theme must be "dark" or "light"');
    }

    if (!settings.reputationServices || typeof settings.reputationServices !== 'object') {
        throw new Error('Invalid settings: reputationServices must be object');
    }
    for (const t of ['ip', 'domain', 'hash', 'file', 'asn']) {
        const map = settings.reputationServices[t];
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
            throw new Error(`Invalid settings: reputationServices.${t} must be object`);
        }
        for (const [svcId, enabled] of Object.entries(map)) {
            if (typeof enabled !== 'boolean') {
                throw new Error(`Invalid settings: reputationServices.${t}.${svcId} must be boolean`);
            }
        }
    }

    if (!settings.hudPanelPositionsByDomain || typeof settings.hudPanelPositionsByDomain !== 'object') {
        throw new Error('Invalid settings: hudPanelPositionsByDomain must be object');
    }
    if (!settings.hudPanelVisibilityByDomain || typeof settings.hudPanelVisibilityByDomain !== 'object') {
        throw new Error('Invalid settings: hudPanelVisibilityByDomain must be object');
    }

    return true;
};

FishBowlConfig.getReputationServiceDefs = function getReputationServiceDefs(entityType) {
    const t = (entityType || '').toString().trim().toLowerCase();
    return FishBowlConfig.REPUTATION_SERVICE_DEFS[t] || [];
};

FishBowlConfig.getDashboardServices = function getDashboardServices() {
    return FishBowlConfig.ALL_SERVICES || [];
};

globalThis.FishBowlConsts = FishBowlConsts;
globalThis.FishBowlConfig = FishBowlConfig;
if (typeof window !== 'undefined') {
    window.FishBowlConsts = FishBowlConsts;
    window.FishBowlConfig = FishBowlConfig;
}
