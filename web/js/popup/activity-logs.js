/**
 * FishBowl Popup - Activity Logs
 * Handles log display, clearing, and cache purge in the popup.
 */

class FishBowlPopupActivityLogs {
  constructor(opts) {
    this.logsListId = (opts && opts.logsListId) || 'logs-list';
    this.emptyMessageSelector = (opts && opts.emptyMessageSelector) || '.empty-logs-message';
  }

  loadLogs() {
    const logsList = document.getElementById(this.logsListId);
    const emptyMessage = document.querySelector(this.emptyMessageSelector);

    browser.storage.local.get(['activityLogs'], (result) => {
      const logs = result.activityLogs || [];

      logsList.innerHTML = '';

      if (logs.length === 0) {
        if (emptyMessage) logsList.appendChild(emptyMessage);
        return;
      }

      logs.reverse().forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = 'fb-log-entry';

        const timestamp = new Date(log.timestamp);
        const formattedTime = timestamp.toLocaleTimeString();

        const timeSpan = document.createElement('span');
        timeSpan.className = 'fb-log-ts';
        timeSpan.textContent = formattedTime;

        const lvMap = { info: 'INFO', warn: 'WARN', warning: 'WARN', error: 'ERR', err: 'ERR', ok: 'OK' };
        const lvClass = { info: 'fb-log-lv-info', warn: 'fb-log-lv-warn', warning: 'fb-log-lv-warn', error: 'fb-log-lv-err', err: 'fb-log-lv-err', ok: 'fb-log-lv-ok' };

        const typeSpan = document.createElement('span');
        typeSpan.className = `fb-log-lv ${lvClass[log.type] || 'fb-log-lv-info'}`;
        typeSpan.textContent = lvMap[log.type] || log.type.toUpperCase();

        const messageSpan = document.createElement('span');
        messageSpan.className = 'fb-log-msg';
        messageSpan.textContent = log.message;

        logEntry.appendChild(timeSpan);
        logEntry.appendChild(typeSpan);
        logEntry.appendChild(messageSpan);

        logsList.appendChild(logEntry);
      });
    });
  }

  clearLogs() {
    browser.storage.local.set({ activityLogs: [] }, () => {
      this.loadLogs();

      const clearLog = {
        type: 'info',
        message: 'Logs cleared by user',
        timestamp: new Date().getTime()
      };

      browser.storage.local.set({ activityLogs: [clearLog] });

      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          browser.tabs.sendMessage(tabs[0].id, {
            action: 'logsCleared'
          });
        }
      });
    });
  }

  purgeCache() {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: 'purgeCache'
        });

        this.addLogEntry('info', 'Analysis cache purged by user');
      }
    });
  }

  addLogEntry(type, message) {
    const logEntry = {
      type: type,
      message: message,
      timestamp: new Date().getTime()
    };

    browser.storage.local.get(['activityLogs'], (result) => {
      const logs = result.activityLogs || [];
      logs.push(logEntry);
      browser.storage.local.set({ activityLogs: logs });

      if (document.querySelector('.fishbowl-popup-tab-button[data-tab="activity-logs"]')?.classList.contains('active')) {
        this.loadLogs();
      }
    });
  }
}
