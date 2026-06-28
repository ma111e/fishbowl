/**
 * FishBowl - Settings Sync (content-script layer)
 *
 * Provides a subscribe() API for content scripts to react to settings changes.
 * Uses storage.onChanged as the primary notification channel, which closes the
 * registration-order race that message-only listeners have on fresh page loads.
 *
 * Usage:
 *   FishBowlSettingsSync.subscribe(settings => { ... });
 *
 * The listener fires immediately with the current stored settings (async),
 * then again whenever settings are written to storage from any context.
 */
(function (root) {
    'use strict';

    const _subscribers = [];
    let _current = null;

    function _notify(settings) {
        if (!settings) return;
        _current = settings;
        for (const fn of _subscribers) {
            try { fn(settings); } catch (e) {
                console.warn('[FB:SettingsSync] subscriber threw', e);
            }
        }
    }

    // Runtime messages from the popup's broadcastSettingsUpdated()
    try {
        browser.runtime.onMessage.addListener((message) => {
            if (message && message.action === 'settingsUpdated' && message.settings) {
                _notify(message.settings);
            }
        });
    } catch (e) { console.debug('[FB:SettingsSync] Not in extension context; skipping listener registration', e); }

    // Storage events close the timing race: fired regardless of when subscribers register
    try {
        browser.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.settings) return;
            const newValue = changes.settings.newValue;
            if (newValue) _notify(newValue);
        });
    } catch (e) { console.debug('[FB:SettingsSync] Not in extension context; skipping listener registration', e); }

    /**
     * Subscribe to settings changes.
     * Fires immediately with the current settings (async load), then on every change.
     * @param {function(object): void} listener
     */
    function subscribe(listener) {
        if (typeof listener !== 'function') return;
        _subscribers.push(listener);

        if (_current) {
            try { listener(_current); } catch (e) { console.debug('[FB:SettingsSync] settings subscriber threw on immediate dispatch', e); }
        } else {
            try {
                browser.storage.local.get(['settings']).then(result => {
                    const settings = result && result.settings;
                    if (settings && !_current) {
                        _current = settings;
                        try { listener(settings); } catch (e) { console.debug('[FB:SettingsSync] settings subscriber threw on initial load', e); }
                    }
                }).catch(() => {});
            } catch (e) { console.debug('[FB:SettingsSync] Not in extension context; skipping listener registration', e); }
        }
    }

    root.FishBowlSettingsSync = Object.freeze({ subscribe });

})(typeof window !== 'undefined' ? window : globalThis);
