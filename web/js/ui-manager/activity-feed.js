/**
 * FishBowl Security Extension - UI Manager Activity Feed
 * Handles activity feed rendering, auto-expiry, and pointer-events management.
 */

class FishBowlActivityFeed {
    constructor(opts) {
        this.opts = opts || {};
        this.entries = [];
        this.expiryTimerId = null;
        this.expiryInProgress = false;
        this.hideTimerId = null;
        this.TIMEOUT_MS = (opts.timeoutMs != null) ? opts.timeoutMs : 5000;
    }

    /**
     * Returns the shadow root where HUD elements live, or document as fallback.
     */
    getRoot() {
        return window.fishTankHUD?.hudShadowRoot || document;
    }

    addEntry(message, type = "info") {
        const feed = this.getRoot().getElementById('activity-feed');
        if (!feed) return;

        const entry = document.createElement('div');
        entry.className = `feed-item feed-${type}`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'feed-time';
        timeSpan.textContent = new Date().toLocaleTimeString();

        const msgSpan = document.createElement('span');
        msgSpan.className = 'feed-msg';
        msgSpan.textContent = '';

        entry.appendChild(timeSpan);
        entry.appendChild(msgSpan);

        if (this.shouldAnimateText()) {
            this.applyTypewriter(msgSpan, message);
        } else {
            msgSpan.textContent = message;
            msgSpan.classList.add('feed-msg-done');
        }

        feed.prepend(entry);

        this.entries.unshift({
            el: entry,
            expireAt: Date.now() + this.TIMEOUT_MS,
        });

        // Keep only last 10 entries
        while (feed.children.length > 10) {
            const removed = feed.lastChild;
            feed.removeChild(removed);
            this.entries = this.entries.filter(e => e && e.el && e.el !== removed);
        }

        // Also log to our persistent storage via the logging service
        let logType = 'info';
        if (type === 'warning') logType = 'warning';
        if (type === 'error') logType = 'error';

        if (window.FishBowlLogService) {
            window.FishBowlLogService[logType](message);
        }

        // Keep newest entry visible at the top
        feed.scrollTop = 0;

        this.updatePointerEvents();
        this.scheduleExpiry();
    }

    shouldAnimateText() {
        return window.fishTankHUD?.settings?.animateActivityFeedText !== false;
    }

    scheduleExpiry() {
        try {
            if (this.expiryInProgress) {
                return;
            }

            if (this.expiryTimerId) {
                clearTimeout(this.expiryTimerId);
                this.expiryTimerId = null;
            }

            if (!Array.isArray(this.entries) || this.entries.length === 0) {
                try {
                    this.updatePointerEvents();
                } catch (e) {
                    console.warn('[FishBowl ActivityFeed] Failed to update activity feed visibility while empty', e);
                }
                return;
            }

            const now = Date.now();
            const nextExpireAt = this.entries
                .map(e => e?.expireAt)
                .filter(t => Number.isFinite(t))
                .reduce((min, t) => Math.min(min, t), Number.POSITIVE_INFINITY);

            if (!Number.isFinite(nextExpireAt) || nextExpireAt === Number.POSITIVE_INFINITY) {
                return;
            }

            const delay = Math.max(0, nextExpireAt - now);
            this.expiryTimerId = setTimeout(() => {
                this.expiryTimerId = null;
                this.runExpiryBatch();
            }, delay);
        } catch (e) {
            console.warn('[FishBowl ActivityFeed] Failed to schedule activity feed expiry', e);
        }
    }

