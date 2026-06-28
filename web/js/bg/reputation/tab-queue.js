(function () {
    globalThis.FishBowlBgTabQueue = globalThis.FishBowlBgTabQueue || {};

    const log = globalThis.FishBowlLog?.for('BG:TabQueue') || {
        debug: () => {}, info: () => {},
        warn: console.warn.bind(console, '[BG:TabQueue]'),
        error: console.error.bind(console, '[BG:TabQueue]')
    };

    const MAX_CONCURRENT = 5;
    const MAX_QUEUE_LENGTH = 50;

    let _activeCount = 0;
    const _queue = [];

    function _notifyDrop(launcher, reason) {
        try {
            launcher.onDrop?.(reason);
        } catch (e) {
            log.error('onDrop callback threw', e);
        }
        // Legacy hook kept for callers that attached `.drop()` directly.
        try {
            launcher.drop?.();
        } catch (e) {
            log.error('legacy drop() hook threw', e);
        }
    }

    function _flush() {
        while (_activeCount < MAX_CONCURRENT && _queue.length > 0) {
            const { launcher, watchdog } = _queue.shift();
            _activeCount++;
            clearTimeout(watchdog);
            try {
                launcher();
            } catch (e) {
                log.error('Launcher threw synchronously', e);
                _activeCount--;
                _notifyDrop(launcher, 'launcher_threw');
            }
        }
    }

    FishBowlBgTabQueue.enqueue = function enqueue(launcher) {
        if (_queue.length >= MAX_QUEUE_LENGTH) {
            log.warn(`Queue full (${MAX_QUEUE_LENGTH} pending) - dropping launcher`);
            _notifyDrop(launcher, 'queue_full');
            return;
        }

        // Watchdog: if an item sits in the queue longer than the tab analysis
        // timeout, something is stuck - force a release so the queue drains.
        const watchdogMs = globalThis.FishBowlConstants?.TIMING.TAB_QUEUE_WATCHDOG_MS ?? 60_000;
        const watchdog = setTimeout(() => {
            const idx = _queue.findIndex(entry => entry.watchdog === watchdog);
            if (idx !== -1) {
                const [removed] = _queue.splice(idx, 1);
                log.warn('Watchdog fired: removed a stale queued launcher');
                _notifyDrop(removed.launcher, 'queue_watchdog');
            }
        }, watchdogMs);

        _queue.push({ launcher, watchdog });
        _flush();
    };

    FishBowlBgTabQueue.release = function release() {
        if (_activeCount > 0) {
            _activeCount--;
        }
        _flush();
    };
})();
