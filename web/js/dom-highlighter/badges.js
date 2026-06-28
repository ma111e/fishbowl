/**
 * FishBowl Security Extension - DOM Highlight Badges
 * Handles IP classification and badge rendering for highlights.
 */

class FishBowlBadgeManager {
    constructor() {
        this.badgeAbbreviations = {
            private: 'prv',
            bogon: 'bog',
            airplane: 'pln',
            airport: 'air',
            anycast: 'any',
            bittorrent: 'btt',
            cdn: 'cdn',
            cloud: 'cld',
            crawler: 'crw',
            geodns: 'geo',
            hosting: 'hst',
            hotspot: 'hot',
            ix: 'ix',
            mailserver: 'eml',
            mobile: 'mob',
            nameserver: 'dns',
            portscan: 'psc',
            proxy: 'prx',
            relay: 'rel',
            resolver: 'rsv',
            router: 'rtr',
            satellite: 'sat',
            ssh: 'ssh',
            tor: 'tor',
            vpn: 'vpn',
            webserver: 'web',
            known: 'built-in',
            'known-file': 'built-in ?'
        };

        this.badgeDisplayNames = {
            private: 'Private',
            bogon: 'Bogon',
            airplane: 'Airplane',
            airport: 'Airport',
            anycast: 'Anycast',
            bittorrent: 'BitTorrent',
            cdn: 'CDN',
            cloud: 'Cloud',
            crawler: 'Crawler',
            geodns: 'GeoDNS',
            hosting: 'Hosting',
            hotspot: 'Hotspot',
            ix: 'IX',
            mailserver: 'Mail Server',
            mobile: 'Mobile',
            nameserver: 'DNS Server',
            portscan: 'Port Scan',
            proxy: 'Proxy',
            relay: 'Relay',
            resolver: 'Resolver',
            router: 'Router',
            satellite: 'Satellite',
            ssh: 'SSH',
            tor: 'Tor',
            vpn: 'VPN',
            webserver: 'Web Server',
            known: 'Built-in OS/vendor binary',
            'known-file': 'Built-in OS/vendor binary'
        };

        this.badgeUrls = {
            private: 'https://en.wikipedia.org/wiki/Private_network',
            bogon: 'https://www.apnic.net/manage-ip/apnic-services/registration-services/resource-quality-assurance/what-is-a-bogon-address/',
            airplane: 'https://ipinfo.io/tags/airplane',
            airport: 'https://ipinfo.io/tags/airport',
            anycast: 'https://ipinfo.io/tags/anycast',
            bittorrent: 'https://ipinfo.io/tags/bittorrent',
            cdn: 'https://ipinfo.io/tags/cdn',
            cloud: 'https://ipinfo.io/tags/cloud',
            crawler: 'https://ipinfo.io/tags/crawler',
            geodns: 'https://ipinfo.io/tags/geodns',
            hosting: 'https://ipinfo.io/tags/hosting',
            hotspot: 'https://ipinfo.io/tags/hotspot',
            ix: 'https://ipinfo.io/tags/ix',
            mailserver: 'https://ipinfo.io/tags/mailserver',
            mobile: 'https://ipinfo.io/tags/mobile',
            nameserver: 'https://ipinfo.io/tags/nameserver',
            portscan: 'https://ipinfo.io/tags/portscan',
            proxy: 'https://ipinfo.io/tags/proxy',
            relay: 'https://ipinfo.io/tags/relay',
            resolver: 'https://ipinfo.io/tags/resolver',
            router: 'https://ipinfo.io/tags/router',
            satellite: 'https://ipinfo.io/tags/satellite',
            ssh: 'https://ipinfo.io/tags/ssh',
            tor: 'https://ipinfo.io/tags/tor',
            vpn: 'https://ipinfo.io/tags/vpn',
            webserver: 'https://ipinfo.io/tags/webserver'
        };
    }

    countryCodeToFlagEmoji(cc) {
        if (typeof cc !== 'string' || cc.length !== 2) return '';
        const code = cc.toUpperCase();
        const offset = 0x1F1E6 - 65; // Regional Indicator Symbol Letter A
        return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
    }

    sanitizeCountryName(countryName, flagEmoji) {
        if (typeof countryName !== 'string') return '';

        let cleaned = countryName;
        if (typeof flagEmoji === 'string' && flagEmoji.trim()) {
            cleaned = cleaned.replaceAll(flagEmoji.trim(), ' ');
        }

        cleaned = cleaned.replace(/\p{Regional_Indicator}{2}/gu, ' ');
        cleaned = cleaned.replace(/[\r\n\t]+/g, ' ');
        cleaned = cleaned.replace(/\s{2,}/g, ' ');

        return cleaned.trim();
    }