    runExpiryBatch() {
        try {
            if (this.expiryInProgress) {
                return;
            }

            const feed = this.getRoot().getElementById('activity-feed');
            if (!feed) {
                return;
            }

            const now = Date.now();
            const batchWindowMs = 300;
            const staggerMs = 100;
            const exitDurationMs = 300;

            const due = this.entries
                .filter(e => e && e.el && e.el.parentNode && Number.isFinite(e.expireAt))
                .filter(e => e.expireAt <= (now + batchWindowMs));

            if (due.length === 0) {
                this.scheduleExpiry();
                return;
            }

            // Oldest entries are at the bottom; they should exit first.
            due.sort((a, b) => {
                if (a.expireAt !== b.expireAt) {
                    return a.expireAt - b.expireAt;
                }

                try {
                    const aIndex = Array.from(feed.children).indexOf(a.el);
                    const bIndex = Array.from(feed.children).indexOf(b.el);
                    return bIndex - aIndex;
                } catch (e) {
                    console.warn('[FishBowl ActivityFeed] Failed to compare feed entry positions', e);
                    return 0;
                }
            });

            this.expiryInProgress = true;

            due.forEach((item, idx) => {
                const startDelay = idx * staggerMs;
                setTimeout(() => {
                    try {
                        if (!item?.el || !item.el.parentNode) {
                            return;
                        }

                        try {
                            const h = item.el.scrollHeight || item.el.offsetHeight;
                            if (Number.isFinite(h) && h > 0) {
                                item.el.style.maxHeight = `${h}px`;
                                item.el.style.overflow = 'hidden';
                                // Force a reflow so the browser applies maxHeight before we collapse.
                                void item.el.offsetHeight;
                            }
                        } catch (e) {
                            console.warn('[FishBowl ActivityFeed] Failed to snapshot feed item height for collapse', e);
                        }

                        item.el.classList.add('feed-item-fade-out');

                        setTimeout(() => {
                            try {
                                if (item?.el && item.el.parentNode) {
                                    item.el.parentNode.removeChild(item.el);
                                }

                                this.entries = this.entries
                                    .filter(e => e && e.el && e.el !== item.el);

                                this.updatePointerEvents();
                            } catch (e) {
                                console.warn('[FishBowl ActivityFeed] Failed to remove expired feed entry', e);
                            }
                        }, exitDurationMs);
                    } catch (e) {
                        console.warn('[FishBowl ActivityFeed] Failed to start feed entry exit animation', e);
                    }
                }, startDelay);
            });

            const totalBatchMs = ((due.length - 1) * staggerMs) + exitDurationMs;
            setTimeout(() => {
                try {
                    this.expiryInProgress = false;
                    this.scheduleExpiry();
                } catch (e) {
                    console.warn('[FishBowl ActivityFeed] Failed to finalize activity feed expiry batch', e);
                }
            }, totalBatchMs + 10);
        } catch (e) {
            console.warn('[FishBowl ActivityFeed] Failed to run activity feed expiry batch', e);
            this.expiryInProgress = false;
            this.scheduleExpiry();
        }
    }

    /**
     * Sci-fi typewriter: types each character one-by-one with a brief glitch
     * frame showing a random symbol before settling on the real character.
     * Total duration scales with message length: ~28ms/char, capped 350-1600ms.
     */
    applyTypewriter(element, text) {
        const GLITCH = '▓█▒░╬╪╫╩╦╣║╠═╔╗╚╝┼┤├┬┴─│+*#@!?<>/\\|~^%$&';
        const charCount = text.length;

        if (charCount === 0) {
            element.textContent = '';
            return;
        }

        // Per-character interval; total duration capped so short msgs feel punchy
        // const totalMs = Math.max(350, Math.min(1600, charCount * 28));
        const totalMs = Math.max(350, Math.min(1600, charCount * 28));
        const intervalMs = totalMs / charCount;
        const glitchMs = Math.max(18, Math.floor(intervalMs * 0.38));
        const settleMs = intervalMs - glitchMs;

        element.classList.add('feed-msg-typing');
        element.textContent = '';

        let i = 0;

        const step = () => {
            if (i >= charCount) {
                element.textContent = text;
                element.classList.remove('feed-msg-typing');
                element.classList.add('feed-msg-done');
                return;
            }

            // Glitch frame: real prefix + one random symbol
            const rnd = GLITCH[Math.floor(Math.random() * GLITCH.length)];
            element.textContent = text.slice(0, i) + rnd;

            setTimeout(() => {
                // Settle on the real character
                element.textContent = text.slice(0, i + 1);
                i++;
                setTimeout(step, settleMs);
            }, glitchMs);
        };

        step();
    }

    updatePointerEvents() {
        const feed = this.getRoot().getElementById('activity-feed');
        if (!feed) return;

        const hideDelayMs = 250;

        if (feed.children.length > 0) {
            if (this.hideTimerId) {
                clearTimeout(this.hideTimerId);
                this.hideTimerId = null;
            }

            feed.style.pointerEvents = 'auto';
            feed.hidden = false;
            feed.classList.remove('fishbowl-feed-hidden');
        } else {
            feed.style.pointerEvents = 'none';
            feed.classList.add('fishbowl-feed-hidden');

            if (!this.hideTimerId) {
                this.hideTimerId = setTimeout(() => {
                    this.hideTimerId = null;
                    try {
                        const currentFeed = this.getRoot().getElementById('activity-feed');
                        if (!currentFeed) return;
                        if (currentFeed.children.length > 0) return;
                        if (!currentFeed.classList.contains('fishbowl-feed-hidden')) return;
                        currentFeed.hidden = true;
                    } catch (e) {
                        console.warn('[FishBowl ActivityFeed] Failed to finalize activity feed hide', e);
                    }
                }, hideDelayMs);
            }
        }
    }
}

window.FishBowlActivityFeed = FishBowlActivityFeed;
