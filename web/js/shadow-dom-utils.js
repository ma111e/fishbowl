/**
 * FishBowl - Shadow DOM Utilities (content-script layer)
 *
 * Thin wrappers around FishBowlShadowDomTools that add options useful for
 * content-script traversal:
 *
 *   walkShadowRoots(rootEl, callback, opts)
 *     Visits every open shadow root reachable from rootEl, invoking callback(shadowRoot).
 *     opts.skipRoots - a Set or Array of shadow-root elements to skip (e.g. the HUD root).
 *     opts.skipHud   - boolean shorthand; automatically skips the FishBowl HUD shadow.
 *
 * Must be loaded after shadow-dom-tools.js.
 */

(function (root) {
    'use strict';

    /**
     * Walk every open shadow root reachable from rootEl and call callback on each.
     * @param {Document|Element} rootEl
     * @param {function(ShadowRoot|Document): void} callback
     * @param {{ skipRoots?: Set|Array, skipHud?: boolean }} [opts]
     */
    function walkShadowRoots(rootEl, callback, opts = {}) {
        const skipSet = new Set(opts.skipRoots || []);

        if (opts.skipHud && window.fishTankHUD?.hudShadowRoot) {
            skipSet.add(window.fishTankHUD.hudShadowRoot);
        }

        const seen = new Set();

        function visit(node) {
            if (!node || seen.has(node)) return;
            if (skipSet.has(node)) return;
            seen.add(node);

            try {
                callback(node);
            } catch (e) {
                console.warn('[FB:ShadowDomUtils] walkShadowRoots callback threw', e);
            }

            try {
                const elements = node.querySelectorAll ? node.querySelectorAll('*') : [];
                for (const el of elements) {
                    if (el?.shadowRoot) visit(el.shadowRoot);
                }
            } catch (e) {
                // Cross-origin shadow - not traversable.
                console.debug('[FB:ShadowDomUtils] Skipped non-traversable shadow root', e);
            }
        }

        visit(rootEl || document);
    }

    root.FishBowlShadowDomUtils = Object.freeze({ walkShadowRoots });

})(typeof window !== 'undefined' ? window : globalThis);
