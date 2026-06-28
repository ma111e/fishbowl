class FishBowlTextareaInspectOverlay extends window.FishBowlBaseInspectOverlay {
    constructor(options = {}) {
        super(options);

        this.isTextareaEligible = typeof options.isTextareaEligible === 'function'
            ? options.isTextareaEligible
            : (textarea) => !!textarea;

        this.textareaInspectOverlayDefault = false;
    }

    updateLayerThemeFromTextarea(textarea, layer) {
        try {
            if (!textarea || !layer) return;
            const computed = window.getComputedStyle(textarea);
            const bg = computed?.backgroundColor;
            const shouldForceLight = this.isEffectivelyWhiteBackground(bg);

            if (shouldForceLight) {
                layer.setAttribute('data-fishbowl-force-light-theme', 'true');
            } else {
                layer.removeAttribute('data-fishbowl-force-light-theme');
            }
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to update layer theme from textarea background', e);
        }
    }

    setDefaultEnabled(enabled) {
        this.textareaInspectOverlayDefault = !!enabled;
    }

    removeAllLayers() {
        super.removeAllLayers('data-fishbowl-textarea-inspect-layer');
    }

    deactivateAllLayers() {
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-textarea-inspect-layer="true"]'));
            for (const layer of layers) {
                const textarea = layer?.__fishbowlTextareaEl;
                if (textarea && layer.classList.contains('fishbowl-textarea-inspect-active')) {
                    this.toggleTextareaInspectOverlay(textarea, layer, { forceOff: true });
                }
                const button = layer.querySelector('.fishbowl-textarea-inspect-button');
                if (button) button.style.display = 'none';
            }
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to deactivate all layers', e);
        }
    }

    /**
     * Activate overlays for eligible textareas that are not already active,
     * mirroring clicking each [ Show ] button. By default only textareas with
     * detected entities are activated; pass { requireEntities: false } to reveal
     * every eligible textarea (used by hold-to-show, matching show-on-load).
     * @returns {HTMLElement[]} the layers that were newly activated
     */
    activateAllLayers({ requireEntities = true } = {}) {
        const activated = [];
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-textarea-inspect-layer="true"]'));
            for (const layer of layers) {
                const textarea = layer?.__fishbowlTextareaEl;
                if (!textarea) continue;
                if (layer.classList.contains('fishbowl-textarea-inspect-active')) continue;
                if (requireEntities && !this.hasEntities(textarea.value || '')) continue;
                this.toggleTextareaInspectOverlay(textarea, layer, { forceOn: true });
                activated.push(layer);
            }
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to activate all layers', e);
        }
        return activated;
    }

    /**
     * Hold-to-show: reveal eligible overlays, remembering which we activated so
     * holdShowDeactivate can restore the prior state exactly.
     */
    holdShowActivate() {
        if (this.__holdShowActive) return;
        this.__holdShowActive = true;
        this.__holdShowLayers = this.activateAllLayers({ requireEntities: false });
    }

    holdShowDeactivate() {
        if (!this.__holdShowActive) return;
        this.__holdShowActive = false;
        const layers = this.__holdShowLayers || [];
        this.__holdShowLayers = [];
        try {
            for (const layer of layers) {
                const textarea = layer?.__fishbowlTextareaEl;
                if (textarea && layer.classList.contains('fishbowl-textarea-inspect-active')) {
                    this.toggleTextareaInspectOverlay(textarea, layer, { forceOff: true });
                }
            }
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to deactivate hold-show layers', e);
        }
    }

    getOrAssignTextareaSourceId(textarea) {
        return this.getOrAssignSourceId(textarea, 'textarea');
    }

    getTextareaInspectLayerBySourceId(sourceId) {
        try {
            if (!sourceId) return null;
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-textarea-inspect-layer="true"]'))
                .filter(el => el && el.getAttribute('data-fishbowl-textarea-source-id') === sourceId);
            return layers.length ? layers[0] : null;
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to lookup textarea inspect layer by sourceId', e);
            return null;
        }
    }

    cleanupOrphanedTextareaInspectLayers() {
        this.cleanupOrphanedLayers('data-fishbowl-textarea-inspect-layer', '__fishbowlTextareaEl');
    }

    ensureTextareaInspectLayerPosition(textarea, layer) {
        try {
            if (!textarea || !layer) {
                return;
            }

            this.updateLayerThemeFromTextarea(textarea, layer);

            if (!(window.FishBowlAnchoredFixedLayer && typeof window.FishBowlAnchoredFixedLayer.ensurePosition === 'function')) {
                return;
            }

            window.FishBowlAnchoredFixedLayer.ensurePosition(textarea, layer, {
                zIndex: window.FishBowlConstants?.Z.OVERLAY_INSPECT ?? 99,
                pointerEvents: 'none',
                margin: '0',
                maxWidth: 'none',
                onAfterApply: (appliedLayer) => {
                    const btn = appliedLayer.querySelector('.fishbowl-textarea-inspect-button');
                    if (btn) {
                        btn.style.pointerEvents = 'auto';
                    }
                    // Overlay stays pointerEvents: none so clicks pass through to textarea
                    // (highlight spans inside have pointer-events: auto via CSS)
                }
            });
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to position textarea inspect layer', e);
        }
    }

    /**
     * Copy all relevant computed styles from the textarea onto the overlay div
     * so that text wrapping, sizing, and alignment match exactly.
     */
    syncOverlayStyles(textarea, overlay) {
        try {
            const computed = window.getComputedStyle(textarea);
            const props = [
                'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
                'lineHeight', 'letterSpacing', 'wordSpacing',
                'textAlign', 'textTransform', 'textIndent',
                'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
                'boxSizing',
                'wordWrap', 'overflowWrap', 'wordBreak',
                'whiteSpace',
                'tabSize',
                'direction', 'writingMode'
            ];
            for (const prop of props) {
                try {
                    const val = computed[prop];
                    if (val !== undefined && val !== '') {
                        overlay.style[prop] = val;
                    }
                } catch (styleErr) { console.debug('[FishBowl TextareaOverlay] Skipped style property copy', styleErr); }
            }
            // Border must be transparent - same size to keep alignment, but invisible
            overlay.style.borderColor = 'transparent';
            overlay.style.borderStyle = computed.borderStyle || 'solid';
            // Match the textarea color for non-highlighted text
            overlay.style.color = computed.color;
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to sync overlay styles from textarea', e);
        }
    }

    /**
     * Check whether a textarea value contains entities
     * and auto-activate or auto-dismiss accordingly.
     */
    autoActivateIfNeeded(textarea, layer) {
        try {
            if (!textarea || !layer) return;
            if (!this.enabled) return;
            const value = textarea.value || '';
            const isActive = layer.classList.contains('fishbowl-textarea-inspect-active');
            const detected = this.hasEntities(value);

            const button = layer.querySelector('.fishbowl-textarea-inspect-button');

            // Only auto-activate when the "show on page load" sub-setting is on.
            // Without it, show the [Show] button when entities exist but don't activate the overlay —
            // unless the user manually clicked [Show], in which case leave it active.
            if (!this.textareaInspectOverlayDefault) {
                if (layer.__fishbowlManuallyShown) return;
                if (button) button.style.display = detected ? '' : 'none';
                if (button && detected && !isActive) {
                    button.textContent = '[ Show ]';
                    button.title = 'Show textarea overlay highlights';
                }
                if (isActive) {
                    this.toggleTextareaInspectOverlay(textarea, layer, { forceOff: true });
                }
                return;
            }

            if (detected && !isActive && !layer.__fishbowlManuallyDismissed) {
                // Show the button and activate
                if (button) button.style.display = '';
                this.toggleTextareaInspectOverlay(textarea, layer, { forceOn: true });
            } else if (!detected && isActive) {
                this.toggleTextareaInspectOverlay(textarea, layer, { forceOff: true });
            } else if (!detected && !isActive) {
                // No entities + not active → hide the button entirely
                if (button) button.style.display = 'none';
            }
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to auto-activate overlay', e);
        }
    }

    setupTextareaInspectButtons() {
        if (!this.enabled) return;
        try {
            const textareas = Array.from(document.querySelectorAll('textarea'))
                .filter(t => !t.closest('.fishbowl-hud') && !t.closest('.fishbowl-panel') && !t.closest('.fishbowl-modal-backdrop'))
                .filter(t => this.isTextareaEligible(t));

            this.cleanupOrphanedTextareaInspectLayers();

            for (const textarea of textareas) {
                const sourceId = this.getOrAssignTextareaSourceId(textarea);
                if (!sourceId) {
                    continue;
                }

                const existingLayer = this.getTextareaInspectLayerBySourceId(sourceId);
                if (existingLayer) {
                    existingLayer.__fishbowlTextareaEl = textarea;
                    this.updateLayerThemeFromTextarea(textarea, existingLayer);
                    this.ensureTextareaInspectLayerPosition(textarea, existingLayer);

                    if (this.textareaInspectOverlayDefault && !existingLayer.__fishbowlManuallyDismissed) {
                        this.toggleTextareaInspectOverlay(textarea, existingLayer, { forceOn: true });
                    } else {
                        this.autoActivateIfNeeded(textarea, existingLayer);
                    }
                    continue;
                }

                const layer = document.createElement('div');
                layer.className = 'fishbowl-textarea-inspect-wrapper';
                layer.setAttribute('data-fishbowl-textarea-inspect-layer', 'true');
                layer.setAttribute('data-fishbowl-textarea-source-id', sourceId);
                layer.__fishbowlTextareaEl = textarea;
                this.updateLayerThemeFromTextarea(textarea, layer);

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'fishbowl-textarea-inspect-button fishbowl-textarea-inspect-button-autohide';
                // Start hidden; autoActivateIfNeeded will show it if entities exist
                button.style.display = 'none';
                button.textContent = '[×]';
                button.title = 'Dismiss textarea overlay highlights';
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof e.stopImmediatePropagation === 'function') {
                        e.stopImmediatePropagation();
                    }
                    const isActive = layer.classList.contains('fishbowl-textarea-inspect-active');
                    if (isActive) {
                        // Dismiss overlay
                        this.toggleTextareaInspectOverlay(textarea, layer, { forceOff: true });
                        layer.__fishbowlManuallyDismissed = true;
                        layer.__fishbowlManuallyShown = false;
                        button.textContent = '[ Show ]';
                        button.title = 'Show textarea overlay highlights';
                        // Auto-hide after same delay as the dismiss button
                        this.resetButtonAutoHide(layer);
                    } else {
                        // Re-show overlay
                        layer.__fishbowlManuallyDismissed = false;
                        layer.__fishbowlManuallyShown = true;
                        this.toggleTextareaInspectOverlay(textarea, layer, { forceOn: true });
                        button.textContent = '[×]';
                        button.title = 'Dismiss textarea overlay highlights';
                    }
                });

                layer.appendChild(button);
                document.body.appendChild(layer);
                this.ensureTextareaInspectLayerPosition(textarea, layer);

                if (this.textareaInspectOverlayDefault) {
                    this.toggleTextareaInspectOverlay(textarea, layer, { forceOn: true });
                } else {
                    this.autoActivateIfNeeded(textarea, layer);
                }
            }
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to set up textarea inspect buttons', e);
        }
    }

    applyDefaultTextareaInspectOverlays() {
        if (!this.textareaInspectOverlayDefault) {
            return;
        }
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-textarea-inspect-layer="true"]'));
            for (const layer of layers) {
                const textarea = layer?.__fishbowlTextareaEl;
                if (textarea) {
                    this.toggleTextareaInspectOverlay(textarea, layer, { forceOn: true });
                }
            }
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to apply default textarea inspect overlays', e);
        }
    }

    refreshActiveTextareaOverlays() {
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-textarea-inspect-layer="true"]'));
            for (const layer of layers) {
                if (layer && layer.classList.contains('fishbowl-textarea-inspect-active')) {
                    const textarea = layer?.__fishbowlTextareaEl;
                    if (textarea) {
                        this.toggleTextareaInspectOverlay(textarea, layer, { forceOn: true });
                    }
                }
            }
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to refresh active textarea overlays after scan', e);
        }
    }

    toggleTextareaInspectOverlay(textarea, layer, options = {}) {
        try {
            if (!textarea || !layer) {
                return;
            }

            const forceOn = !!options.forceOn;
            const forceOff = !!options.forceOff;

            const isActive = layer.classList.contains('fishbowl-textarea-inspect-active');

            // --- Deactivation ---
            if ((isActive && !forceOn) || forceOff) {
                layer.classList.remove('fishbowl-textarea-inspect-active');

                const overlay = layer.querySelector('.fishbowl-textarea-inspect-overlay');
                if (overlay) {
                    overlay.remove();
                }

                if (textarea.__fishbowlInspectSyncScroll) {
                    textarea.removeEventListener('scroll', textarea.__fishbowlInspectSyncScroll);
                    textarea.__fishbowlInspectSyncScroll = null;
                }
                if (textarea.__fishbowlInspectUpdateOverlay) {
                    textarea.removeEventListener('input', textarea.__fishbowlInspectUpdateOverlay);
                    textarea.__fishbowlInspectUpdateOverlay = null;
                }

                if (layer.__fishbowlTypingDebounce) {
                    clearTimeout(layer.__fishbowlTypingDebounce);
                    layer.__fishbowlTypingDebounce = null;
                }

                textarea.style.color = '';
                textarea.style.caretColor = '';

                // Update button - hide it entirely if no entities remain
                const button = layer.querySelector('.fishbowl-textarea-inspect-button');
                if (button) {
                    const stillHasEntities = this.hasEntities(textarea.value || '');
                    if (stillHasEntities) {
                        button.textContent = '[ Show ]';
                        button.title = 'Show textarea overlay highlights';
                        button.style.display = '';
                    } else {
                        button.style.display = 'none';
                    }
                }
                return;
            }

            // --- Refresh (already active, forceOn to re-render) ---
            if (isActive && forceOn) {
                const overlay = layer.querySelector('.fishbowl-textarea-inspect-overlay');
                if (overlay) {
                    this.syncOverlayStyles(textarea, overlay);
                    overlay.innerHTML = this.renderTextWithIndicators(textarea.value || '');
                    overlay.scrollTop = textarea.scrollTop;
                    overlay.scrollLeft = textarea.scrollLeft;

                    overlay.classList.remove('fishbowl-textarea-overlay-typing');
                }

                this.ensureTextareaInspectLayerPosition(textarea, layer);

                // Update button state
                const button = layer.querySelector('.fishbowl-textarea-inspect-button');
                if (button) {
                    button.textContent = '[×]';
                    button.title = 'Dismiss textarea overlay highlights';
                }

                this.resetButtonAutoHide(layer);
                return;
            }

            // --- Activation ---
            layer.classList.add('fishbowl-textarea-inspect-active');
            layer.__fishbowlManuallyDismissed = false;

            const overlay = document.createElement('div');
            overlay.className = 'fishbowl-textarea-inspect-overlay';

            // Copy all relevant styles from the textarea for pixel-perfect alignment
            this.syncOverlayStyles(textarea, overlay);

            // Typing-aware update:
            // 1. On keystroke, immediately update overlay with PLAIN text (no highlights)
            //    so the user always sees what they're typing
            // 2. After debounce pause, re-render with full highlights
            const updateOverlay = () => {
                // Immediately show plain text so the user sees their typing in real-time
                overlay.innerHTML = this.escapeHtml(textarea.value || '');
                overlay.scrollTop = textarea.scrollTop;
                overlay.scrollLeft = textarea.scrollLeft;

                // Add typing class to hide any leftover highlight spans
                overlay.classList.add('fishbowl-textarea-overlay-typing');

                if (layer.__fishbowlTypingDebounce) {
                    clearTimeout(layer.__fishbowlTypingDebounce);
                }

                // After user stops typing, re-render with highlights
                layer.__fishbowlTypingDebounce = setTimeout(() => {
                    layer.__fishbowlTypingDebounce = null;
                    overlay.innerHTML = this.renderTextWithIndicators(textarea.value || '');
                    overlay.scrollTop = textarea.scrollTop;
                    overlay.scrollLeft = textarea.scrollLeft;

                    overlay.classList.remove('fishbowl-textarea-overlay-typing');

                    // Auto-dismiss if no entities remain
                    if (!this.hasEntities(textarea.value || '')) {
                        this.toggleTextareaInspectOverlay(textarea, layer, { forceOff: true });
                    }
                }, this.typingDebounceMs);
            };

            const syncScroll = () => {
                overlay.scrollTop = textarea.scrollTop;
                overlay.scrollLeft = textarea.scrollLeft;
            };

            layer.appendChild(overlay);
            overlay.innerHTML = this.renderTextWithIndicators(textarea.value || '');
            syncScroll();

            this.ensureTextareaInspectLayerPosition(textarea, layer);

            textarea.__fishbowlInspectSyncScroll = syncScroll;
            textarea.__fishbowlInspectUpdateOverlay = updateOverlay;
            textarea.addEventListener('scroll', syncScroll);
            textarea.addEventListener('input', updateOverlay);

            // Textarea stays interactive: text transparent, caret visible
            const computed = window.getComputedStyle(textarea);
            textarea.style.color = 'transparent';
            textarea.style.caretColor = computed.color || 'auto';

            // Update button state
            const button = layer.querySelector('.fishbowl-textarea-inspect-button');
            if (button) {
                button.style.display = '';
                button.textContent = '[×]';
                button.title = 'Dismiss textarea overlay highlights';
            }

            this.resetButtonAutoHide(layer);
        } catch (e) {
            console.error('[FishBowlTextareaInspectOverlay] Failed to toggle textarea inspect overlay', e);
        }
    }

    /**
     * Auto-hide the dismiss button after 1 second, reveal on layer hover (CSS handles hover).
     */
    resetButtonAutoHide(layer) {
        try {
            if (!layer) return;
            const btn = layer.querySelector('.fishbowl-textarea-inspect-button');
            if (!btn) return;

            btn.classList.remove('fishbowl-textarea-inspect-button-hidden');

            if (layer.__fishbowlButtonHideTimer) {
                clearTimeout(layer.__fishbowlButtonHideTimer);
            }

            layer.__fishbowlButtonHideTimer = setTimeout(() => {
                layer.__fishbowlButtonHideTimer = null;
                btn.classList.add('fishbowl-textarea-inspect-button-hidden');
            }, 1000);
        } catch (e) {
            console.warn('[FishBowlTextareaInspectOverlay] Failed to reset button auto-hide', e);
        }
    }
}

window.FishBowlTextareaInspectOverlay = window.FishBowlTextareaInspectOverlay || FishBowlTextareaInspectOverlay;
