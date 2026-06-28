/**
 * FishBowl - shared constants
 *
 * Single source of truth for values that were previously scattered as magic
 * literals across multiple files.  Loaded early in both content-script and
 * background contexts (see LOAD_ORDER.md).
 */
(function (root) {
    'use strict';

    // ── Z-index stack ────────────────────────────────────────────────────────
    // Used by: security-hud.js, draggable-panels.js, textarea/tinymce overlays
    const Z = Object.freeze({
        OVERLAY_INSPECT: 99,       // textarea / tinymce inspect overlays
        HUD_BASE:       999_999,   // HUD shadow-host sits above all page content
        PANEL_DRAGGING: 1_000_001, // panel being actively dragged floats above HUD
        MODAL:          1_000_002, // modals / dialogs above dragged panel
    });

    // ── CSS class names ───────────────────────────────────────────────────────
    // Used by: ui-manager/selection.js, dom-highlighter/*, sandbox/*
    const CSS = Object.freeze({
        // DOM highlighter
        HIGHLIGHT:          'fishbowl-highlight',
        HIGHLIGHT_SELECTED: 'fishbowl-highlight selected', // compound selector

        // HUD panel items
        SELECTED:           'selected',
        INFO_PANEL_ITEM:    'info-panel-item',

        // Sandbox workspace
        SB_LINK_MODE:       'sb-link-mode',
        SB_LINK_SOURCE:     'sb-link-source',
        SB_LINK_TARGET:     'sb-link-target',
        SB_VERDICT_BASE:    'sb-verdict',
        SB_VERDICT_PREFIX:  'sb-verdict-',

        // Verdict classes applied to highlights / badges
        VERDICT_PREFIX:     'fishbowl-verdict-',
    });

    // ── Verdict ordering (highest-threat first) ───────────────────────────────
    // Used by: coordinator.js (×1), sandbox-data.js (×3) - was duplicated
    const VERDICT_PRIORITY = Object.freeze(['malicious', 'suspicious', 'neutral', 'benign', 'unknown']);

    // ── Background timing constants (ms) ─────────────────────────────────────
    // Used by: tab-lifecycle.js - pulled out so they are tuneable without
    // hunting through logic code.
    const TIMING = Object.freeze({
        TAB_ANALYSIS_TIMEOUT_MS:    30_000, // abort analysis if tab never signals done
        POST_CHALLENGE_DELAY_MS:     2_000, // wait after captcha before re-extracting
        DOM_EXTRACT_DELAY_MS:          500, // settle time after DOM signals ready
        TAB_CHECK_INTERVAL_MS:       1_000, // polling interval while waiting for tab
        TAB_QUEUE_WATCHDOG_MS:      60_000, // force-release stuck queue slot
        POST_JSON_TIMEOUT_MS:       20_000, // abort signed fetch if backend doesn't reply
        API_SERVICE_TIMEOUT_MS:     25_000, // per-API-service deadline inside Promise.allSettled
        ANALYSIS_SAFETY_TIMEOUT_MS: 90_000, // outer safety net for a whole reputation analysis
    });

    root.FishBowlConstants = Object.freeze({ Z, CSS, VERDICT_PRIORITY, TIMING });

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
