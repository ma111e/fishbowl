/**
 * FishBowl Security Extension - DOM Highlight Utilities
 * Shared helpers for highlight planning, pattern construction, and overlay indicator cache.
 */
(function () {
    const TYPE_TO_HIGHLIGHT_CLASS = Object.freeze({
        ip: 'fishbowl-ip-highlight',
        asn: 'fishbowl-asn-highlight',
        domain: 'fishbowl-domain-highlight',
        event: 'fishbowl-event-highlight',
        sid: 'fishbowl-sid-highlight',
        hash: 'fishbowl-hash-highlight',
        file: 'fishbowl-file-highlight'
    });

    const OVERLAY_COLLECTION_CONFIG = Object.freeze([
        {
            type: 'ip',
            settingKey: 'scanIpAddresses',
            resultKey: 'ipAddresses',
            readValue: (entry) => entry?.ip
        },
        {
            type: 'sid',
            settingKey: 'scanSids',
            resultKey: 'sids',
            readValue: (entry) => entry?.sid
        },
        {
            type: 'asn',
            settingKey: 'scanAsn',
            resultKey: 'asNumbers',
            readValue: (entry) => entry?.number
        },
        {
            type: 'domain',
            settingKey: 'scanDomains',
            resultKey: 'domains',
            readValue: (entry) => entry?.domain
        },
        {
            type: 'event',
            settingKey: 'scanEventIds',
            resultKey: 'windowsEvents',
            fallbackResultKey: 'events',
            readValue: (entry) => entry?.eventId
        },
        {
            type: 'hash',
            settingKey: 'scanHashes',
            resultKey: 'hashes',
            readValue: (entry) => entry?.value
        },
        {
            type: 'file',
            settingKey: 'scanFiles',
            resultKey: 'files',
            readValue: (entry) => entry?.file
        }
    ]);

    function escapeRegex(value) {
        return (value || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function getHighlightCssClass(type) {
        const normalized = (type || '').toString().trim().toLowerCase();
        return TYPE_TO_HIGHLIGHT_CLASS[normalized] || TYPE_TO_HIGHLIGHT_CLASS.event;
    }

    function buildPattern(type, content) {
        const normalizedType = (type || '').toString().trim().toLowerCase();
        const raw = (content || '').toString();
        if (!raw) return null;

        switch (normalizedType) {
            case 'ip': {
                const octets = raw.split('.');
                if (octets.length !== 4) {
                    return new RegExp(`\\b${escapeRegex(raw)}\\b`, 'g');
                }
                const escaped = octets.map(escapeRegex);
                const separator = '(?:\\.|\\[\\.\\])';
                return new RegExp(`\\b${escaped.join(separator)}\\b`, 'g');
            }
            case 'domain': {
                const parts = raw.split('.');
                if (parts.length < 2) {
                    return new RegExp(`\\b${escapeRegex(raw)}\\b`, 'gi');
                }
                const escaped = parts.map(escapeRegex);
                const separator = '(?:\\.|\\[\\.\\])';
                return new RegExp(`\\b${escaped.join(separator)}\\b`, 'gi');
            }
            case 'file':
                return new RegExp(escapeRegex(raw), 'gi');
            case 'hash':
                return new RegExp(`\\b${escapeRegex(raw)}\\b`, 'gi');
            case 'asn':
            case 'event':
            case 'sid':
            default:
                return new RegExp(`\\b${escapeRegex(raw)}\\b`, 'g');
        }
    }

    function collectOverlayIndicatorValues(analysisResults, settings) {
        const values = [];

        OVERLAY_COLLECTION_CONFIG.forEach((config) => {
            if (!settings?.[config.settingKey]) {
                return;
            }

            const primary = analysisResults?.[config.resultKey];
            const fallback = config.fallbackResultKey ? analysisResults?.[config.fallbackResultKey] : null;
            const source = Array.isArray(primary) ? primary : Array.isArray(fallback) ? fallback : [];

            source.forEach((entry) => {
                const value = config.readValue(entry);
                if (!value) {
                    return;
                }
                values.push({
                    type: config.type,
                    value: value.toString()
                });
            });
        });

        return values;
    }

    function buildHighlightJobs(analysisResults, settings) {
        const jobs = [];

        if (settings?.scanIpAddresses && Array.isArray(analysisResults?.ipAddresses)) {
            analysisResults.ipAddresses.forEach((addr) => {
                if (!addr?.ip) return;
                jobs.push({
                    type: 'ip',
                    content: addr.ip.toString(),
                    metadata: {
                        verdict: addr.verdict,
                        score: addr.score || '',
                        cssClass: addr.verdict ? `fishbowl-verdict-${addr.verdict}` : '',
                        title: `IP: ${addr.ip} | verdict: ${addr.verdict} | Score: ${addr.score || 'N/A'}`,
                        cachedData: addr.cachedData
                    }
                });
            });
        }

        if (settings?.scanAsn && Array.isArray(analysisResults?.asNumbers)) {
            analysisResults.asNumbers.forEach((asn) => {
                if (!asn?.number) return;
                jobs.push({
                    type: 'asn',
                    content: asn.number.toString(),
                    metadata: {
                        name: asn.name || '',
                        cssClass: 'asn',
                        title: `ASN: ${asn.number}${asn.name ? ` | ${asn.name}` : ''}`,
                        cachedData: asn.cachedData
                    }
                });
            });
        }

        if (settings?.scanDomains && Array.isArray(analysisResults?.domains)) {
            analysisResults.domains.forEach((domain) => {
                if (!domain?.domain) return;
                const verdict = (domain?.verdict || '').toString().trim();
                const category = (domain?.category || '').toString().trim();
                jobs.push({
                    type: 'domain',
                    content: domain.domain.toString(),
                    metadata: {
                        verdict,
                        category,
                        cssClass: verdict ? `fishbowl-verdict-${verdict}` : '',
                        title: `Domain: ${domain.domain} | Verdict: ${verdict || 'None'} | Category: ${category || 'None'}`,
                        cachedData: domain.cachedData
                    }
                });
            });
        }

        const events = Array.isArray(analysisResults?.windowsEvents)
            ? analysisResults.windowsEvents
            : Array.isArray(analysisResults?.events)
                ? analysisResults.events
                : [];
        if (settings?.scanEventIds && events.length > 0) {
            events.forEach((event) => {
                if (!event?.eventId) return;
                jobs.push({
                    type: 'event',
                    content: event.eventId.toString(),
                    metadata: {
                        description: event.description || '',
                        cssClass: 'event',
                        title: event.description || 'No description',
                        cachedData: event.cachedData,
                        badges: (settings?.showEventDescriptions && event.description)
                            ? ['eventdesc:' + event.description]
                            : []
                    }
                });
            });
        }

        if (settings?.scanSids && Array.isArray(analysisResults?.sids)) {
            analysisResults.sids.forEach((sid) => {
                if (!sid?.sid) return;
                jobs.push({
                    type: 'sid',
                    content: sid.sid.toString(),
                    metadata: {
                        description: sid.description || '',
                        cssClass: 'sid',
                        title: sid.description || 'Unknown SID',
                        cachedData: sid.cachedData
                    }
                });
            });
        }

        if (settings?.scanHashes && Array.isArray(analysisResults?.hashes)) {
            analysisResults.hashes.forEach((hash) => {
                if (!hash?.value) return;
                const cachedVerdict = hash?.cachedData?.worstVerdict;
                const badges = Array.isArray(hash.badges) ? hash.badges : [];
                jobs.push({
                    type: 'hash',
                    content: hash.value.toString(),
                    metadata: {
                        cssClass: cachedVerdict ? `fishbowl-verdict-${cachedVerdict}` : 'hash',
                        title: cachedVerdict
                            ? `${(hash.kind || 'hash').toString().toUpperCase()}: ${hash.value} | Verdict: ${cachedVerdict}`
                            : `${(hash.kind || 'hash').toString().toUpperCase()}: ${hash.value}`,
                        badges,
                        cachedData: hash.cachedData
                    }
                });
            });
        }

        if (settings?.scanFiles && Array.isArray(analysisResults?.files)) {
            analysisResults.files.forEach((file) => {
                if (!file?.file) return;
                const cachedVerdict = file?.cachedData?.worstVerdict;
                const badges = Array.isArray(file.badges) ? file.badges : [];
                jobs.push({
                    type: 'file',
                    content: file.file.toString(),
                    metadata: {
                        cssClass: cachedVerdict ? `fishbowl-verdict-${cachedVerdict}` : 'file',
                        title: cachedVerdict
                            ? `File: ${file.file} | Verdict: ${cachedVerdict}`
                            : `File: ${file.file}`,
                        badges,
                        cachedData: file.cachedData
                    }
                });
            });
        }

        return jobs;
    }

    window.FishBowlDomHighlighterUtils = window.FishBowlDomHighlighterUtils || {
        getHighlightCssClass,
        buildPattern,
        collectOverlayIndicatorValues,
        buildHighlightJobs
    };
})();
