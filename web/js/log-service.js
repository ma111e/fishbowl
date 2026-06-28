/**
 * FishBowl - Log Service
 *
 * Provides levelled logging with:
 *  - Persistent activity-log storage in browser.storage.local (for the popup Logs tab)
 *  - Console output gated by log level (default: warn in production, debug when
 *    localStorage.fishbowlDebug === '1')
 *  - Standardised prefix: [FB:<module>]
 *
 * Usage:
 *   const log = FishBowlLog.for('SecurityHUD');
 *   log.debug('initialising');
 *   log.info('HUD created');
 *   log.warn('missing panel', panelId);
 *   log.error('crash', err);
 */

(function (root) {
    'use strict';

    // ── Log levels (ordered lowest → highest severity) ────────────────────────
    const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

    // Detect debug mode: set localStorage.fishbowlDebug = '1' in the console to
    // enable debug output without rebuilding the extension.
    function isDebugMode() {
        try {
            return (typeof localStorage !== 'undefined' && localStorage.getItem('fishbowlDebug') === '1');
        } catch (e) { console.debug('[FB:LogService] isDebugMode check failed', e); return false; }
    }

    function getMinLevel() {
        return isDebugMode() ? LEVELS.debug : LEVELS.warn;
    }

    // ── Storage persistence (activity logs) ───────────────────────────────────
    const MAX_STORED_LOGS = 500;

    async function persist(type, message) {
        try {
            if (typeof browser === 'undefined' || !browser?.storage?.local) return;
            const result = await browser.storage.local.get(['activityLogs']);
            let logs = result.activityLogs || [];
            logs.push({ type, message, timestamp: Date.now() });
            if (logs.length > MAX_STORED_LOGS) logs = logs.slice(-MAX_STORED_LOGS);
            await browser.storage.local.set({ activityLogs: logs });
        } catch (e) { console.debug('[FB:LogService] Failed to persist activity log', e); }
    }

    // ── Console output ────────────────────────────────────────────────────────
    const consoleFn = {
        debug: console.debug.bind(console),
        info:  console.info.bind(console),
        warn:  console.warn.bind(console),
        error: console.error.bind(console),
    };

    function emit(level, module, args) {
        if (LEVELS[level] < getMinLevel()) return;
        const prefix = `[FB:${module}]`;
        consoleFn[level](prefix, ...args);
    }

    // ── Per-module logger factory ─────────────────────────────────────────────
    function forModule(module) {
        const m = (module || 'unknown').replace(/\s+/g, '-');
        return {
            debug: (...args) => emit('debug', m, args),
            info:  (...args) => { emit('info', m, args); persist('info', args.join(' ')); },
            warn:  (...args) => { emit('warn', m, args); persist('warning', args.join(' ')); },
            error: (...args) => { emit('error', m, args); persist('error', args.join(' ')); },
        };
    }

    // ── Legacy class API (kept for backward compatibility) ────────────────────
    // Old code did: window.FishBowlLogService = new FishBowlLogService()
    // and called logService.info(msg) / logService.warning(msg) / logService.error(msg)
    class FishBowlLogService {
        constructor() {
            this.LOG_TYPES = { INFO: 'info', WARNING: 'warning', ERROR: 'error' };
            this.MAX_LOGS = MAX_STORED_LOGS;
            this._log = forModule('LogService');
        }

        async addLog(type, message) {
            await persist(type, message);
        }

        async getLogs() {
            try {
                const result = await browser.storage.local.get(['activityLogs']);
                return result.activityLogs || [];
            } catch (e) { console.debug('[FB:LogService] Failed to read activity logs', e); return []; }
        }

        async clearLogs() {
            try {
                await browser.storage.local.set({ activityLogs: [] });
            } catch (e) { console.debug('[FB:LogService] Failed to clear activity logs', e); }
        }

        async info(message)    { await persist('info', message); }
        async warning(message) { await persist('warning', message); }
        async error(message)   { await persist('error', message); }
    }

    root.FishBowlLog = Object.freeze({ for: forModule });
    root.FishBowlLogService = FishBowlLogService;

})(typeof window !== 'undefined' ? window : globalThis);