    parseCountryFlagBadge(badgeType) {
        if (typeof badgeType !== 'string') return null;
        if (!badgeType.startsWith('flag:')) return null;

        const parts = badgeType.split(':');
        if (parts.length < 3) return null;

        const flag = parts[1];
        const countryNameRaw = parts.slice(2).join(':');
        const countryName = this.sanitizeCountryName(countryNameRaw, flag);

        if (!flag || !countryName) return null;
        return { flag, countryName };
    }

    isPrivateIP(ip) {
        const parts = ip.split('.');
        if (parts.length !== 4) return false;

        if (parts[0] === '10') return true;
        if (parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) return true;
        if (parts[0] === '192' && parts[1] === '168') return true;
        if (parts[0] === '169' && parts[1] === '254') return true;

        return false;
    }

    isBogonIP(ip) {
        if (this.isPrivateIP(ip)) return true;

        const parts = ip.split('.');
        if (parts.length !== 4) return false;

        if (parts[0] === '0') return true;
        if (parts[0] === '127') return true;

        const p0 = parseInt(parts[0]);
        if (p0 >= 224 && p0 <= 239) return true;
        if (p0 >= 240 && p0 <= 255) return true;

        const p1 = parseInt(parts[1]);
        if (parts[0] === '100' && p1 >= 64 && p1 <= 127) return true;

        if (parts[0] === '192' && parts[1] === '0' && parts[2] === '0') return true;

        if ((parts[0] === '192' && parts[1] === '0' && parts[2] === '2') ||
            (parts[0] === '198' && parts[1] === '51' && parts[2] === '100') ||
            (parts[0] === '203' && parts[1] === '0' && parts[2] === '113')) return true;

        return false;
    }

    addIpTypeTags(ip, highlight) {
        const isPrivate = this.isPrivateIP(ip);
        const isBogon = !isPrivate && this.isBogonIP(ip);

        const currentTags = highlight.getAttribute('data-badges') || '';
        const tagsArray = currentTags ? JSON.parse(currentTags) : [];

        if (isPrivate) {
            if (!tagsArray.includes('private')) {
                tagsArray.push('private');
            }
        }

        if (isBogon) {
            if (!tagsArray.includes('bogon')) {
                tagsArray.push('bogon');
            }
        }

        highlight.setAttribute('data-badges', JSON.stringify(tagsArray));
    }

