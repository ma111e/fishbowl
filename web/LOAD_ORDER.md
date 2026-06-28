# FishBowl Extension Load Order

This is the conceptual source list used to keep the Chrome and Firefox manifests aligned while preserving their platform-specific background formats.

## Shared Globals

- `js/browser-polyfill.min.js`
- `js/constants.js`
- `js/config.js`
- `js/settings.js`
- `js/contracts.js`
- `js/log-service.js`
- `js/fishbowl-net.js`
- `js/fishbowl-broadcast.js`

## Background Only

- `js/bg/message-router.js`
- `js/bg/reputation/state.js`
- `js/bg/reputation/services.js`
- `js/bg/inject-tools.js`
- `js/bg/reputation/shadow-dom-tools.js`
- `js/bg/reputation/dom-extract.js`
- `js/bg/reputation/tab-queue.js`
- `js/bg/reputation/tab-lifecycle.js`
- `js/bg/reputation/coordinator.js`
- `js/bg/dnr-rules.js`
- `js/bg/handlers/*.js`
- `js/background.js`

## Content Scripts

- `js/lifecycle.js`
- `js/settings-sync.js`
- `js/cache-service.js`
- `js/api-service.js`
- `js/anchored-fixed-layer.js`
- `js/overlays/base-inspect-overlay.js`
- `js/*inspect-overlay.js`
- `js/dom-highlighter/*.js`
- `js/draggable-panels.js`
- `js/activity-progress.js`
- `js/ui-manager/*.js`
- `js/region-selector.js`
- `js/service-page-wait.js`
- `js/bg/reputation/shadow-dom-tools.js`
- `js/shadow-dom-utils.js`
- `js/hud-analysis.js`
- `js/security-hud.js`
- `content.js`

`js/service-page-wait.js` and `js/bg/reputation/shadow-dom-tools.js` are intentionally shared with content scripts because the HUD uses them directly while serializing service pages.
