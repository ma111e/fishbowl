/**
 * FishBowl - BaseInspectOverlay
 *
 * Shared base class for FishBowlTextareaInspectOverlay and
 * FishBowlTinyMceInspectOverlay. Both subclasses extend this and override
 * source-specific methods (layer creation, text reading, position sync).
 *
 * Must be loaded before either concrete overlay file.
 */

class FishBowlBaseInspectOverlay {
    constructor(options = {}) {
        // Shared option callbacks
        this.renderTextWithIndicators = typeof options.renderTextWithIndicators === 'function'
            ? options.renderTextWithIndicators
            : (text) => (text || '');

        this.hasEntities = typeof options.hasEntities === 'function'
            ? options.hasEntities
            : (_text) => false;

        this.escapeHtml = typeof options.escapeHtml === 'function'
            ? options.escapeHtml
            : (text) => (text || '').toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

        // Debounce delay (ms) after last keystroke before highlights reappear
        this.typingDebounceMs = typeof options.typingDebounceMs === 'number'
            ? options.typingDebounceMs
            : 400;

        this.enabled = true;
    }

    // ── Theme detection ───────────────────────────────────────────────────────

    /**
     * Returns true when a CSS background-color value is effectively white/light,
     * used to force the dark-FishBowl-text style on light-background overlays.
     * @param {string} cssColor
     * @returns {boolean}
     */
    isEffectivelyWhiteBackground(cssColor) {
        try {
            if (!cssColor) return false;
            const lower = cssColor.toString().trim().toLowerCase();
            if (lower === 'white' || lower === '#fff' || lower === '#ffffff') return true;

            const match = lower.match(/^rgba?\(([^)]+)\)$/);
            if (!match) return false;

            const parts = match[1].split(',').map(p => p.trim()).filter(Boolean);
            if (parts.length < 3) return false;

            const r = Number.parseFloat(parts[0]);
            const g = Number.parseFloat(parts[1]);
            const b = Number.parseFloat(parts[2]);

            if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return false;

            if (parts.length >= 4) {
                const a = Number.parseFloat(parts[3]);
                if (Number.isFinite(a) && a === 0) return false;
            }

            return r >= 250 && g >= 250 && b >= 250;
        } catch (e) {
            console.warn('[FB:BaseInspectOverlay] Failed to evaluate background color', e);
            return false;
        }
    }

    // ── Enabled state ─────────────────────────────────────────────────────────

    setEnabled(enabled) {
        this.enabled = !!enabled;
    }

    // ── Source ID helpers ─────────────────────────────────────────────────────

    /**
     * Assign or read back a stable fishbowl source ID on an element.
     * Both data-attribute and dataset paths are kept in sync so callers can
     * use either.
     * @param {Element} el
     * @param {string} prefix  e.g. 'textarea' or 'tinymce'
     * @returns {string}
     */
    getOrAssignSourceId(el, prefix) {
        try {
            if (!el) return '';
            if (el.dataset && el.dataset.fishbowlSourceId) {
                return el.dataset.fishbowlSourceId;
            }
            const existing = el.getAttribute('data-fishbowl-source-id');
            if (existing) {
                if (el.dataset) el.dataset.fishbowlSourceId = existing;
                return existing;
            }
            const sourceId = `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
            if (el.dataset) el.dataset.fishbowlSourceId = sourceId;
            el.setAttribute('data-fishbowl-source-id', sourceId);
            return sourceId;
        } catch (e) {
            console.warn('[FB:BaseInspectOverlay] Failed to assign source id', e);
            return '';
        }
    }

    // ── Orphan layer cleanup ──────────────────────────────────────────────────

    /**
     * Remove any overlay layers whose anchor element (textarea/iframe) is no
     * longer present in the document.
     * @param {string} layerAttr    data-attribute that marks layer elements, e.g. 'data-fishbowl-textarea-inspect-layer'
     * @param {string} anchorProp   __fishbowl* property name on the layer that holds the anchor element
     */
    cleanupOrphanedLayers(layerAttr, anchorProp) {
        try {
            const selector = `[${layerAttr}="true"]`;
            const layers = Array.from(document.querySelectorAll(selector));
            for (const layer of layers) {
                try {
                    const anchor = layer[anchorProp];
                    if (!anchor || !document.contains(anchor)) {
                        try { layer.remove(); } catch (e2) {
                            console.warn('[FB:BaseInspectOverlay] Failed to remove orphaned layer', e2);
                        }
                    }
                } catch (e) {
                    console.warn('[FB:BaseInspectOverlay] Failed while checking orphaned layer', e);
                }
            }
        } catch (e) {
            console.warn('[FB:BaseInspectOverlay] Failed to cleanup orphaned layers', e);
        }
    }

    /**
     * Remove all layers matching the given data-attribute selector.
     * @param {string} layerAttr
     */
    removeAllLayers(layerAttr) {
        try {
            const selector = `[${layerAttr}="true"]`;
            const layers = Array.from(document.querySelectorAll(selector));
            for (const layer of layers) {
                try { layer.remove(); } catch (e2) { console.debug('[FB:BaseInspectOverlay] Failed to remove layer in removeAllLayers', e2); }
            }
        } catch (e) {
            console.warn('[FB:BaseInspectOverlay] Failed to remove all layers', e);
        }
    }
}

window.FishBowlBaseInspectOverlay = window.FishBowlBaseInspectOverlay || FishBowlBaseInspectOverlay;
