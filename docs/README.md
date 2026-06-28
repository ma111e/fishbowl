# Fishbowl Documentation

Fishbowl is a local-first browser threat-investigation toolkit. It detects
security indicators on web pages and enriches them with threat intelligence. An
interactive workspace maps the relationships between them. Page content is
processed locally, so nothing is sent to a centralized service.

## Get started

- [Quick Start](quick-start.md): install, start the backend, run your first scan
- [Installation](installation.md): extension install for Firefox and Chromium, pairing
- [API Keys](api-keys.md): register provider keys and where they're stored

## Using Fishbowl

- [Detecting Entities](detecting-entities.md): what Fishbowl finds on a page
- [Threat Intelligence](threat-intelligence.md): providers, verdicts, and scoring
- [Investigation Sandbox](investigation-sandbox.md): link entities across pages
- [Interface](interface.md): HUD, panels, region selection, and the settings popup
- [Keyboard Shortcuts](keyboard-shortcuts.md): execution mode and its actions

## Reference

- [CLI Reference](cli-reference.md): supported `fishbowl` commands
- [Vault Cryptography](vault-cryptography.md): how secrets are encrypted at rest and how the extension authenticates to the backend
- [Troubleshooting](troubleshooting.md): connection, pairing, and provider issues
- [FAQ](faq.md): privacy, browser support, and provider terms

## Supported browsers

| Browser | Minimum version | Manifest |
|---|---|---|
| Chrome, Edge, Brave, Opera | Chromium 111+ | Manifest V3 |
| Firefox | 113+ | Manifest V3 |

The on-page styling uses OKLCH and `color-mix`, which set these floors.
