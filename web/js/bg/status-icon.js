/**
 * Toolbar action icon, synced to backend connection state.
 *
 * The background classifies the backend into three states in probePairingState()
 * (ping ok -> active, 401+need-pair -> pairing, any other error -> offline). This
 * module maps each state to one of the prebuilt icon asset sets and swaps the
 * toolbar icon via browser.action.setIcon({ path }) - no canvas/tinting needed.
 */
(function () {
    globalThis.FishBowlBgStatusIcon = globalThis.FishBowlBgStatusIcon || {};

    const log = globalThis.FishBowlLog?.for('BG:StatusIcon') || {
        debug: () => {}, info: () => {},
        warn: console.warn.bind(console, '[BG:StatusIcon]'),
        error: console.error.bind(console, '[BG:StatusIcon]')
    };

    const SIZES = [16, 32, 48, 128];

    // All icon sets share the `icon-NN.png` naming. The active set lives at the
    // icons/ root (the manifest default_icon); each state variant in its own dir.
    const iconSet = (dir) =>
        Object.fromEntries(SIZES.map((s) => [s, `icons/${dir}icon-${s}.png`]));

    // A monochrome icon is only legible on one toolbar theme, so offline picks
    // the dark fish on light toolbars and the light fish on dark ones. Chrome
    // MV3 service workers have no matchMedia (no window) -> falls back to the
    // dark fish, which is correct on Chrome's default light toolbar. Firefox's
    // MV3 event page does expose matchMedia, so it resolves correctly there.
    function prefersDark() {
        try {
            return !!(globalThis.matchMedia
                && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
        } catch (e) {
            log.debug('matchMedia unavailable; assuming light toolbar', e);
            return false;
        }
    }

    function pathsForState(state) {
        switch (state) {
            case 'active':  return iconSet('');
            case 'pairing': return iconSet('violet/');
            case 'offline': return iconSet(prefersDark() ? 'mono-light/' : 'mono/');
            default:        return iconSet('mono/');
        }
    }

    FishBowlBgStatusIcon.apply = function apply(state) {
        try {
            // browser.action (MV3); polyfill maps browserAction on older shims.
            const action = browser.action || browser.browserAction;
            action.setIcon({ path: pathsForState(state) });
        } catch (e) {
            // Cosmetic only - never let an icon failure break backend handling.
            log.debug('setIcon failed for state', state, e);
        }
    };
})();