    addTextBadges(highlight) {
        const existingBadges = highlight.nextElementSibling;
        if (existingBadges && existingBadges.classList && existingBadges.classList.contains('fishbowl-badges-container')) {
            existingBadges.remove();
        }

        const badges = highlight.getAttribute('data-badges');
        const badgesArray = badges ? JSON.parse(badges) : [];

        if (badgesArray.length === 0) return;

        const vtBadges = [];
        const abuseIpdbBadges = [];
        const spurBadges = [];
        const flagBadges = [];
        const orgBadges = [];
        const typeBadges = [];
        const otherBadges = [];

        badgesArray.forEach(badgeType => {
            if (typeof badgeType === 'string' && badgeType.startsWith('vt:')) {
                vtBadges.push(badgeType);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('abuseipdb:')) {
                abuseIpdbBadges.push(badgeType);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('spur:')) {
                spurBadges.push(badgeType);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('flag:')) {
                flagBadges.push(badgeType);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('org:')) {
                orgBadges.push(badgeType);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('type:')) {
                typeBadges.push(badgeType);
                return;
            }

            otherBadges.push(badgeType);
        });

        const orderedBadges = [...vtBadges, ...abuseIpdbBadges, ...spurBadges, ...flagBadges, ...orgBadges, ...typeBadges, ...otherBadges];

        const badgesContainer = document.createElement('span');
        badgesContainer.className = 'fishbowl-badges-container text-badges';

        orderedBadges.forEach(badgeType => {
            if (typeof badgeType === 'string' && badgeType.startsWith('vt:')) {
                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'fishbowl-text-badge fishbowl-vt-badge';
                badgeSpan.title = 'VirusTotal detection ratio';
                badgeSpan.textContent = badgeType.slice('vt:'.length);
                badgesContainer.appendChild(badgeSpan);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('abuseipdb:')) {
                const payload = badgeType.slice('abuseipdb:'.length);
                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'fishbowl-text-badge fishbowl-abuseipdb-badge';
                badgeSpan.title = payload === 'WL' ? 'AbuseIPDB whitelisted' : 'AbuseIPDB confidence of abuse';
                badgeSpan.textContent = payload;
                badgesContainer.appendChild(badgeSpan);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('type:')) {
                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'fishbowl-text-badge fishbowl-type-badge';
                badgeSpan.title = 'ASN type';
                badgeSpan.textContent = badgeType.slice('type:'.length);
                badgesContainer.appendChild(badgeSpan);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('spur:')) {
                // Format: spur:OPERATOR:iconUrl
                const rest = badgeType.slice('spur:'.length);
                const colonIdx = rest.indexOf(':');
                const operator = colonIdx >= 0 ? rest.slice(0, colonIdx) : rest;
                const iconUrl = colonIdx >= 0 ? rest.slice(colonIdx + 1) : '';

                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'fishbowl-text-badge fishbowl-spur-badge';
                badgeSpan.title = operator;

                if (iconUrl) {
                    const img = document.createElement('img');
                    img.src = iconUrl;
                    img.alt = '';
                    img.style.cssText = 'width:14px;height:14px;vertical-align:middle;margin-right:4px;border-radius:2px;';
                    badgeSpan.appendChild(img);
                }

                const text = document.createTextNode(operator);
                badgeSpan.appendChild(text);
                badgesContainer.appendChild(badgeSpan);
                return;
            }

            if (typeof badgeType === 'string' && badgeType.startsWith('org:')) {
                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'fishbowl-text-badge fishbowl-org-badge';
                badgeSpan.title = 'Organization';
                badgeSpan.textContent = badgeType.slice('org:'.length);
                badgesContainer.appendChild(badgeSpan);
                return;
            }

            if (badgeType === 'known' || badgeType === 'known-file') {
                const badgeLink = document.createElement('a');
                badgeLink.href = 'https://strontic.github.io/xcyclopedia/';
                badgeLink.target = '_blank';
                badgeLink.rel = 'noopener noreferrer';
                badgeLink.className = 'fishbowl-text-badge fishbowl-known-badge';
                
                const tooltipText = badgeType === 'known-file' ? this.badgeDisplayNames['known-file'] : this.badgeDisplayNames.known;
                badgeLink.title = tooltipText + ' (click for more info)';

                const iconUrl = (typeof browser !== 'undefined' && browser.runtime)
                    ? browser.runtime.getURL('icons/microsoft.png')
                    : (typeof chrome !== 'undefined' && chrome.runtime)
                        ? chrome.runtime.getURL('icons/microsoft.png')
                        : '';
                if (iconUrl) {
                    const img = document.createElement('img');
                    img.src = iconUrl;
                    img.alt = '';
                    img.style.cssText = 'width:14px;height:14px;vertical-align:middle;margin-right:4px;border-radius:2px;';
                    badgeLink.appendChild(img);
                }

                const abbrText = badgeType === 'known-file' ? this.badgeAbbreviations['known-file'] : this.badgeAbbreviations.known;
                badgeLink.appendChild(document.createTextNode(abbrText));
                badgeLink.addEventListener('click', (e) => { e.stopPropagation(); });
                badgesContainer.appendChild(badgeLink);
                return;
            }

            const countryFlagBadge = this.parseCountryFlagBadge(badgeType);
            if (countryFlagBadge) {
                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'fishbowl-text-badge';
                badgeSpan.title = countryFlagBadge.countryName;
                badgeSpan.textContent = countryFlagBadge.flag;
                badgesContainer.appendChild(badgeSpan);
                return;
            }

            const hasKnownAbbreviation = Object.prototype.hasOwnProperty.call(this.badgeAbbreviations, badgeType);
            const abbreviation = hasKnownAbbreviation ? this.badgeAbbreviations[badgeType] : '';
            const displayName = this.badgeDisplayNames[badgeType] || badgeType;
            const url = this.badgeUrls[badgeType];

            if (displayName) {
                const isEmojiBadge = /\p{Regional_Indicator}{2}/u.test(badgeType) || /\p{Extended_Pictographic}/u.test(badgeType);

                if (isEmojiBadge) {
                    const badgeSpan = document.createElement('span');
                    badgeSpan.className = 'fishbowl-text-badge';
                    badgeSpan.title = displayName === badgeType ? '' : displayName;
                    badgeSpan.textContent = badgeType;
                    badgesContainer.appendChild(badgeSpan);
                    return;
                }

                if (url) {
                    const badgeLink = document.createElement('a');
                    badgeLink.href = url;
                    badgeLink.target = '_blank';
                    badgeLink.rel = 'noopener noreferrer';
                    badgeLink.title = displayName + ' (click for more info)';
                    badgeLink.textContent = hasKnownAbbreviation ? abbreviation.toLowerCase() : displayName;
                    badgeLink.className = 'fishbowl-text-badge';
                    badgeLink.addEventListener('click', (e) => {
                        e.stopPropagation();
                    });

                    badgesContainer.appendChild(badgeLink);
                } else {
                    const badgeSpan = document.createElement('span');
                    badgeSpan.className = 'fishbowl-text-badge';
                    badgeSpan.title = displayName === badgeType ? '' : displayName;
                    badgeSpan.textContent = hasKnownAbbreviation ? abbreviation.toLowerCase() : displayName;
                    badgesContainer.appendChild(badgeSpan);
                }
            }
        });

        if (badgesContainer.children.length > 0) {
            highlight.insertAdjacentElement('afterend', badgesContainer);
        }
    }

