/**
 * Pair-window controller — thin shell around <fb-pair>.
 * The component handles input, submission, and rescan internally;
 * this script just closes the window after a brief success blink.
 */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.querySelector('fb-pair');
    if (!el) return;
    el.addEventListener('fb-pair-done', () => {
      setTimeout(() => window.close(), 800);
    });
  });
})();
