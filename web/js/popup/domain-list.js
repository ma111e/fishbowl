/**
 * FishBowl Popup - Generic Domain List Manager
 * Reusable class for managing domain lists (whitelist, CSP override, etc.)
 */

class FishBowlPopupDomainList {
  constructor(opts) {
    this.listElementId = opts.listElementId;
    this.statusElementId = opts.statusElementId;
    this.inputElementId = opts.inputElementId;
    this.previewElementId = opts.previewElementId;
    this.currentSiteToggleId = opts.currentSiteToggleId;
    this.currentDomainLabelId = opts.currentDomainLabelId;
    this.addButtonId = opts.addButtonId;
    this.clearButtonId = opts.clearButtonId;
    this.settingsKey = opts.settingsKey;
    this.emptyStatusMessage = opts.emptyStatusMessage || 'No domains configured.';
    this.activeStatusTemplate = opts.activeStatusTemplate || 'Enabled for {count} domain(s).';
    this.onAfterChange = opts.onAfterChange || null;
  }

  populate(domains) {
    const list = document.getElementById(this.listElementId);
    if (!list) return;

    list.innerHTML = '';
    if (!domains || domains.length === 0) return;

    domains.forEach(domain => {
      const li = document.createElement('li');
      li.className = 'whitelist-item';

      const text = document.createElement('span');
      text.className = 'whitelist-item-text';
      text.textContent = domain;

      const removeButton = document.createElement('button');
      removeButton.className = 'remove-whitelist-domain';
      removeButton.textContent = 'x';
      removeButton.title = 'Remove domain';
      removeButton.addEventListener('click', () => {
        this.removeDomain(domain);
      });

      li.appendChild(text);
      li.appendChild(removeButton);
      list.appendChild(li);
    });
  }

  updateStatus(domains) {
    const status = document.getElementById(this.statusElementId);
    if (!status) return;

    if (!domains || domains.length === 0) {
      status.textContent = this.emptyStatusMessage;
      status.className = 'whitelist-status info';
      return;
    }

    status.textContent = this.activeStatusTemplate.replace('{count}', domains.length);
    status.className = 'whitelist-status success';
  }

  updatePreview() {
    const input = document.getElementById(this.inputElementId);
    const preview = document.getElementById(this.previewElementId);
    if (!input || !preview) return;

    const extracted = FishBowlConsts.extractDomainFromUserInput(input.value);

    if (!input.value.trim()) {
      preview.textContent = '';
      preview.className = 'fishbowl-popup-whitelist-domain-preview';
      return;
    }

    if (!extracted) {
      preview.textContent = 'Invalid domain/URL';
      preview.className = 'fishbowl-popup-whitelist-domain-preview error';
      return;
    }

    preview.textContent = `Will add: ${extracted}`;
    preview.className = 'fishbowl-popup-whitelist-domain-preview success';
  }

