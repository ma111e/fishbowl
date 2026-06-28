/**
 * FishBowl Popup - Settings Bridge
 * Centralized settings read/write/broadcast logic for the popup.
 */

class FishBowlPopupSettingsBridge {
  updateSetting(key, value) {
    browser.storage.local.get(['settings'], (result) => {
      const settings = result.settings;
      FishBowlConfig.validateSettings(settings);
      settings[key] = value;
      FishBowlConfig.validateSettings(settings);
      browser.storage.local.set({ settings });
      this.broadcastSettingsUpdated(settings);
    });
  }

  updateReputationServiceSetting(entityType, serviceId, enabled) {
    browser.storage.local.get(['settings'], (result) => {
      const settings = result.settings;
      FishBowlConfig.validateSettings(settings);

      const t = (entityType || '').toString().trim().toLowerCase();
      if (!t) {
        console.warn('[FishBowl Popup] Missing entityType for updateReputationServiceSetting');
        return;
      }

      const svcId = (serviceId || '').toString().trim();
      if (!svcId) {
        return;
      }

      settings.reputationServices[t][svcId] = !!enabled;
      FishBowlConfig.validateSettings(settings);
      browser.storage.local.set({ settings });
      this.broadcastSettingsUpdated(settings);
    });
  }

  updateThemeForCurrentDomain(themeValue) {
    browser.storage.local.get(['settings'], (result) => {
      const settings = result.settings;
      FishBowlConfig.validateSettings(settings);
      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabUrl = tabs?.[0]?.url || '';
        const host = FishBowlConsts.extractDomainFromUserInput(tabUrl);

        const domainKey = FishBowlConsts.domainSettingsKeyForHost(host);
        if (!domainKey) {
          settings.theme = themeValue;
          FishBowlConfig.validateSettings(settings);
          browser.storage.local.set({ settings });
          this.broadcastSettingsUpdated(settings);
          return;
        }

        browser.storage.local.get([domainKey], (domainResult) => {
          const domainSettings = domainResult?.[domainKey] || {};
          domainSettings.theme = themeValue;

          browser.storage.local.set({ settings, [domainKey]: domainSettings }, () => {
            this.broadcastSettingsUpdated(settings);
          });
        });
      });
    });
  }

  broadcastSettingsUpdated(settings) {
    FishBowlConfig.validateSettings(settings);

    browser.tabs.query({}).then((tabs) => {
      tabs.forEach((tab) => {
        if (!tab || typeof tab.id === 'undefined') return;

        const host = FishBowlConsts.extractDomainFromUserInput(tab.url || '');
        const domainKey = FishBowlConsts.domainSettingsKeyForHost(host);
        if (!domainKey) {
          browser.tabs.sendMessage(tab.id, {
            action: 'settingsUpdated',
            settings: settings
          }).catch((err) => {
            console.warn('[FishBowl Popup] Failed to send settings to tab', tab.id, err);
          });
          return;
        }

        browser.storage.local.get([domainKey]).then((domainResult) => {
          const domainSettings = domainResult?.[domainKey] || {};
          const merged = { ...settings, ...domainSettings };
          FishBowlConfig.validateSettings(merged);

          browser.tabs.sendMessage(tab.id, {
            action: 'settingsUpdated',
            settings: merged
          }).catch((err) => {
            console.warn('[FishBowl Popup] Failed to send merged settings to tab', tab.id, err);
          });
        });
      });
    });
  }
}
