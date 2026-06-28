/**
 * Popup pairing controller.
 *
 * Watches the `fishbowlNeedsPairing` flag (set by FishBowlNet when it sees a
 * 401 + X-Fishbowl-Need-Pair from the backend) and shows the pairing panel
 * when true. Submitting the 6-digit code calls FishBowlNet.submitPairingCode,
 * which sends one signed request carrying the code so the backend can verify
 * and enroll the extension's pubkey.
 */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('fb-pair-panel');
    const input = document.getElementById('fb-pair-input');
    const submit = document.getElementById('fb-pair-submit');
    const status = document.getElementById('fb-pair-status');
    if (!panel || !input || !submit || !status) return;

    function setStatus(text, color) {
      status.style.color = color || '#8b949e';
      status.textContent = text || '';
    }

    function show()  { panel.style.display = ''; }
    function hide()  { panel.style.display = 'none'; }

    async function refreshFromStorage() {
      try {
        const { fishbowlNeedsPairing } = await browser.storage.local.get('fishbowlNeedsPairing');
        if (fishbowlNeedsPairing) show(); else hide();
      } catch (e) {
        // Storage unreadable; caller falls back to probing the backend.
        console.debug('[FB:Popup Pairing] Failed to read pairing state from storage', e);
      }
    }

    // Probe once on open so a freshly-installed extension shows the panel even
    // before any other request has triggered the flag.
    async function probe() {
      try {
        const url = (globalThis.FishBowlConfig && globalThis.FishBowlConfig.PING_URL)
          || 'http://localhost:7158/ping';
        await FishBowlNet.postJsonExpectJson(url, {});
        hide();
      } catch (e) {
        if (e && e.needsPairing) show();
      }
    }

    submit.addEventListener('click', async () => {
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) {
        setStatus('Enter 6 digits.', '#f0883e');
        return;
      }
      submit.disabled = true;
      setStatus('Pairing…');
      try {
        const result = await FishBowlNet.submitPairingCode(code);
        if (result.ok) {
          setStatus('Paired.', '#2ea043');
          input.value = '';
          // The active tab is rescanned by the background on the
          // fishbowlNeedsPairing->false storage transition (see background.js).
          setTimeout(hide, 800);
        } else if (result.locked) {
          setStatus('Too many attempts - a fresh code is in the FishBowl server terminal.', '#f85149');
          input.value = '';
        } else {
          setStatus('Wrong or expired code. Check the FishBowl server terminal for the current code.', '#f85149');
        }
      } catch (e) {
        setStatus('Pairing failed: ' + (e && e.message ? e.message : 'unknown error'), '#f85149');
      } finally {
        submit.disabled = false;
      }
    });

    input.addEventListener('input', () => {
      const cleaned = input.value.replace(/\D/g, '').slice(0, 6);
      if (cleaned !== input.value) input.value = cleaned;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit.click();
    });

    // Re-show when the flag flips while the popup is open.
    if (browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && 'fishbowlNeedsPairing' in changes) refreshFromStorage();
      });
    }

    refreshFromStorage().then(probe);
  });
})();
