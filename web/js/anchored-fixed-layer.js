class FishBowlAnchoredFixedLayer {
    static ensurePosition(anchorEl, layer, options = {}) {
        try {
            if (!anchorEl || !layer) {
                return;
            }

            const applyPosition = () => {
                try {
                    const rect = anchorEl.getBoundingClientRect();
                    if (!rect || !rect.width || !rect.height) return;

                    layer.style.position = 'fixed';
                    layer.style.left = `${rect.left}px`;
                    layer.style.top = `${rect.top}px`;
                    layer.style.width = `${rect.width}px`;
                    layer.style.height = `${rect.height}px`;

                    if (options.zIndex != null) {
                        layer.style.zIndex = `${options.zIndex}`;
                    }

                    if (options.pointerEvents != null) {
                        layer.style.pointerEvents = options.pointerEvents;
                    }

                    if (options.margin != null) {
                        layer.style.margin = options.margin;
                    }

                    if (options.maxWidth != null) {
                        layer.style.maxWidth = options.maxWidth;
                    }

                    if (typeof options.onAfterApply === 'function') {
                        options.onAfterApply(layer, rect);
                    }
                } catch (e) {
                    console.warn('[FishBowlAnchoredFixedLayer] Failed to apply position', e);
                }
            };

            applyPosition();

            const observeResize = options.observeResize !== false;
            if (observeResize && !layer.__fishbowlAnchoredResizeObserver && typeof ResizeObserver !== 'undefined') {
                layer.__fishbowlAnchoredResizeObserver = new ResizeObserver(() => {
                    applyPosition();
                });
                layer.__fishbowlAnchoredResizeObserver.observe(anchorEl);
            }

            const observeWindow = options.observeWindow !== false;
            if (observeWindow && !layer.__fishbowlAnchoredWindowResizeHandler) {
                layer.__fishbowlAnchoredWindowResizeHandler = () => {
                    applyPosition();
                };
                window.addEventListener('resize', layer.__fishbowlAnchoredWindowResizeHandler);
                window.addEventListener('scroll', layer.__fishbowlAnchoredWindowResizeHandler, true);
            }
        } catch (e) {
            console.warn('[FishBowlAnchoredFixedLayer] Failed to ensure position', e);
        }
    }
}

window.FishBowlAnchoredFixedLayer = window.FishBowlAnchoredFixedLayer || FishBowlAnchoredFixedLayer;
