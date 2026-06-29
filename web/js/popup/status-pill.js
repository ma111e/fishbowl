/**
 * Popup status pill controller.
 *
 * Keeps the header "ACTIVE" indicator in sync with real backend state by
 * probing PING_URL through FishBowlNet (the same signed request pairing.js
 * uses) and classifying the result:
 *   - resolves                  -> backend reachable + paired  -> ACTIVE
 *   - rejects with needsPairing  -> reachable, awaiting code     -> PAIRING
 *   - rejects otherwise          -> backend unreachable          -> OFFLINE
 *
 * While the popup is open it also watches the `fishbowlNeedsPairing` flag so the
 * pill flips between ACTIVE and PAIRING live (e.g. right after a successful pair)
 * without needing another probe.
 */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const pill = document.getElementById('fb-status-pill');
    const text = document.getElementById('fb-status-text');
    if (!pill || !text) return;

    function setState(state, label) {
      pill.classList.remove('is-active', 'is-pairing', 'is-offline', 'is-checking');
      pill.classList.add('is-' + state);
      text.textContent = label;
    }

    async function probe() {
      const url = (globalThis.FishBowlConfig && globalThis.FishBowlConfig.PING_URL)
        || 'http://localhost:7158/ping';
      try {
        await FishBowlNet.postJsonExpectJson(url, {});
        setState('active', 'ACTIVE');
      } catch (e) {
        if (e && e.needsPairing) {
          setState('pairing', 'PAIRING');
        } else {
          console.debug('[FB:Popup Status] Backend unreachable', e);
          setState('offline', 'OFFLINE');
        }
      }
    }

    // Live flip on pair/unpair while the popup is open. Only adjusts between
    // active/pairing; an OFFLINE backend stays OFFLINE until the next probe.
    if (browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && 'fishbowlNeedsPairing' in changes) {
          if (pill.classList.contains('is-offline')) return;
          const needs = changes.fishbowlNeedsPairing.newValue;
          setState(needs ? 'pairing' : 'active', needs ? 'PAIRING' : 'ACTIVE');
        }
      });
    }

    setState('checking', 'CHECKING');
    probe();
  });
})();
