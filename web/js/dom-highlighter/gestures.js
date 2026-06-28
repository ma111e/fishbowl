/**
 * FishBowl Security Extension - DOM Highlight Gestures
 * Encapsulates the pull-down gesture handling and indicator rendering.
 */

class FishBowlGestureHandler {
    constructor(opts) {
        this.opts = opts || {};
    }

    showPullDownIndicator(distance, mouseTracker) {
        this.removePullDownIndicator();

        const minPullDistance = mouseTracker?.minPullDistance || 30;
        const cappedDistance = Math.min(distance, minPullDistance * 2);
        const progress = Math.min(cappedDistance / minPullDistance, 1);

        const indicator = document.createElement('div');
        indicator.id = 'fishbowl-pull-indicator';
        indicator.classList.add('fishbowl-pull-indicator-bg');
        indicator.style.background = `linear-gradient(90deg, transparent, rgba(59,182,246, ${progress}), transparent)`;

        if (progress > 0.5) {
            const text = document.createElement('div');
            text.classList.add('fishbowl-pull-release-text');
            text.style.background = `rgba(59,182,246, ${progress})`;
            text.textContent = 'Release to show details';
            indicator.appendChild(text);
        }

        const root = window.fishTankHUD?.hudShadowRoot || document.body;
        root.appendChild(indicator);
    }

    removePullDownIndicator() {
        const root = window.fishTankHUD?.hudShadowRoot || document.body;
        const indicator = root.querySelector('#fishbowl-pull-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    handleMouseDown(e, mouseTracker) {
        const path = e.composedPath ? e.composedPath() : [e.target];
        const target = path.find(el => el && el.classList && el.classList.contains('fishbowl-highlight'));

        if (target) {
            const ip = target.getAttribute('data-content');
            if (!ip) return;

            mouseTracker.isMouseDown = true;
            mouseTracker.startElement = target;
            mouseTracker.startY = e.clientY;
            mouseTracker.currentY = e.clientY;
            mouseTracker.isTracking = true;
            mouseTracker.targetIp = ip;

            e.preventDefault();
        }
    }

    handleMouseMove(e, mouseTracker) {
        if (e.buttons & 2) return;
        if (!mouseTracker.isMouseDown || !mouseTracker.isTracking) return;

        mouseTracker.currentY = e.clientY;
        const distance = mouseTracker.currentY - mouseTracker.startY;
        const absDistance = Math.abs(distance);

        if (absDistance < mouseTracker.minTravelThreshold) {
            return;
        }

        if (distance > 0) {
            mouseTracker.isPulling = true;
            this.showPullDownIndicator(distance, mouseTracker);
        } else {
            if (mouseTracker.isPulling) {
                this.removePullDownIndicator();
                mouseTracker.isPulling = false;
            }
        }
    }

    handleMouseUp(mouseTracker) {
        if (!mouseTracker.isTracking) return;

        const distance = mouseTracker.currentY - mouseTracker.startY;
        const absDistance = Math.abs(distance);

        if (absDistance >= mouseTracker.minTravelThreshold && mouseTracker.isPulling) {
            if (distance >= mouseTracker.minPullDistance) {
                const element = mouseTracker.startElement;
                const ip = mouseTracker.targetIp;

                const resultsString = element ? element.getAttribute('data-results') : null;
                const verdict = element ? (element.getAttribute('data-verdict') || 'unknown') : 'unknown';

                if (resultsString) {
                    try {
                        const results = JSON.parse(resultsString);
                        if (typeof this.opts.onTrigger === 'function') {
                            this.opts.onTrigger(ip, results, verdict, element);
                        }
                    } catch (error) {
                        console.error('Error parsing results data:', error);
                    }
                } else {
                    if (typeof this.opts.onMissingResults === 'function') {
                        this.opts.onMissingResults(ip);
                    }
                }
            }
        }

        this.removePullDownIndicator();

        mouseTracker.isMouseDown = false;
        mouseTracker.startElement = null;
        mouseTracker.isTracking = false;
        mouseTracker.isPulling = false;
        mouseTracker.targetIp = null;
    }
}

window.FishBowlGestureHandler = FishBowlGestureHandler;
