class FishBowlTinyMceInspectOverlay extends window.FishBowlBaseInspectOverlay {
    constructor(options = {}) {
        super(options);

        this.getOverlayRegex = typeof options.getOverlayRegex === 'function'
            ? options.getOverlayRegex
            : () => null;

        this.getOverlayLookup = typeof options.getOverlayLookup === 'function'
            ? options.getOverlayLookup
            : () => null;

        this.getHighlightCssClass = typeof options.getHighlightCssClass === 'function'
            ? options.getHighlightCssClass
            : (type) => `fishbowl-${(type || 'event').toString().trim().toLowerCase()}-highlight`;

        this.defaultEnabled = false;
    }

    // ── TinyMCE Detection ────────────────────────────────────────────

    isTinyMceIframe(iframe) {
        try {
            if (!iframe) return false;
            const doc = iframe.contentDocument;
            if (!doc) return false;
            const body = doc.body;
            if (!body) return false;
            if (!body.isContentEditable && body.getAttribute('contenteditable') !== 'true') return false;

            // TinyMCE convention: iframe id ends with _ifr
            if (iframe.id && iframe.id.endsWith('_ifr')) return true;

            // TinyMCE body id starts with 'tinymce'
            const bodyId = (body.id || '').toLowerCase();
            if (bodyId === 'tinymce' || bodyId.startsWith('tinymce')) return true;

            // Fallback: any same-origin contentEditable iframe
            return true;
        } catch (e) {
            // Cross-origin iframe access throws - treat as not a TinyMCE editor.
            console.debug('[FishBowlTinyMceInspectOverlay] Iframe eligibility check failed (likely cross-origin)', e);
            return false;
        }
    }

    // ── Source ID ─────────────────────────────────────────────────────

    getOrAssignSourceId(iframe) {
        return super.getOrAssignSourceId(iframe, 'tinymce');
    }

    // ── Layer Lookup ──────────────────────────────────────────────────

