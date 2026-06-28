/**
 * FishBowl Popup - Panel Visibility
 * Per-domain info panel visibility toggles in the popup.
 */

class FishBowlPopupPanelVisibility {
  constructor(opts) {
    this.settingsBridge = (opts && opts.settingsBridge) || null;
    this.panelDefinitions = [
      { id: 'activity-feed-panel', label: 'Activity Feed' },
      { id: 'ip-panel',            label: 'IP Panel' },
      { id: 'asn-panel',           label: 'ASN Panel' },
      { id: 'domain-panel',        label: 'Domain Panel' },
      { id: 'event-panel',         label: 'Event Panel' },
      { id: 'sid-panel',           label: 'SID Panel' },
      { id: 'hash-panel',          label: 'Hash Panel' }
    ];
  }

  init(settings) {
    const domainLabel = document.getElementById('info-panels-current-domain');
    const list = document.getElementById('info-panels-visibility-list');
    if (!domainLabel || !list) return;

    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs?.[0]?.url || '';
      const host = FishBowlConsts.extractDomainFromUserInput(tabUrl);

      if (!host) {
        list.innerHTML = '';
        return;
      }

      this.populateList(host, settings);
    });
  }

  populateList(host, settings) {
    const list = document.getElementById('info-panels-visibility-list');
    if (!list) return;

    if (!settings.hudPanelVisibilityByDomain || typeof settings.hudPanelVisibilityByDomain !== 'object') {
      settings.hudPanelVisibilityByDomain = {};
    }
    const domainVisibility = settings.hudPanelVisibilityByDomain[host] && typeof settings.hudPanelVisibilityByDomain[host] === 'object'
      ? settings.hudPanelVisibilityByDomain[host]
      : {};

    list.innerHTML = '';

    this.panelDefinitions.forEach((panel) => {
      const row = document.createElement('label');
      row.className = 'fb-toggle-row';
      row.setAttribute('for', `toggle-panel-${panel.id}`);

      const toggle = document.createElement('span');
      toggle.className = 'fishbowl-popup-toggle';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `toggle-panel-${panel.id}`;
      input.checked = domainVisibility[panel.id] !== false;

      const box = document.createElement('span');
      box.className = 'fishbowl-popup-toggle-box';
      box.textContent = '[ ]';

      const boxChecked = document.createElement('span');
      boxChecked.className = 'fishbowl-popup-toggle-box-checked';
      boxChecked.textContent = '[x]';

      toggle.appendChild(input);
      toggle.appendChild(box);
      toggle.appendChild(boxChecked);

      const textWrap = document.createElement('div');
      textWrap.className = 'fb-toggle-text';
      const text = document.createElement('span');
      text.className = 'fb-toggle-label';
      text.textContent = panel.label;
      textWrap.appendChild(text);

      row.appendChild(toggle);
      row.appendChild(textWrap);
      list.appendChild(row);

      input.addEventListener('change', () => {
        this.updateVisibility(host, panel.id, input.checked);
      });
    });
  }

  updateVisibility(host, panelId, visible) {
    browser.storage.local.get(['settings'], (result) => {
      const settings = result.settings;
      if (!settings.hudPanelVisibilityByDomain || typeof settings.hudPanelVisibilityByDomain !== 'object') {
        settings.hudPanelVisibilityByDomain = {};
      }

      const domainVisibility = settings.hudPanelVisibilityByDomain[host] && typeof settings.hudPanelVisibilityByDomain[host] === 'object'
        ? settings.hudPanelVisibilityByDomain[host]
        : {};

      if (visible) {
        if (Object.prototype.hasOwnProperty.call(domainVisibility, panelId)) {
          delete domainVisibility[panelId];
        }
      } else {
        domainVisibility[panelId] = false;
      }

      settings.hudPanelVisibilityByDomain[host] = domainVisibility;
      browser.storage.local.set({ settings }, () => {
        if (this.settingsBridge) {
          this.settingsBridge.broadcastSettingsUpdated(settings);
        }
      });
    });
  }
}
