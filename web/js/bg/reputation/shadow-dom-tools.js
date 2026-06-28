(function (root) {
    const tools = root.FishBowlShadowDomTools = root.FishBowlShadowDomTools || {};
    globalThis.FishBowlShadowDomTools = tools;

    tools.collectOpenRoots = function collectOpenRoots(root) {
        const roots = [];
        const seenRoots = new Set();
        const rootNode = root || document;

        const walk = (curRoot) => {
            if (!curRoot || seenRoots.has(curRoot)) return;
            seenRoots.add(curRoot);
            roots.push(curRoot);

            try {
                const all = curRoot.querySelectorAll ? curRoot.querySelectorAll('*') : [];
                for (const el of all) {
                    if (el && el.shadowRoot) {
                        walk(el.shadowRoot);
                    }
                }
            } catch (e) {
                console.warn('[FishBowlShadowDomTools] Traversal error in collectOpenRoots:', e);
            }
        };

        walk(rootNode);
        return roots;
    };

    tools.querySelectorAllDeep = function querySelectorAllDeep(selector, root) {
        const results = [];

        const roots = tools.collectOpenRoots(root);
        for (const curRoot of roots) {
            try {
                if (curRoot.querySelectorAll) {
                    results.push(...curRoot.querySelectorAll(selector));
                }
            } catch (e) {
                console.warn('[FishBowlShadowDomTools] Selector error in querySelectorAllDeep:', selector, e);
            }
        }

        return results;
    };

    tools.inlineOpenShadowDomIntoClone = function inlineOpenShadowDomIntoClone(cloneRootEl, originalRootEl) {
        const originalRoot = originalRootEl || document.documentElement;

        const sanitizeElement = (rootEl) => {
            try {
                if (!rootEl || !rootEl.querySelectorAll) return;

                const toRemove = rootEl.querySelectorAll('script, style, link');
                for (const el of Array.from(toRemove)) {
                    try {
                        el.remove();
                    } catch (e) {
                        console.warn('[FishBowlShadowDomTools] Failed to remove element during sanitize', el && el.tagName, e);
                    }
                }

                // Remove inline CSS.
                const styled = rootEl.querySelectorAll('[style]');
                for (const el of Array.from(styled)) {
                    try {
                        el.removeAttribute('style');
                    } catch (e) {
                        console.warn('[FishBowlShadowDomTools] Failed to remove style attribute during sanitize', el && el.tagName, e);
                    }
                }
            } catch (e) {
                console.warn('[FishBowlShadowDomTools] Failed to sanitize element subtree', e);
            }
        };

        let inlinedHosts = 0;
        const MAX_HOSTS = 250;

        const walkPair = (originalEl, cloneEl) => {
            if (!originalEl || !cloneEl) return;
            if (inlinedHosts >= MAX_HOSTS) return;

            // Mirror the user's snippet pattern:
            // - If node has shadowRoot, inline it (replace-mode)
            // - Recurse into shadowRoot children
            // - Recurse into light DOM children
            try {
                if (originalEl.shadowRoot) {
                    inlinedHosts += 1;

                    const container = document.createElement('fishbowl-shadow-root');
                    container.innerHTML = originalEl.shadowRoot.innerHTML || '';

                    // Walk children BEFORE sanitizing so original↔clone child
                    // arrays stay aligned (sanitize removes style/script/link
                    // which would shift indices).
                    const originalShadowChildren = Array.from(originalEl.shadowRoot.children || []);
                    const cloneShadowChildren = Array.from(container.children || []);
                    const len = Math.min(originalShadowChildren.length, cloneShadowChildren.length);
                    for (let i = 0; i < len; i += 1) {
                        walkPair(originalShadowChildren[i], cloneShadowChildren[i]);
                        if (inlinedHosts >= MAX_HOSTS) break;
                    }

                    sanitizeElement(container);
                    cloneEl.appendChild(container);
                }
            } catch (e) {
                console.warn('[FishBowlShadowDomTools] Failed to inline shadow root for element', e);
            }

            try {
                const originalChildren = Array.from(originalEl.children || []);
                const cloneChildren = Array.from(cloneEl.children || []);
                const len = Math.min(originalChildren.length, cloneChildren.length);
                for (let i = 0; i < len; i += 1) {
                    walkPair(originalChildren[i], cloneChildren[i]);
                    if (inlinedHosts >= MAX_HOSTS) break;
                }
            } catch (e) {
                console.warn('[FishBowlShadowDomTools] Failed to walk light DOM children while inlining shadow DOM', e);
            }
        };

        try {
            walkPair(originalRoot, cloneRootEl);
            sanitizeElement(cloneRootEl);
        } catch (e) {
            console.warn('[FishBowlShadowDomTools] Failed to inline shadow DOM into clone', e);
        }
    };

})(typeof window !== 'undefined' ? window : globalThis);