    getLayerBySourceId(sourceId) {
        try {
            if (!sourceId) return null;
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-tinymce-inspect-layer="true"]'))
                .filter(el => el && el.getAttribute('data-fishbowl-tinymce-source-id') === sourceId);
            return layers.length ? layers[0] : null;
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to lookup layer by sourceId', e);
            return null;
        }
    }

    // ── Orphan Cleanup ────────────────────────────────────────────────

    cleanupOrphanedLayers() {
        super.cleanupOrphanedLayers('data-fishbowl-tinymce-inspect-layer', '__fishbowlIframeEl');
    }

    // ── Read Text ─────────────────────────────────────────────────────

    readIframeText(iframe) {
        try {
            const body = iframe?.contentDocument?.body;
            if (!body) return '';
            const t = (typeof body.innerText === 'string') ? body.innerText : '';
            if (t && t.trim()) return t;
            const tc = body.textContent;
            return (tc && tc.trim()) ? tc : '';
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to read iframe text', e);
            return '';
        }
    }

    // ── HTML-Aware Rendering ─────────────────────────────────────────

    getCleanBodyHtml(iframe) {
        try {
            const body = iframe?.contentDocument?.body;
            if (!body) return '';
            const clone = body.cloneNode(true);
            // Remove the transparent color we set on the real body
            clone.style.color = '';
            clone.style.caretColor = '';
            // Remove any FishBowl-injected elements
            const fbEls = clone.querySelectorAll('[class*="fishbowl"]');
            for (const el of fbEls) {
                try { el.remove(); } catch (e) { console.debug('[FishBowlTinyMceInspectOverlay] Failed to strip injected element', e); }
            }
            return clone.innerHTML;
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to get clean body HTML', e);
            return this.escapeHtml(this.readIframeText(iframe));
        }
    }

    cloneBodyWithHighlights(iframe) {
        try {
            const body = iframe?.contentDocument?.body;
            if (!body) return '';
            const clone = body.cloneNode(true);
            // Remove the transparent color we set on the real body
            clone.style.color = '';
            clone.style.caretColor = '';
            // Remove any FishBowl-injected elements before highlighting
            const fbEls = clone.querySelectorAll('[class*="fishbowl"]');
            for (const el of fbEls) {
                try { el.remove(); } catch (e) { console.debug('[FishBowlTinyMceInspectOverlay] Failed to strip injected element', e); }
            }

            const regex = this.getOverlayRegex();
            const lookup = this.getOverlayLookup();
            if (regex && lookup) {
                this.highlightTextNodesInElement(clone, regex, lookup);
            }

            return clone.innerHTML;
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to clone body with highlights', e);
            return this.renderTextWithIndicators(this.readIframeText(iframe));
        }
    }

    highlightTextNodesInElement(element, regex, lookup) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            textNodes.push(node);
        }

        for (const textNode of textNodes) {
            const text = textNode.nodeValue;
            if (!text || !text.trim()) continue;

            regex.lastIndex = 0;
            if (!regex.test(text)) continue;

            regex.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let lastIndex = 0;
            let match;

            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                }

                const matchText = match[0];
                const lower = matchText.toLowerCase();
                const type = lookup.get(matchText) || lookup.get(lower);

                if (type) {
                    const span = document.createElement('span');
                    const cssClass = this.getHighlightCssClass(type);
                    span.className = `fishbowl-highlight ${cssClass}`;
                    span.setAttribute('data-type', type);
                    span.setAttribute('data-content', matchText);
                    span.setAttribute('data-selectable', 'true');
                    span.title = `${type.toUpperCase()}: ${matchText}`;
                    span.textContent = matchText;
                    frag.appendChild(span);
                } else {
                    frag.appendChild(document.createTextNode(matchText));
                }

                lastIndex = match.index + matchText.length;
            }

            if (lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }

            textNode.parentNode.replaceChild(frag, textNode);
        }
    }

    // ── Collect Sources (for page analysis injection) ─────────────────

    collectIframeSources() {
        try {
            const iframes = Array.from(document.querySelectorAll('iframe'))
                .filter(f => !f.closest('.fishbowl-hud') && !f.closest('.fishbowl-panel') && !f.closest('.fishbowl-modal-backdrop'))
                .filter(f => this.isTinyMceIframe(f));

            const sources = [];
            for (const iframe of iframes) {
                const sourceId = this.getOrAssignSourceId(iframe);
                sources.push({
                    kind: 'tinymce_iframe',
                    sourceId,
                    iframe,
                    text: this.readIframeText(iframe)
                });
            }
            return sources;
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to collect iframe sources', e);
            return [];
        }
    }

    // ── Theme Detection ───────────────────────────────────────────────

    updateLayerThemeFromIframe(iframe, layer) {
        try {
            if (!iframe || !layer) return;
            const body = iframe?.contentDocument?.body;
            if (!body) return;
            const computed = iframe.contentWindow.getComputedStyle(body);
            const bg = computed?.backgroundColor;
            const shouldForceLight = this.isEffectivelyWhiteBackground(bg);

            if (shouldForceLight) {
                layer.setAttribute('data-fishbowl-force-light-theme', 'true');
            } else {
                layer.removeAttribute('data-fishbowl-force-light-theme');
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to update layer theme', e);
        }
    }

    // ── Position ──────────────────────────────────────────────────────

    ensureLayerPosition(iframe, layer) {
        try {
            if (!iframe || !layer) return;

            this.updateLayerThemeFromIframe(iframe, layer);

            if (!(window.FishBowlAnchoredFixedLayer && typeof window.FishBowlAnchoredFixedLayer.ensurePosition === 'function')) {
                return;
            }

            window.FishBowlAnchoredFixedLayer.ensurePosition(iframe, layer, {
                zIndex: window.FishBowlConstants?.Z.OVERLAY_INSPECT ?? 99,
                pointerEvents: 'none',
                margin: '0',
                maxWidth: 'none',
                onAfterApply: (appliedLayer) => {
                    const btn = appliedLayer.querySelector('.fishbowl-textarea-inspect-button');
                    if (btn) {
                        btn.style.pointerEvents = 'auto';
                    }
                }
            });
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to position layer', e);
        }
    }

    // ── Overlay Style Sync ────────────────────────────────────────────

    syncOverlayStyles(iframe, overlay) {
        try {
            const body = iframe?.contentDocument?.body;
            if (!body) return;
            const computed = iframe.contentWindow.getComputedStyle(body);

            // Fallback: copy essential computed properties only when CSS
            // injection is not available (cross-origin sheets, etc.).
            const fallbackProps = [
                'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
                'lineHeight', 'letterSpacing', 'wordSpacing',
                'textAlign', 'textTransform', 'textIndent',
                'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                'boxSizing',
                'wordWrap', 'overflowWrap', 'wordBreak',
                'whiteSpace',
                'tabSize',
                'direction', 'writingMode'
            ];

            if (!this._iframeCssInjected) {
                for (const prop of fallbackProps) {
                    try {
                        const val = computed[prop];
                        if (val !== undefined && val !== '') {
                            overlay.style[prop] = val;
                        }
                    } catch (styleErr) {
                        console.debug('[FishBowlTinyMceInspectOverlay] Skipped style property copy', styleErr);
                    }
                }
            }

            // Always override margin to 0 - the overlay fills the layer via
            // position:absolute;top/left/right/bottom:0 and must not shrink.
            overlay.style.margin = '0';

            // Convert body horizontal margin to overlay padding so text aligns.
            try {
                const ml = parseFloat(computed.marginLeft) || 0;
                const mr = parseFloat(computed.marginRight) || 0;
                const pl = parseFloat(computed.paddingLeft) || 0;
                const pr = parseFloat(computed.paddingRight) || 0;
                overlay.style.paddingLeft = (ml + pl) + 'px';
                overlay.style.paddingRight = (mr + pr) + 'px';
            } catch (marginErr) {
                console.debug('[FishBowlTinyMceInspectOverlay] Skipped margin-to-padding conversion', marginErr);
            }

            // Use saved original color (body color may be 'transparent' while overlay is active)
            overlay.style.color = iframe.__fishbowlOriginalBodyColor || computed.color;
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to sync overlay styles', e);
        }
    }

    // ── Overlay Content + CSS Injection ────────────────────────────────

    setOverlayContent(iframe, overlay, html) {
        overlay.innerHTML = html;
        this.injectIframeContentStyles(iframe, overlay);
    }

    injectIframeContentStyles(iframe, overlay) {
        this._iframeCssInjected = false;
        try {
            const iframeDoc = iframe?.contentDocument;
            if (!iframeDoc || !iframeDoc.styleSheets || !iframeDoc.styleSheets.length) return;

            const scope = '.fishbowl-textarea-inspect-overlay';
            const scopedRules = [];

            for (const sheet of iframeDoc.styleSheets) {
                try {
                    if (!sheet.cssRules) continue;
                    // Skip our own injected hide style - its color:transparent
                    // rules must NOT be scoped into the overlay.
                    if (sheet.ownerNode && sheet.ownerNode.id === 'fishbowl-overlay-text-hide') continue;
                    this.collectScopedRules(sheet.cssRules, scope, scopedRules);
                } catch (e) {
                    console.debug('[FishBowlTinyMceInspectOverlay] Could not read iframe stylesheet', e);
                }
            }

            if (!scopedRules.length) return;

            // Preserve key inline formatting that scoped CSS may override
            scopedRules.push(
                `${scope} strong, ${scope} b { font-weight: bold !important; }`,
                `${scope} em, ${scope} i { font-style: italic !important; }`,
                `${scope} a { text-decoration: underline !important; }`,
                `${scope} u { text-decoration: underline !important; }`,
                `${scope} s, ${scope} del, ${scope} strike { text-decoration: line-through !important; }`
            );

            // Hide replaced elements that could leak visually or cause layout mismatch
            scopedRules.push(
                `${scope} img, ${scope} video, ${scope} iframe,` +
                `${scope} embed, ${scope} object, ${scope} canvas,` +
                `${scope} svg { visibility: hidden; }`
            );

            const style = document.createElement('style');
            style.className = 'fishbowl-tinymce-content-styles';
            style.textContent = scopedRules.join('\n');
            overlay.prepend(style);
            this._iframeCssInjected = true;
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to inject content styles', e);
        }
    }

    collectScopedRules(rules, scope, output) {
        for (const rule of rules) {
            try {
                if (rule.type === CSSRule.STYLE_RULE) {
                    const selector = this.scopeSelector(rule.selectorText, scope);
                    output.push(`${selector} { ${rule.style.cssText} }`);
                } else if (rule.type === CSSRule.MEDIA_RULE) {
                    const inner = [];
                    this.collectScopedRules(rule.cssRules, scope, inner);
                    if (inner.length) {
                        output.push(`@media ${rule.conditionText} {\n${inner.join('\n')}\n}`);
                    }
                }
            } catch (e) {
                console.debug('[FishBowlTinyMceInspectOverlay] Failed to process CSS rule', e);
            }
        }
    }

    scopeSelector(selectorText, scope) {
        return selectorText.split(',').map(s => {
            s = s.trim();
            if (!s) return s;
            const replaced = s.replace(/\bbody\b/gi, scope);
            if (replaced !== s) return replaced;
            return `${scope} ${s}`;
        }).join(', ');
    }

    // ── Overlay Scroll Sync ───────────────────────────────────────────

    syncOverlayScroll(iframe, overlay) {
        try {
            if (!iframe || !overlay) return;
            const win = iframe.contentWindow;
            if (!win) return;
            const doc = iframe.contentDocument;
            const scrollTop = win.scrollY
                || (doc && doc.documentElement && doc.documentElement.scrollTop)
                || (doc && doc.body && doc.body.scrollTop)
                || 0;
            const scrollLeft = win.scrollX
                || (doc && doc.documentElement && doc.documentElement.scrollLeft)
                || (doc && doc.body && doc.body.scrollLeft)
                || 0;
            overlay.scrollTop = scrollTop;
            overlay.scrollLeft = scrollLeft;
        } catch (e) {
            console.debug('[FishBowlTinyMceInspectOverlay] Failed to sync overlay scroll', e);
        }
    }

    // ── Settings ──────────────────────────────────────────────────────

    setDefaultEnabled(enabled) {
        this.defaultEnabled = !!enabled;
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
    }

    removeAllLayers() {
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-tinymce-inspect-layer="true"]'));
            for (const layer of layers) {
                try { layer.remove(); } catch (e2) { console.debug('[FishBowlTinyMceInspectOverlay] Failed to remove layer in removeAllLayers', e2); }
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to remove all layers', e);
        }
    }

    deactivateAllLayers() {
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-tinymce-inspect-layer="true"]'));
            for (const layer of layers) {
                const iframe = layer?.__fishbowlIframeEl;
                if (iframe && layer.classList.contains('fishbowl-textarea-inspect-active')) {
                    this.toggleOverlay(iframe, layer, { forceOff: true });
                }
                const button = layer.querySelector('.fishbowl-textarea-inspect-button');
                if (button) button.style.display = 'none';
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to deactivate all layers', e);
        }
    }

    /**
     * Activate overlays for eligible TinyMCE editors that are not already active,
     * mirroring clicking each [ Show ] button. By default only editors with
     * detected entities are activated; pass { requireEntities: false } to reveal
     * every eligible editor (used by hold-to-show, matching show-on-load).
     * @returns {HTMLElement[]} the layers that were newly activated
     */
    activateAllLayers({ requireEntities = true } = {}) {
        const activated = [];
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-tinymce-inspect-layer="true"]'));
            for (const layer of layers) {
                const iframe = layer?.__fishbowlIframeEl;
                if (!iframe) continue;
                if (layer.classList.contains('fishbowl-textarea-inspect-active')) continue;
                if (requireEntities && !this.hasEntities(this.readIframeText(iframe))) continue;
                this.toggleOverlay(iframe, layer, { forceOn: true });
                activated.push(layer);
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to activate all layers', e);
        }
        return activated;
    }

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
                const iframe = layer?.__fishbowlIframeEl;
                if (iframe && layer.classList.contains('fishbowl-textarea-inspect-active')) {
                    this.toggleOverlay(iframe, layer, { forceOff: true });
                }
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to deactivate hold-show layers', e);
        }
    }

    // ── Auto-Activation ───────────────────────────────────────────────

    autoActivateIfNeeded(iframe, layer) {
        try {
            if (!iframe || !layer) return;
            if (!this.enabled) return;
            const text = this.readIframeText(iframe);
            const isActive = layer.classList.contains('fishbowl-textarea-inspect-active');
            const detected = this.hasEntities(text);

            const button = layer.querySelector('.fishbowl-textarea-inspect-button');

            // Only auto-activate when the "show on page load" sub-setting is on.
            // Without it, show the [Show] button when entities exist but don't activate the overlay —
            // unless the user manually clicked [Show], in which case leave it active.
            if (!this.defaultEnabled) {
                if (layer.__fishbowlManuallyShown) return;
                if (button) button.style.display = detected ? '' : 'none';
                if (button && detected && !isActive) {
                    button.textContent = '[ Show ]';
                    button.title = 'Show overlay highlights';
                }
                if (isActive) {
                    this.toggleOverlay(iframe, layer, { forceOff: true });
                }
                return;
            }

            if (detected && !isActive && !layer.__fishbowlManuallyDismissed) {
                if (button) button.style.display = '';
                this.toggleOverlay(iframe, layer, { forceOn: true });
            } else if (!detected && isActive) {
                this.toggleOverlay(iframe, layer, { forceOff: true });
            } else if (!detected && !isActive) {
                if (button) button.style.display = 'none';
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to auto-activate overlay', e);
        }
    }

    // ── Setup ─────────────────────────────────────────────────────────

    setupInspectButtons() {
        if (!this.enabled) return;
        try {
            const iframes = Array.from(document.querySelectorAll('iframe'))
                .filter(f => !f.closest('.fishbowl-hud') && !f.closest('.fishbowl-panel') && !f.closest('.fishbowl-modal-backdrop'))
                .filter(f => this.isTinyMceIframe(f));

            this.cleanupOrphanedLayers();

            for (const iframe of iframes) {
                const sourceId = this.getOrAssignSourceId(iframe);
                if (!sourceId) continue;

                const existingLayer = this.getLayerBySourceId(sourceId);
                if (existingLayer) {
                    existingLayer.__fishbowlIframeEl = iframe;
                    this.updateLayerThemeFromIframe(iframe, existingLayer);
                    this.ensureLayerPosition(iframe, existingLayer);

                    if (this.defaultEnabled && !existingLayer.__fishbowlManuallyDismissed) {
                        this.toggleOverlay(iframe, existingLayer, { forceOn: true });
                    } else {
                        this.autoActivateIfNeeded(iframe, existingLayer);
                    }
                    continue;
                }

                const layer = document.createElement('div');
                layer.className = 'fishbowl-textarea-inspect-wrapper';
                layer.setAttribute('data-fishbowl-tinymce-inspect-layer', 'true');
                layer.setAttribute('data-fishbowl-tinymce-source-id', sourceId);
                layer.style.overflow = 'hidden';
                layer.style.contain = 'paint';
                layer.__fishbowlIframeEl = iframe;
                this.updateLayerThemeFromIframe(iframe, layer);

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'fishbowl-textarea-inspect-button fishbowl-textarea-inspect-button-autohide';
                // Start hidden; autoActivateIfNeeded will show it if entities exist
                button.style.display = 'none';
                button.textContent = '[×]';
                button.title = 'Dismiss TinyMCE overlay highlights';
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof e.stopImmediatePropagation === 'function') {
                        e.stopImmediatePropagation();
                    }
                    const isActive = layer.classList.contains('fishbowl-textarea-inspect-active');
                    if (isActive) {
                        this.toggleOverlay(iframe, layer, { forceOff: true });
                        layer.__fishbowlManuallyDismissed = true;
                        layer.__fishbowlManuallyShown = false;
                        button.textContent = '[ Show ]';
                        button.title = 'Show TinyMCE overlay highlights';
                        this.resetButtonAutoHide(layer);
                    } else {
                        layer.__fishbowlManuallyDismissed = false;
                        layer.__fishbowlManuallyShown = true;
                        this.toggleOverlay(iframe, layer, { forceOn: true });
                        button.textContent = '[×]';
                        button.title = 'Dismiss TinyMCE overlay highlights';
                    }
                });

                layer.appendChild(button);
                document.body.appendChild(layer);
                this.ensureLayerPosition(iframe, layer);

                if (this.defaultEnabled) {
                    this.toggleOverlay(iframe, layer, { forceOn: true });
                } else {
                    this.autoActivateIfNeeded(iframe, layer);
                }
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to setup inspect buttons', e);
        }
    }

    // ── Apply Default Overlays ────────────────────────────────────────

    applyDefaultOverlays() {
        if (!this.defaultEnabled) return;
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-tinymce-inspect-layer="true"]'));
            for (const layer of layers) {
                const iframe = layer?.__fishbowlIframeEl;
                if (iframe) {
                    this.toggleOverlay(iframe, layer, { forceOn: true });
                }
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to apply default overlays', e);
        }
    }

    // ── Refresh Active Overlays ───────────────────────────────────────

    refreshActiveOverlays() {
        try {
            const layers = Array.from(document.querySelectorAll('[data-fishbowl-tinymce-inspect-layer="true"]'));
            for (const layer of layers) {
                if (layer && layer.classList.contains('fishbowl-textarea-inspect-active')) {
                    const iframe = layer?.__fishbowlIframeEl;
                    if (iframe) {
                        this.toggleOverlay(iframe, layer, { forceOn: true });
                    }
                }
            }
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to refresh active overlays', e);
        }
    }

    // ── Toggle Overlay ────────────────────────────────────────────────

    toggleOverlay(iframe, layer, options = {}) {
        try {
            if (!iframe || !layer) return;

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

                // Remove event listeners from iframe
                if (iframe.__fishbowlInspectSyncScroll) {
                    try {
                        iframe.contentWindow.removeEventListener('scroll', iframe.__fishbowlInspectSyncScroll);
                    } catch (e) {
                        console.debug('[FishBowlTinyMceInspectOverlay] Could not remove scroll listener', e);
                    }
                    iframe.__fishbowlInspectSyncScroll = null;
                }
                if (iframe.__fishbowlInspectUpdateOverlay) {
                    try {
                        iframe.contentDocument.removeEventListener('input', iframe.__fishbowlInspectUpdateOverlay);
                    } catch (e) {
                        console.debug('[FishBowlTinyMceInspectOverlay] Could not remove input listener', e);
                    }
                    iframe.__fishbowlInspectUpdateOverlay = null;
                }

                if (layer.__fishbowlTypingDebounce) {
                    clearTimeout(layer.__fishbowlTypingDebounce);
                    layer.__fishbowlTypingDebounce = null;
                }

                // Remove the injected hide style so original text is visible again
                try {
                    this.removeHideStyle(iframe);
                } catch (e) {
                    console.warn('[FishBowlTinyMceInspectOverlay] Failed to remove hide style', e);
                }

                // Update button
                const button = layer.querySelector('.fishbowl-textarea-inspect-button');
                if (button) {
                    const stillHasEntities = this.hasEntities(this.readIframeText(iframe));
                    if (stillHasEntities) {
                        button.textContent = '[ Show ]';
                        button.title = 'Show TinyMCE overlay highlights';
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
                    this.setOverlayContent(iframe, overlay, this.cloneBodyWithHighlights(iframe));
                    this.syncOverlayStyles(iframe, overlay);
                    this.syncOverlayScroll(iframe, overlay);

                    overlay.classList.remove('fishbowl-textarea-overlay-typing');
                }

                this.ensureLayerPosition(iframe, layer);

                const button = layer.querySelector('.fishbowl-textarea-inspect-button');
                if (button) {
                    button.textContent = '[×]';
                    button.title = 'Dismiss TinyMCE overlay highlights';
                }

                this.resetButtonAutoHide(layer);
                return;
            }

            // --- Activation ---
            layer.classList.add('fishbowl-textarea-inspect-active');
            layer.__fishbowlManuallyDismissed = false;

            const overlay = document.createElement('div');
            overlay.className = 'fishbowl-textarea-inspect-overlay';

            // Typing-aware update:
            // 1. On keystroke, immediately update overlay with clean HTML (no highlights)
            // 2. After debounce pause, re-render with full highlights in the DOM clone
            const updateOverlay = () => {
                this.setOverlayContent(iframe, overlay, this.getCleanBodyHtml(iframe));
                this.syncOverlayScroll(iframe, overlay);

                overlay.classList.add('fishbowl-textarea-overlay-typing');

                if (layer.__fishbowlTypingDebounce) {
                    clearTimeout(layer.__fishbowlTypingDebounce);
                }

                layer.__fishbowlTypingDebounce = setTimeout(() => {
                    layer.__fishbowlTypingDebounce = null;
                    this.setOverlayContent(iframe, overlay, this.cloneBodyWithHighlights(iframe));
                    this.syncOverlayScroll(iframe, overlay);

                    overlay.classList.remove('fishbowl-textarea-overlay-typing');

                    // Auto-dismiss if no entities remain
                    if (!this.hasEntities(this.readIframeText(iframe))) {
                        this.toggleOverlay(iframe, layer, { forceOff: true });
                    }
                }, this.typingDebounceMs);
            };

            const syncScroll = () => {
                this.syncOverlayScroll(iframe, overlay);
            };

            // Save original body color BEFORE making it transparent
            try {
                const body = iframe.contentDocument.body;
                if (body) {
                    const computed = iframe.contentWindow.getComputedStyle(body);
                    iframe.__fishbowlOriginalBodyColor = computed.color;
                }
            } catch (e) {
                console.warn('[FishBowlTinyMceInspectOverlay] Failed to read original body color', e);
            }

            layer.appendChild(overlay);
            this.setOverlayContent(iframe, overlay, this.cloneBodyWithHighlights(iframe));
            this.syncOverlayStyles(iframe, overlay);
            this.syncOverlayScroll(iframe, overlay);

            this.ensureLayerPosition(iframe, layer);

            // Listen to events on iframe content
            try {
                iframe.__fishbowlInspectSyncScroll = syncScroll;
                iframe.__fishbowlInspectUpdateOverlay = updateOverlay;
                iframe.contentWindow.addEventListener('scroll', syncScroll);
                iframe.contentDocument.addEventListener('input', updateOverlay);
            } catch (e) {
                console.warn('[FishBowlTinyMceInspectOverlay] Failed to attach iframe event listeners', e);
            }

            // Hide ALL text in the iframe (including links, inline-styled spans, etc.)
            // by injecting a <style> rule. caret-color keeps the editing caret visible.
            try {
                this.injectHideStyle(iframe);
            } catch (e) {
                console.warn('[FishBowlTinyMceInspectOverlay] Failed to inject hide style', e);
            }

            // Update button state
            const button = layer.querySelector('.fishbowl-textarea-inspect-button');
            if (button) {
                button.style.display = '';
                button.textContent = '[×]';
                button.title = 'Dismiss TinyMCE overlay highlights';
            }

            this.resetButtonAutoHide(layer);
        } catch (e) {
            console.error('[FishBowlTinyMceInspectOverlay] Failed to toggle overlay', e);
        }
    }

    // ── Iframe Text Hide/Show ─────────────────────────────────────────

    injectHideStyle(iframe) {
        try {
            const doc = iframe?.contentDocument;
            if (!doc) return;
            // Avoid duplicate injection
            if (doc.getElementById('fishbowl-overlay-text-hide')) return;

            const caretColor = iframe.__fishbowlOriginalBodyColor || 'black';
            const style = doc.createElement('style');
            style.id = 'fishbowl-overlay-text-hide';
            style.textContent = [
                'body, body * {',
                '  color: transparent !important;',
                '  text-shadow: none !important;',
                '  -webkit-text-fill-color: transparent !important;',
                '}',
                'body {',
                `  caret-color: ${caretColor} !important;`,
                '}'
            ].join('\n');
            doc.head.appendChild(style);
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to inject hide style', e);
        }
    }

    removeHideStyle(iframe) {
        try {
            const doc = iframe?.contentDocument;
            if (!doc) return;
            const el = doc.getElementById('fishbowl-overlay-text-hide');
            if (el) el.remove();
        } catch (e) {
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to remove hide style', e);
        }
    }

    // ── Button Auto-Hide ──────────────────────────────────────────────

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
            console.warn('[FishBowlTinyMceInspectOverlay] Failed to reset button auto-hide', e);
        }
    }
}

window.FishBowlTinyMceInspectOverlay = window.FishBowlTinyMceInspectOverlay || FishBowlTinyMceInspectOverlay;
