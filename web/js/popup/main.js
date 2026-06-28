/**
 * FishBowl Security Extension - Popup Settings (Coordinator)
 * Wires sub-modules together and manages the popup lifecycle.
 */

document.addEventListener('DOMContentLoaded', () => {
  function tryInit(name, factory) {
    try { return factory(); } catch (e) {
      console.error(`[FB:Popup] Failed to init ${name}:`, e);
      return null;
    }
  }

  // --- Sub-module instances ---
  const settingsBridge = tryInit('SettingsBridge', () => new FishBowlPopupSettingsBridge());
  const activityLogs = tryInit('ActivityLogs', () => new FishBowlPopupActivityLogs());
  const debugControls = tryInit('DebugControls', () => new FishBowlPopupDebugControls());
  const panelVisibility = tryInit('PanelVisibility', () => new FishBowlPopupPanelVisibility({ settingsBridge }));

  const whitelistManager = new FishBowlPopupDomainList({
    listElementId: 'whitelist-domain-list',
    statusElementId: 'whitelist-status',
    inputElementId: 'whitelist-domain-input',
    previewElementId: 'whitelist-domain-preview',
    currentSiteToggleId: 'whitelist-current-site-toggle',
    currentDomainLabelId: 'whitelist-current-domain',
    settingsKey: 'domainWhitelist',
    emptyStatusMessage: 'Add a domain to enable the whitelist, else the extension will run on all websites.',
    activeStatusTemplate: 'Extension will only run on {count} whitelisted domain(s).',
    onAfterChange: (settings) => {
      if (!settings.domainWhitelist || settings.domainWhitelist.length === 0) {
        settings.useDomainWhitelist = false;
      } else {
        settings.useDomainWhitelist = true;
      }
      browser.storage.local.set({ settings }, () => {
        settingsBridge.broadcastSettingsUpdated(settings);
        activityLogs.addLogEntry('info',
          settings.domainWhitelist.length === 0
            ? 'Domain whitelist cleared'
            : `Domain whitelist updated (${settings.domainWhitelist.length} domains)`
        );
      });
    }
  });

  const cspOverrideManager = new FishBowlPopupDomainList({
    listElementId: 'csp-override-domain-list',
    statusElementId: 'csp-override-status',
    inputElementId: 'csp-override-domain-input',
    previewElementId: 'csp-override-domain-preview',
    currentSiteToggleId: 'csp-override-toggle',
    currentDomainLabelId: 'csp-override-current-domain',
    settingsKey: 'cspBackendOverrideDomains',
    emptyStatusMessage: 'Disabled by default. Add a domain to allow backend requests via background service worker proxy on CSP-restricted sites.',
    activeStatusTemplate: 'Enabled for {count} domain(s).',
    onAfterChange: (settings) => {
      settingsBridge.broadcastSettingsUpdated(settings);
    }
  });

  // --- Tab switching ---
  const tabButtons = document.querySelectorAll('.fishbowl-popup-tab-button');
  const tabContents = document.querySelectorAll('.fishbowl-popup-tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      button.classList.add('active');
      const tabId = button.dataset.tab;
      document.getElementById(`${tabId}-tab`).classList.add('active');
    });
  });

  // --- Toggle element references ---
  const ipAddressesToggle = document.getElementById('toggle-ip-addresses');
  const eventIdsToggle = document.getElementById('toggle-event-ids');
  const sidsToggle = document.getElementById('toggle-sids');
  const asnToggle = document.getElementById('toggle-asn');
  const domainsToggle = document.getElementById('toggle-domains');
  const hashesToggle = document.getElementById('toggle-hashes');
  const filesToggle = document.getElementById('toggle-files');
  const visualUpdatesToggle = document.getElementById('toggle-visual-updates');
  const activityFeedToggle = document.getElementById('toggle-activity-feed');
  const activityFeedTextAnimationToggle = document.getElementById('toggle-activity-feed-text-animation');
  const panelHeadersToggle = document.getElementById('toggle-panel-headers');
  const enableCacheToggle = document.getElementById('toggle-enable-cache');
  const themeDarkToggle = document.getElementById('toggle-theme-dark');
  const textareaInspectOverlayEnabledToggle = document.getElementById('toggle-textarea-inspect-overlay-enabled');
  const textareaInspectOverlayDefaultToggle = document.getElementById('toggle-textarea-inspect-overlay-default');
  const textareaInspectOverlayHoldToShowToggle = document.getElementById('toggle-textarea-inspect-overlay-hold-to-show');
  const textareaOverlaySubSettings = document.getElementById('textarea-overlay-sub-settings');

  const infoPanelOpacityInput = document.getElementById('info-panel-opacity');
  const infoPanelOpacityValue = document.getElementById('info-panel-opacity-value');

  // Apply the resolved theme to the popup's own document so the popup UI
  // (not just the page HUD) follows the dark/light setting.
  const applyPopupTheme = (theme) => {
    const t = theme === 'light' ? 'light' : 'dark';
    const el = document.documentElement;
    el.classList.remove('fishbowl-theme-light', 'fishbowl-theme-dark');
    el.classList.add(`fishbowl-theme-${t}`);
    document.body.classList.remove('fb-dark', 'fb-light');
    document.body.classList.add(`fb-${t}`);
  };

  const ipInfoToggle = document.getElementById('toggle-service-ipinfo');
  const abuseIPDBToggle = document.getElementById('toggle-service-abuseipdb');
  // const alienVaultToggle = document.getElementById('toggle-service-alienvault');
  // const greyNoiseToggle = document.getElementById('toggle-service-greynoise');
  const virusTotalToggle = document.getElementById('toggle-service-virustotal');
  const domainVirusTotalToggle = document.getElementById('toggle-domain-service-virustotal');
  const hashVirusTotalToggle = document.getElementById('toggle-hash-service-virustotal');
  const hashBazaarToggle = document.getElementById('toggle-hash-service-bazaar');
  const fileVirusTotalToggle = document.getElementById('toggle-file-service-virustotal');
  const asnIpinfoToggle = document.getElementById('toggle-asn-service-ipinfo');
  const spurToggle = document.getElementById('toggle-service-spur');
  const shodanToggle = document.getElementById('toggle-service-shodan');
  // const whoisToggle = document.getElementById('toggle-service-whois');

  const clearLogsButton = document.getElementById('clear-logs');
  const purgeCacheButton = document.getElementById('purge-cache');

  // --- Load saved settings & apply to UI ---
  browser.storage.local.get(['settings'], (result) => {
    const stored = result?.settings;
    if (!stored) {
      const settings = JSON.parse(JSON.stringify(FishBowlConfig.DEFAULT_SETTINGS));
      FishBowlConfig.validateSettings(settings);
      browser.storage.local.set({ settings });
      window.location.reload();
      return;
    }

    FishBowlConfig.validateSettings(stored);
    const settings = stored;

    // Scanning toggles
    ipAddressesToggle.checked = settings.scanIpAddresses;
    eventIdsToggle.checked = settings.scanEventIds;
    sidsToggle.checked = settings.scanSids;
    asnToggle.checked = settings.scanAsn;
    domainsToggle.checked = settings.scanDomains;
    if (hashesToggle) {
      hashesToggle.checked = settings.scanHashes;
    }
    if (filesToggle) {
      filesToggle.checked = settings.scanFiles;
    }
    visualUpdatesToggle.checked = settings.showVisualUpdates;
    activityFeedToggle.checked = settings.showActivityFeed;
    if (activityFeedTextAnimationToggle) {
      activityFeedTextAnimationToggle.checked = settings.animateActivityFeedText !== false;
    }
    if (panelHeadersToggle) {
      panelHeadersToggle.checked = settings.showPanelHeaders !== false;
    }
    enableCacheToggle.checked = settings.enableCache !== undefined ? settings.enableCache : true;
    themeDarkToggle.checked = (settings.theme || 'dark') === 'dark';
    applyPopupTheme(settings.theme || 'dark');
    if (textareaInspectOverlayEnabledToggle) {
      textareaInspectOverlayEnabledToggle.checked = !!settings.textareaInspectOverlayEnabled;
    }
    if (textareaInspectOverlayDefaultToggle) {
      textareaInspectOverlayDefaultToggle.checked = !!settings.textareaInspectOverlayDefault;
    }
    if (textareaInspectOverlayHoldToShowToggle) {
      textareaInspectOverlayHoldToShowToggle.checked = !!settings.textareaInspectOverlayHoldToShow;
    }
    applyTextareaOverlaySubSettingsState(!!settings.textareaInspectOverlayEnabled);

    // Opacity slider
    if (infoPanelOpacityInput) {
      try {
        const raw = settings.infoPanelOpacity;
        const n = (typeof raw === 'number') ? raw : parseFloat(raw);
        const fallbackRaw = FishBowlConfig.DEFAULT_SETTINGS ? FishBowlConfig.DEFAULT_SETTINGS.infoPanelOpacity : 0.6;
        const fallback = (typeof fallbackRaw === 'number' && Number.isFinite(fallbackRaw)) ? fallbackRaw : 0.6;
        const clamped = Number.isFinite(n) ? Math.max(0.05, Math.min(1, n)) : Math.max(0.05, Math.min(1, fallback));
        infoPanelOpacityInput.value = String(clamped);
        if (infoPanelOpacityValue) {
          infoPanelOpacityValue.textContent = clamped.toFixed(2);
        }
      } catch (e) {
        console.warn('[FishBowl Popup] Failed to initialize info panel opacity slider', e);
      }
    }

    // Resolve per-domain theme
    try {
      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabUrl = tabs?.[0]?.url || '';
        const host = FishBowlConsts.extractDomainFromUserInput(tabUrl);
        const domainKey = FishBowlConsts.domainSettingsKeyForHost(host);
        if (!domainKey) {
          themeDarkToggle.checked = (settings.theme || 'dark') === 'dark';
          applyPopupTheme(settings.theme || 'dark');
          return;
        }

        browser.storage.local.get([domainKey], (domainResult) => {
          const domainSettings = domainResult?.[domainKey] || {};
          const resolvedTheme = (domainSettings.theme === 'dark' || domainSettings.theme === 'light')
            ? domainSettings.theme
            : (settings.theme || 'dark');
          themeDarkToggle.checked = resolvedTheme === 'dark';
          applyPopupTheme(resolvedTheme);
        });
      });
    } catch (e) {
      console.warn('[FishBowl Popup] Failed to resolve current domain theme', e);
    }

    // Service toggles
    if (virusTotalToggle) {
      const rep = settings.reputationServices && typeof settings.reputationServices === 'object'
        ? settings.reputationServices
        : {};
      const ipMap = rep.ip && typeof rep.ip === 'object' ? rep.ip : null;
      if (ipMap && Object.prototype.hasOwnProperty.call(ipMap, 'virustotal')) {
        virusTotalToggle.checked = !!ipMap.virustotal;
      } else {
        virusTotalToggle.checked = !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.ip?.virustotal;
      }
    }

    if (domainVirusTotalToggle) {
      const rep = settings.reputationServices && typeof settings.reputationServices === 'object'
        ? settings.reputationServices
        : {};
      const domainMap = rep.domain && typeof rep.domain === 'object' ? rep.domain : null;
      if (domainMap && Object.prototype.hasOwnProperty.call(domainMap, 'virustotal')) {
        domainVirusTotalToggle.checked = !!domainMap.virustotal;
      } else {
        domainVirusTotalToggle.checked = !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.domain?.virustotal;
      }
    }

    if (hashVirusTotalToggle) {
      const rep = settings.reputationServices && typeof settings.reputationServices === 'object'
        ? settings.reputationServices
        : {};
      const hashMap = rep.hash && typeof rep.hash === 'object' ? rep.hash : null;
      if (hashMap && Object.prototype.hasOwnProperty.call(hashMap, 'virustotal')) {
        hashVirusTotalToggle.checked = !!hashMap.virustotal;
      } else {
        hashVirusTotalToggle.checked = !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.hash?.virustotal;
      }
    }

    if (hashBazaarToggle) {
      const rep = settings.reputationServices && typeof settings.reputationServices === 'object'
        ? settings.reputationServices
        : {};
      const hashMap = rep.hash && typeof rep.hash === 'object' ? rep.hash : null;
      if (hashMap && Object.prototype.hasOwnProperty.call(hashMap, 'bazaar')) {
        hashBazaarToggle.checked = !!hashMap.bazaar;
      } else {
        hashBazaarToggle.checked = !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.hash?.bazaar;
      }
    }

    if (fileVirusTotalToggle) {
      const rep = settings.reputationServices && typeof settings.reputationServices === 'object'
        ? settings.reputationServices
        : {};
      const fileMap = rep.file && typeof rep.file === 'object' ? rep.file : null;
      if (fileMap && Object.prototype.hasOwnProperty.call(fileMap, 'virustotal')) {
        fileVirusTotalToggle.checked = !!fileMap.virustotal;
      } else {
        fileVirusTotalToggle.checked = !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.file?.virustotal;
      }
    }

    const rep = settings.reputationServices && typeof settings.reputationServices === 'object'
      ? settings.reputationServices
      : {};
    const ipMap = rep.ip && typeof rep.ip === 'object' ? rep.ip : {};

    ipInfoToggle.checked = Object.prototype.hasOwnProperty.call(ipMap, 'ipinfo')
      ? !!ipMap.ipinfo
      : !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.ip?.ipinfo;

    abuseIPDBToggle.checked = Object.prototype.hasOwnProperty.call(ipMap, 'abuseipdb')
      ? !!ipMap.abuseipdb
      : !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.ip?.abuseipdb;

    if (asnIpinfoToggle) {
      const asnMap = rep.asn && typeof rep.asn === 'object' ? rep.asn : null;
      if (asnMap && Object.prototype.hasOwnProperty.call(asnMap, 'ipinfo')) {
        asnIpinfoToggle.checked = !!asnMap.ipinfo;
      } else {
        asnIpinfoToggle.checked = !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.asn?.ipinfo;
      }
    }

    if (spurToggle) {
      spurToggle.checked = Object.prototype.hasOwnProperty.call(ipMap, 'spur')
        ? !!ipMap.spur
        : !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.ip?.spur;
    }

    if (shodanToggle) {
      shodanToggle.checked = Object.prototype.hasOwnProperty.call(ipMap, 'shodan')
        ? !!ipMap.shodan
        : !!FishBowlConfig.DEFAULT_SETTINGS?.reputationServices?.ip?.shodan;
    }

    // Domain lists
    whitelistManager.populate(settings.domainWhitelist || []);
    whitelistManager.updateStatus(settings.domainWhitelist || []);
    whitelistManager.updateCurrentSiteSwitch(settings.domainWhitelist || []);

    cspOverrideManager.populate(settings.cspBackendOverrideDomains || []);
    cspOverrideManager.updateStatus(settings.cspBackendOverrideDomains || []);
    cspOverrideManager.updateCurrentSiteSwitch(settings.cspBackendOverrideDomains || []);

    // Panel visibility
    panelVisibility?.init(settings);
  });

  // --- Debug controls ---
  debugControls?.init();

  // --- Activity logs ---
  activityLogs?.loadLogs();

  // --- Scanning toggle listeners ---
  ipAddressesToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('scanIpAddresses', ipAddressesToggle.checked);
  });

  eventIdsToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('scanEventIds', eventIdsToggle.checked);
  });

  sidsToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('scanSids', sidsToggle.checked);
  });

  asnToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('scanAsn', asnToggle.checked);
  });

  domainsToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('scanDomains', domainsToggle.checked);
  });

  if (hashesToggle) {
    hashesToggle.addEventListener('change', () => {
      settingsBridge.updateSetting('scanHashes', hashesToggle.checked);
    });
  }

  filesToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('scanFiles', filesToggle.checked);
  });

  visualUpdatesToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('showVisualUpdates', visualUpdatesToggle.checked);
  });

  activityFeedToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('showActivityFeed', activityFeedToggle.checked);
  });

  if (activityFeedTextAnimationToggle) {
    activityFeedTextAnimationToggle.addEventListener('change', () => {
      settingsBridge.updateSetting('animateActivityFeedText', activityFeedTextAnimationToggle.checked);
    });
  }

  if (panelHeadersToggle) {
    panelHeadersToggle.addEventListener('change', () => {
      settingsBridge.updateSetting('showPanelHeaders', panelHeadersToggle.checked);
    });
  }

  enableCacheToggle.addEventListener('change', () => {
    settingsBridge.updateSetting('enableCache', enableCacheToggle.checked);
  });

  themeDarkToggle.addEventListener('change', () => {
    const theme = themeDarkToggle.checked ? 'dark' : 'light';
    settingsBridge.updateThemeForCurrentDomain(theme);
    applyPopupTheme(theme);
  });

  function applyTextareaOverlaySubSettingsState(enabled) {
    if (!textareaOverlaySubSettings) return;
    if (enabled) {
      textareaOverlaySubSettings.classList.remove('fishbowl-popup-toggle-sub-disabled');
      if (textareaInspectOverlayDefaultToggle) textareaInspectOverlayDefaultToggle.disabled = false;
      if (textareaInspectOverlayHoldToShowToggle) textareaInspectOverlayHoldToShowToggle.disabled = false;
    } else {
      textareaOverlaySubSettings.classList.add('fishbowl-popup-toggle-sub-disabled');
      if (textareaInspectOverlayDefaultToggle) textareaInspectOverlayDefaultToggle.disabled = true;
      if (textareaInspectOverlayHoldToShowToggle) textareaInspectOverlayHoldToShowToggle.disabled = true;
    }
  }

  if (textareaInspectOverlayEnabledToggle) {
    textareaInspectOverlayEnabledToggle.addEventListener('change', () => {
      const enabled = textareaInspectOverlayEnabledToggle.checked;
      settingsBridge.updateSetting('textareaInspectOverlayEnabled', enabled);
      applyTextareaOverlaySubSettingsState(enabled);
    });
  }

  if (textareaInspectOverlayDefaultToggle) {
    textareaInspectOverlayDefaultToggle.addEventListener('change', () => {
      settingsBridge.updateSetting('textareaInspectOverlayDefault', textareaInspectOverlayDefaultToggle.checked);
    });
  }

  if (textareaInspectOverlayHoldToShowToggle) {
    textareaInspectOverlayHoldToShowToggle.addEventListener('change', () => {
      settingsBridge.updateSetting('textareaInspectOverlayHoldToShow', textareaInspectOverlayHoldToShowToggle.checked);
    });
  }

  // Opacity slider
  if (infoPanelOpacityInput) {
    const applyOpacityLabel = () => {
      try {
        const n = parseFloat(infoPanelOpacityInput.value);
        if (infoPanelOpacityValue && Number.isFinite(n)) {
          infoPanelOpacityValue.textContent = n.toFixed(2);
        }
      } catch (e) {
        console.warn('[FishBowl Popup] Failed to update info panel opacity label', e);
      }
    };

    infoPanelOpacityInput.addEventListener('input', () => {
      applyOpacityLabel();
    });

    infoPanelOpacityInput.addEventListener('change', () => {
      try {
        const n = parseFloat(infoPanelOpacityInput.value);
        if (!Number.isFinite(n)) return;
        const clamped = Math.max(0.05, Math.min(1, n));
        infoPanelOpacityInput.value = String(clamped);
        applyOpacityLabel();
        settingsBridge.updateSetting('infoPanelOpacity', clamped);
      } catch (e) {
        console.warn('[FishBowl Popup] Failed to persist info panel opacity', e);
      }
    });
  }

  // Theme keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
      e.preventDefault();
      themeDarkToggle.checked = !themeDarkToggle.checked;
      const theme = themeDarkToggle.checked ? 'dark' : 'light';
      settingsBridge.updateThemeForCurrentDomain(theme);
      applyPopupTheme(theme);
    }
  });

  // --- Service toggle listeners ---
  if (virusTotalToggle) {
    virusTotalToggle.addEventListener('change', () => {
      settingsBridge.updateReputationServiceSetting('ip', 'virustotal', virusTotalToggle.checked);
    });
  }

  if (domainVirusTotalToggle) {
    domainVirusTotalToggle.addEventListener('change', () => {
      settingsBridge.updateReputationServiceSetting('domain', 'virustotal', domainVirusTotalToggle.checked);
    });
  }

  if (hashVirusTotalToggle) {
    hashVirusTotalToggle.addEventListener('change', () => {
      settingsBridge.updateReputationServiceSetting('hash', 'virustotal', hashVirusTotalToggle.checked);
    });
  }

  if (hashBazaarToggle) {
    hashBazaarToggle.addEventListener('change', () => {
      settingsBridge.updateReputationServiceSetting('hash', 'bazaar', hashBazaarToggle.checked);
    });
  }

  if (fileVirusTotalToggle) {
    fileVirusTotalToggle.addEventListener('change', () => {
      settingsBridge.updateReputationServiceSetting('file', 'virustotal', fileVirusTotalToggle.checked);
    });
  }

  abuseIPDBToggle.addEventListener('change', () => {
    settingsBridge.updateReputationServiceSetting('ip', 'abuseipdb', abuseIPDBToggle.checked);
  });

  // alienVaultToggle.addEventListener('change', () => {
  //   settingsBridge.updateServiceSetting('alienvault', alienVaultToggle.checked);
  // });
  //
  // greyNoiseToggle.addEventListener('change', () => {
  //   settingsBridge.updateServiceSetting('greynoise', greyNoiseToggle.checked);
  // });

  ipInfoToggle.addEventListener('change', () => {
    settingsBridge.updateReputationServiceSetting('ip', 'ipinfo', ipInfoToggle.checked);
  });

  if (asnIpinfoToggle) {
    asnIpinfoToggle.addEventListener('change', () => {
      settingsBridge.updateReputationServiceSetting('asn', 'ipinfo', asnIpinfoToggle.checked);
    });
  }

  if (spurToggle) {
    spurToggle.addEventListener('change', () => {
      settingsBridge.updateReputationServiceSetting('ip', 'spur', spurToggle.checked);
    });
  }

  if (shodanToggle) {
    shodanToggle.addEventListener('change', () => {
      settingsBridge.updateReputationServiceSetting('ip', 'shodan', shodanToggle.checked);
    });
  }

  // whoisToggle.addEventListener('change', () => {
  //   settingsBridge.updateServiceSetting('whois', whoisToggle.checked);
  // });

  // API keys are managed server-side via the `fishbowl api register` CLI.

  // --- Activity logs & cache buttons ---
  clearLogsButton.addEventListener('click', () => {
    activityLogs.clearLogs();
  });

  purgeCacheButton.addEventListener('click', () => {
    activityLogs.purgeCache();
  });

  // --- Domain list event listeners ---
  whitelistManager.initEventListeners();
  cspOverrideManager.initEventListeners();

  whitelistManager.updatePreview();
  cspOverrideManager.updatePreview();
});