  updateCurrentSiteSwitch(domains) {
    const toggle = document.getElementById(this.currentSiteToggleId);
    const label = document.getElementById(this.currentDomainLabelId);
    if (!toggle || !label) return;

    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs?.[0]?.url || '';
      const host = FishBowlConsts.extractDomainFromUserInput(tabUrl);
      label.textContent = host || '(unknown)';

      const normalized = Array.isArray(domains)
        ? domains.map(d => (d || '').toString().trim().toLowerCase()).filter(Boolean)
        : [];
      const current = (host || '').toLowerCase();
      toggle.checked = !!(current && normalized.includes(current));
    });
  }

  addDomain() {
    const input = document.getElementById(this.inputElementId);
    const domain = FishBowlConsts.extractDomainFromUserInput(input?.value);

    if (!domain) {
      this._showError('Please enter a domain');
      return;
    }

    browser.storage.local.get(['settings'], (result) => {
      const settings = result.settings;
      if (!Array.isArray(settings[this.settingsKey])) {
        settings[this.settingsKey] = [];
      }

      if (settings[this.settingsKey].includes(domain)) {
        this._showError('Domain already in list');
        return;
      }

      settings[this.settingsKey].push(domain);
      browser.storage.local.set({ settings }, () => {
        if (input) input.value = '';
        this.updatePreview();
        this.populate(settings[this.settingsKey]);
        this.updateStatus(settings[this.settingsKey]);
        this.updateCurrentSiteSwitch(settings[this.settingsKey]);
        if (this.onAfterChange) this.onAfterChange(settings);
      });
    });
  }

  removeDomain(domainToRemove) {
    browser.storage.local.get(['settings'], (result) => {
      const settings = result.settings;
      if (!Array.isArray(settings[this.settingsKey])) {
        settings[this.settingsKey] = [];
      }

      settings[this.settingsKey] = settings[this.settingsKey].filter(d => d !== domainToRemove);
      browser.storage.local.set({ settings }, () => {
        this.populate(settings[this.settingsKey]);
        this.updateStatus(settings[this.settingsKey]);
        this.updateCurrentSiteSwitch(settings[this.settingsKey]);
        if (this.onAfterChange) this.onAfterChange(settings);
      });
    });
  }

  clearAll() {
    browser.storage.local.get(['settings'], (result) => {
      const settings = result.settings;
      settings[this.settingsKey] = [];

      browser.storage.local.set({ settings }, () => {
        this.populate([]);
        this.updateStatus([]);
        this.updateCurrentSiteSwitch([]);
        if (this.onAfterChange) this.onAfterChange(settings);
      });
    });
  }

  toggleCurrentSite(enabled) {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs?.[0]?.url || '';
      const host = FishBowlConsts.extractDomainFromUserInput(tabUrl);
      if (!host) return;

      browser.storage.local.get(['settings'], (result) => {
        const settings = result.settings;
        if (!Array.isArray(settings[this.settingsKey])) {
          settings[this.settingsKey] = [];
        }

        const normalizedHost = host.toLowerCase();
        const normalizedList = settings[this.settingsKey]
          .map(d => (d || '').toString().trim().toLowerCase()).filter(Boolean);

        if (enabled) {
          if (!normalizedList.includes(normalizedHost)) {
            settings[this.settingsKey].push(normalizedHost);
          }
        } else {
          settings[this.settingsKey] = settings[this.settingsKey]
            .filter(d => (d || '').toString().trim().toLowerCase() !== normalizedHost);
        }

        browser.storage.local.set({ settings }, () => {
          this.populate(settings[this.settingsKey]);
          this.updateStatus(settings[this.settingsKey]);
          this.updateCurrentSiteSwitch(settings[this.settingsKey]);
          if (this.onAfterChange) this.onAfterChange(settings);
        });
      });
    });
  }

  initEventListeners() {
    const input = document.getElementById(this.inputElementId);
    const addButton = this._findAddButton();
    const clearButton = this._findClearButton();
    const toggle = document.getElementById(this.currentSiteToggleId);

    if (input) {
      input.addEventListener('input', () => this.updatePreview());
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.addDomain();
      });
    }

    if (addButton) {
      addButton.addEventListener('click', () => this.addDomain());
    }

    if (clearButton) {
      clearButton.addEventListener('click', () => this.clearAll());
    }

    if (toggle) {
      toggle.addEventListener('change', () => this.toggleCurrentSite(toggle.checked));
    }
  }

  _findAddButton() {
    if (this.addButtonId) {
      const byId = document.getElementById(this.addButtonId);
      if (byId) return byId;
    }
    // Fallback: legacy convention based on a wrapping input group
    const input = document.getElementById(this.inputElementId);
    if (!input) return null;
    const parent = input.closest('.fishbowl-popup-whitelist-domain-input-group');
    return parent ? parent.querySelector('button') : null;
  }

  _findClearButton() {
    if (this.clearButtonId) {
      const byId = document.getElementById(this.clearButtonId);
      if (byId) return byId;
    }
    // Fallback: legacy convention based on a wrapping list container
    const list = document.getElementById(this.listElementId);
    if (!list) return null;
    const container = list.closest('.fishbowl-popup-whitelist-list-container');
    return container ? container.querySelector('.fishbowl-popup-clear-button') : null;
  }

  _showError(message) {
    const status = document.getElementById(this.statusElementId);
    if (!status) return;

    status.textContent = message;
    status.className = 'whitelist-status error';

    setTimeout(() => {
      browser.storage.local.get(['settings'], (result) => {
        const settings = result.settings;
        this.updateStatus(settings[this.settingsKey] || []);
      });
    }, 3000);
  }
}
