/**
 * FishBowl Popup - Debug Controls
 * Handles the Debug tab: execution mode toggle and action buttons.
 */

class FishBowlPopupDebugControls {
  constructor() {
    this.unsupportedUrlPattern = /^(about:|chrome:|edge:|moz-extension:|chrome-extension:)/i;

    this.actionCommands = [
      { buttonId: 'debug-exec-region-selection', command: 'regionSelection' },
      { buttonId: 'debug-exec-rescan',           command: 'rescan' },
      { buttonId: 'debug-exec-toggle-panels',    command: 'togglePanels' },
      { buttonId: 'debug-exec-toggle-highlights', command: 'toggleHighlights' },
      { buttonId: 'debug-exec-toggle-hud',       command: 'toggleHud' },
      { buttonId: 'debug-exec-reset-panels',     command: 'resetPanelPositions' },
      { buttonId: 'debug-exec-remount-overlay',  command: 'remountOverlay' },
      { buttonId: 'debug-exec-toggle-theme',     command: 'toggleTheme' },
      { buttonId: 'debug-exec-entity-search',    command: 'entitySearch' },
      { buttonId: 'debug-exec-cancel',           command: 'cancel' }
    ];
  }

  init() {
    const toggleButton = document.getElementById('debug-toggle-execution-mode');
    const statusLabel = document.getElementById('debug-execution-mode-status');

    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        if (statusLabel) statusLabel.textContent = '...';

        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs?.[0];
          const tabId = tab?.id;
          const tabUrl = tab?.url || '';

          if (!tabId) {
            if (statusLabel) statusLabel.textContent = 'No active tab';
            return;
          }

          if (!tabUrl || this.unsupportedUrlPattern.test(tabUrl)) {
            if (statusLabel) statusLabel.textContent = 'Unsupported page';
            return;
          }

          browser.tabs.sendMessage(tabId, { action: 'toggleExecutionMode' })
            .then((resp) => {
              const enabled = !!resp?.executionMode;
              if (statusLabel) statusLabel.textContent = enabled ? 'Enabled' : 'Disabled';
            })
            .catch(() => {
              if (statusLabel) statusLabel.textContent = 'FishBowl not running on this page';
            });
        });
      });
    }

    this.actionCommands.forEach(({ buttonId, command }) => {
      const btn = document.getElementById(buttonId);
      if (btn) {
        btn.addEventListener('click', () => this._sendCommand(command));
      }
    });
  }

  _sendCommand(command) {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      const tabId = tab?.id;
      const tabUrl = tab?.url || '';
      if (!tabId) return;
      if (!tabUrl || this.unsupportedUrlPattern.test(tabUrl)) return;
      browser.tabs.sendMessage(tabId, { action: 'runExecutionModeAction', command }).catch((err) => {
        console.warn('[FishBowl Popup] Failed to send execution mode command', command, err);
      });
    });
  }
}
