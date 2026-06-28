/**
 * FishBowl - Lifecycle Utilities
 *
 * Three small utilities used across content scripts, background, sandbox, and popup:
 *
 *   ListenerRegistry  - tracks addEventListener calls and removes them all at once.
 *   ObserverRegistry  - same, for MutationObserver / ResizeObserver / IntersectionObserver.
 *   Lifecycle         - base mixin; subclasses override init() / destroy().
 *
 * Usage:
 *   class MyThing extends FishBowlLifecycle.Lifecycle {
 *       init() {
 *           super.init();
 *           this.listeners.add(document, 'click', this._onClick.bind(this));
 *           this.observers.observe(someEl, new MutationObserver(...), { childList: true });
 *       }
 *       destroy() {
 *           super.destroy(); // removes all listeners + observers
 *       }
 *   }
 */

(function (root) {
    'use strict';

    // ── ListenerRegistry ──────────────────────────────────────────────────────
    // Tracks { target, event, handler, opts } tuples so they can all be removed
    // via a single removeAll() call. Using a plain array rather than a WeakMap
    // because we need to iterate all entries at destroy time regardless of
    // whether targets are still alive.

    class ListenerRegistry {
        constructor() {
            this._entries = [];
        }

        /**
         * Add an event listener and remember it for later removal.
         * @param {EventTarget} target
         * @param {string} event
         * @param {Function} handler
         * @param {AddEventListenerOptions|boolean} [opts]
         */
        add(target, event, handler, opts) {
            if (!target || typeof target.addEventListener !== 'function') return;
            target.addEventListener(event, handler, opts);
            this._entries.push({ target, event, handler, opts });
        }

        /** Remove every tracked listener. */
        removeAll() {
            for (const { target, event, handler, opts } of this._entries) {
                try {
                    target.removeEventListener(event, handler, opts);
                } catch (e) { console.debug('[FB:Lifecycle] Failed to remove tracked listener (target may be gone)', e); }
            }
            this._entries = [];
        }
    }

    // ── ObserverRegistry ──────────────────────────────────────────────────────
    // Tracks observer instances so they can all be disconnected at once.
    // Supports MutationObserver, ResizeObserver, and IntersectionObserver —
    // all three share the same .observe() / .disconnect() interface.

    class ObserverRegistry {
        constructor() {
            this._observers = [];
        }

        /**
         * Call observer.observe(target, opts) and remember the observer.
         * @param {Element} target
         * @param {MutationObserver|ResizeObserver|IntersectionObserver} observer
         * @param {object} [opts]
         */
        observe(target, observer, opts) {
            if (!observer || typeof observer.observe !== 'function') return;
            observer.observe(target, opts);
            this._observers.push(observer);
        }

        /** Disconnect every tracked observer. */
        disconnectAll() {
            for (const obs of this._observers) {
                try { obs.disconnect(); } catch (e) { console.debug('[FB:Lifecycle] Failed to disconnect tracked observer', e); }
            }
            this._observers = [];
        }
    }

    // ── Lifecycle base mixin ──────────────────────────────────────────────────

    class Lifecycle {
        constructor() {
            this.listeners = new ListenerRegistry();
            this.observers = new ObserverRegistry();
            this._initialized = false;
        }

        /**
         * Perform setup. Subclasses should call super.init() first so the
         * registries are clean before wiring new listeners/observers.
         */
        init() {
            this._initialized = true;
        }

        /**
         * Tear down: removes all registered event listeners and disconnects all
         * observers. Subclasses can override to add extra cleanup - call
         * super.destroy() last so listeners are dropped after the subclass has
         * finished using them.
         */
        destroy() {
            this.listeners.removeAll();
            this.observers.disconnectAll();
            this._initialized = false;
        }

        get initialized() {
            return this._initialized;
        }
    }

    // ── Exports ───────────────────────────────────────────────────────────────

    root.FishBowlLifecycle = Object.freeze({ ListenerRegistry, ObserverRegistry, Lifecycle });

})(typeof window !== 'undefined' ? window : globalThis);
