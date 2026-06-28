/**
 * FishBowl Security Extension - UI Manager Execution Mode
 * Handles execution mode toggle, outside-click exit, and shortcuts hint overlay.
 */

class FishBowlExecutionMode {
    constructor(opts) {
        this.opts = opts || {};
        this.executionMode = false;
        this.shortcutsHintElement = null;
        this.boundExitOnOutsideClick = this._exitOnOutsideClick.bind(this);
    }

    /**
     * Returns the shadow root where HUD elements live, or document as fallback.
     */
    getRoot() {
        return window.fishTankHUD?.hudShadowRoot || document;
    }

    /**
     * Toggle the execution mode on/off
     */
    toggle() {
        this.executionMode = !this.executionMode;

        if (this.executionMode) {
            const host = window.fishTankHUD?.hudHost;
            if (host) host.classList.add('fishbowl-execution-mode');
            document.body.classList.add('fishbowl-execution-mode');

            document.addEventListener('click', this.boundExitOnOutsideClick, true);

            if (window.FishBowlDraggablePanels && typeof window.FishBowlDraggablePanels.enable === 'function') {
                window.FishBowlDraggablePanels.enable();
            }

            this.createShortcutsHint();

        } else {
            const host2 = window.fishTankHUD?.hudHost;
            if (host2) host2.classList.remove('fishbowl-execution-mode');
            document.body.classList.remove('fishbowl-execution-mode');

            document.removeEventListener('click', this.boundExitOnOutsideClick, true);

            if (window.FishBowlDraggablePanels && typeof window.FishBowlDraggablePanels.disable === 'function') {
                window.FishBowlDraggablePanels.disable();
            }

            this.removeShortcutsHint();
        }
    }

    /**
     * Exit execution mode when clicking outside HUD elements
     */
    _exitOnOutsideClick(e) {
        try {
            if (!this.executionMode) {
                return;
            }

            const target = e?.target;
            if (!target || !target.closest) {
                return;
            }

            if (
                target.closest('fishbowl-hud') ||
                target.closest('.fishbowl-hud') ||
                target.closest('.fishbowl-panel') ||
                target.closest('.info-panel') ||
                target.closest('.fishbowl-drag-overlay') ||
                target.closest('.fishbowl-resize-handle')
            ) {
                return;
            }

            // Also check if click was inside the shadow root
            const hudHost = window.fishTankHUD?.hudHost;
            if (hudHost && hudHost.contains(target)) {
                return;
            }

            this.toggle();
        } catch (e) {
            console.warn('[FishBowl ExecutionMode] Failed to exit execution mode on outside click', e);
        }
    }

    /**
     * Create a hint element to display available shortcuts in execution mode
     */
    createShortcutsHint() {
        this.removeShortcutsHint();

        this.shortcutsHintElement = document.createElement('div');
        this.shortcutsHintElement.className = 'fishbowl-shortcuts-hint';

        const header = document.createElement('div');
        header.className = 'fishbowl-shortcuts-header';
        header.textContent = 'FishBowl Execution Mode';

        const list = document.createElement('ul');

        const shortcuts = [
            { key: 'S', description: 'Select region for scan' },
            { key: 'R', description: 'Rescan DOM elements' },
            { key: 'P', description: 'Show/hide panels' },
            { key: 'H', description: 'Hide HUD' },
            { key: 'C', description: 'Reset UI positions' },
            { key: 'V', description: 'Show/hide textarea overlays' },
            { key: 'A', description: 'Remount FishBowl overlay' },
            { key: 'T', description: 'Switch UI Theme' },
            { key: 'O', description: 'Open Investigation Sandbox' },
            { key: 'N', description: 'Create new investigation' },
            { key: 'I', description: 'Import page to sandbox' },
            { key: ':', description: 'Search entities' },
            { key: 'E', description: 'Entity Inspector' },
            { key: 'ESC', description: 'Cancel action' }
        ];

        shortcuts.forEach(shortcut => {
            const item = document.createElement('li');
            const keySpan = document.createElement('span');
            keySpan.className = 'fishbowl-shortcut-key';
            keySpan.textContent = shortcut.key;

            const descSpan = document.createElement('span');
            descSpan.className = 'fishbowl-shortcut-desc';
            descSpan.textContent = shortcut.description;

            item.appendChild(keySpan);
            item.appendChild(descSpan);
            list.appendChild(item);
        });

        this.shortcutsHintElement.appendChild(header);
        this.shortcutsHintElement.appendChild(list);

        // Append inside shadow root so it's styled correctly
        const root = this.getRoot();
        if (root && typeof root.appendChild === 'function') {
            root.appendChild(this.shortcutsHintElement);
        } else {
            document.body.appendChild(this.shortcutsHintElement);
        }
    }

    /**
     * Remove the shortcuts hint element
     */
    removeShortcutsHint() {
        if (this.shortcutsHintElement && this.shortcutsHintElement.parentNode) {
            this.shortcutsHintElement.parentNode.removeChild(this.shortcutsHintElement);
            this.shortcutsHintElement = null;
        }
    }
}

window.FishBowlExecutionMode = FishBowlExecutionMode;
