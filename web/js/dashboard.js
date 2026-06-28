/**
 * FishBowl Security Extension - IP Dashboard
 * Handles loading IP analysis services in iframes with retro UI
 * Attempts CSP byp ass via background.js
 */
document.addEventListener('DOMContentLoaded', async function () {
    // Apply the saved theme so the dashboard follows the dark/light setting.
    try {
        const { settings } = await browser.storage.local.get(['settings']);
        const theme = (settings && settings.theme === 'light') ? 'light' : 'dark';
        document.documentElement.classList.add(`fishbowl-theme-${theme}`);
    } catch (e) {
        console.warn('[FishBowl Dashboard] Failed to apply saved theme; defaulting to dark', e);
        document.documentElement.classList.add('fishbowl-theme-dark');
    }

    console.debug('Setting up expand buttons');
    document.querySelectorAll('.expand-button').forEach(button => {
        button.addEventListener('click', function () {
            const container = this.closest('.iframe-container');
            container.classList.toggle('expanded');

            if (container.classList.contains('expanded')) {
                this.textContent = '[ Collapse ]';
            } else {
                this.textContent = '[ Expand ]';
            }
        });
    });

    // Get IP from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const ip = urlParams.get('ip');

    if (!ip) {
        document.body.innerHTML = '<h1>ERROR</h1><p class="dashboard-error">[ No IP address provided ]</p>';
        return;
    }

    // Display the IP in the header
    document.getElementById('ip-display').textContent = ip;

    // Set current date in footer with retro format
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '.');
    const timeStr = now.toTimeString().slice(0, 8);
    document.getElementById('current-date').textContent = `${dateStr} | ${timeStr}`;

    // Add "accessing..." console effect
    console.debug('%c[+] FishBowl Dashboard initialized', 'color: #33ff33');
    console.debug('%c[+] Attempting CSP bypasses for external sites...', 'color: #33ff33');

    // Define services with their details
    const services = {
        virustotal: {
            frameId: 'virustotal-frame',
            errorId: 'virustotal-error',
            fallbackId: 'virustotal-fallback',
            url: `https://www.virustotal.com/gui/search/${ip}/detection`
        },
        abuseipdb: {
            frameId: 'abuseipdb-frame',
            errorId: 'abuseipdb-error',
            fallbackId: 'abuseipdb-fallback',
            url: `https://www.abuseipdb.com/check/${ip}`
        },
        alienvault: {
            frameId: 'alienvault-frame',
            errorId: 'alienvault-error',
            fallbackId: 'alienvault-fallback',
            url: `https://otx.alienvault.com/indicator/ip/${ip}`
        },
        greynoise: {
            frameId: 'greynoise-frame',
            errorId: 'greynoise-error',
            fallbackId: 'greynoise-fallback',
            url: `https://www.greynoise.io/viz/ip/${ip}`
        },
        ipinfo: {
            frameId: 'ipinfo-frame',
            errorId: 'ipinfo-error',
            fallbackId: 'ipinfo-fallback',
            url: `https://ipinfo.io/${ip}`
        },
        whois: {
            frameId: 'whois-frame',
            errorId: 'whois-error',
            fallbackId: 'whois-fallback',
            url: `https://whois.domaintools.com/${ip}`
        },
        spur: {
            frameId: 'spur-frame',
            errorId: 'spur-error',
            fallbackId: 'spur-fallback',
            url: `https://app.spur.us/search?q=${ip}`
        }
    };

    // Install per-dashboard-tab DNR session rules *before* iframes start loading.
    // If iframe requests are initiated before the session rule is active,
    // some panels will be blocked by X-Frame-Options at random.
    try {
        const seedUrl = services.abuseipdb?.url || Object.values(services)[0]?.url;
        if (seedUrl) {
            await browser.runtime.sendMessage({
                action: "bypassCSP",
                url: seedUrl,
                target: "dashboard-init"
            });
        }
    } catch (e) {
        console.warn('[Dashboard] bypassCSP preflight failed; panels may be blocked', e);
    }

    // Set up each service iframe with CSP bypass attempt
    Object.values(services).forEach(service => {
        const frame = document.getElementById(service.frameId);
        const errorDisplay = document.getElementById(service.errorId);
        const fallbackLink = document.getElementById(service.fallbackId);

        if (frame && errorDisplay && fallbackLink) {
            console.debug(`%c[>] Accessing ${service.url}`, 'color: #ffff33');

            // Set iframe source
            frame.src = service.url;

            // Set up fallback link
            fallbackLink.href = service.url;
            fallbackLink.addEventListener('click', function (e) {
                console.debug(`%c[!] Fallback to direct access: ${service.url}`, 'color: #ff3333');
                window.open(service.url, '_blank');
                e.preventDefault();
            });

            // Handle iframe load errors
            frame.addEventListener('load', function () {
                try {
                    // Try to access iframe content - will throw error if blocked by CORS
                    void frame.contentWindow.document.body;
                    console.debug(`%c[+] ${service.frameId} loaded successfully`, 'color: #33ff33');
                } catch (cspErr) {
                    console.debug(`%c[!] CSP blocked access to ${service.frameId}: ${cspErr.message}`, 'color: #ff3333');
                    errorDisplay.style.display = 'block';
                }
            });

            // Handle direct iframe errors
            frame.addEventListener('error', function () {
                console.debug(`%c[!] Failed to load ${service.frameId}`, 'color: #ff3333');
                errorDisplay.style.display = 'block';
            });
        }
    });
});