    parseAnalysisResultForBadges(results) {
        const badges = [];

        for (const key in results) {
            if (key.toLowerCase() === 'ipinfo' && results[key].details) {
                if (results[key].details.tags) {
                    badges.push(...results[key].details.tags);
                }

                if (results[key].details.hosting) badges.push('hosting');
                if (results[key].details.mobile) badges.push('mobile');
                if (results[key].details.proxy) badges.push('proxy');
                if (results[key].details.relay) badges.push('relay');
                if (results[key].details.vpn) badges.push('vpn');
                if (results[key].details.tor) badges.push('tor');

                // ASN-specific badges from IPinfo ASN pages
                const countryCode = results[key].details.countryCode;
                const country = results[key].details.country;
                if (typeof countryCode === 'string' && countryCode.trim()) {
                    const cc = countryCode.trim().toLowerCase();
                    const flagEmoji = this.countryCodeToFlagEmoji(cc);
                    if (flagEmoji && country) {
                        badges.push(`flag:${flagEmoji}:${country}`);
                    } else if (flagEmoji) {
                        badges.push(flagEmoji);
                    }
                }

                const asnType = results[key].details.asnType;
                if (typeof asnType === 'string' && asnType.trim()) {
                    badges.push(`type:${asnType.trim()}`);
                }

                const asnName = results[key].details.asnName;
                if (typeof asnName === 'string' && asnName.trim()) {
                    badges.push(`org:${asnName.trim()}`);
                }
            }

            if (key.toLowerCase() === 'abuseipdb' && results[key].details) {
                const flag = results[key].details.countryFlagEmoji;
                const country = results[key].details.country;
                const cleanedCountry = this.sanitizeCountryName(country, flag);
                if (typeof flag === 'string' && flag.trim() && cleanedCountry) {
                    badges.push(`flag:${flag.trim()}:${cleanedCountry}`);
                } else if (typeof flag === 'string' && flag.trim()) {
                    badges.push(flag.trim());
                }

                const scoreRaw = results[key].details.abuseConfidenceScore;
                const score = (typeof scoreRaw === 'number') ? scoreRaw : parseInt(scoreRaw, 10);
                if (Number.isFinite(score)) {
                    const clamped = Math.max(0, Math.min(100, score));
                    badges.push(`abuseipdb:${clamped}%`);
                }

                if (results[key].details.isWhitelisted) {
                    badges.push('abuseipdb:WL');
                }
            }

            if (key.toLowerCase() === 'virustotal' && results[key].details && results[key].details.engineResults) {
                console.debug('Virustotal engine results:', results[key]);
                const er = results[key].details.engineResults;
                const detected = er.detected;
                const total = er.total;
                if (Number.isFinite(detected) && Number.isFinite(total) && total > 0) {
                    badges.push(`vt:${detected}/${total}`);
                } else {
                    badges.push('VT');
                }
            }

            if (key.toLowerCase() === 'spur' && results[key].details) {
                const tunnels = results[key].details.tunnels;
                if (Array.isArray(tunnels)) {
                    tunnels.forEach(t => {
                        if (t && t.operator) {
                            const iconUrl = t.iconUrl || `https://storage.googleapis.com/spur.us/website/resources/tags/logos/${t.operator}.png`;
                            badges.push(`spur:${t.operator}:${iconUrl}`);
                        }
                    });
                }
            }
        }

        return [...new Set(badges)];
    }
}

window.FishBowlBadgeManager = FishBowlBadgeManager;

