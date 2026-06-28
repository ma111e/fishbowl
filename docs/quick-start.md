# Quick Start

The fastest path from a fresh binary to your first scan.

## 1. Install the extension and start the backend

```bash
fishbowl setup
```

This opens a local install page (`http://localhost:3001`) in your default
browser. Follow the [installation steps](installation.md) for your browser.
After Fishbowl detects the installed extension, the setup process starts the
backend automatically on `localhost:7158`.

The backend prints a 6-digit **pairing code** in the setup terminal. Enter it in
the extension's prompt to enrol, and keep `fishbowl setup` running while you use
Fishbowl. For later sessions, start the backend directly with `fishbowl server`.
See [Installation › Pairing](installation.md#pairing) for details and recovery
steps.

## 2. Scan a page

Open any page. Fishbowl scans it on load and highlights detected entities
inline. Click an entity to open its reputation dashboard. Press `Ctrl+X` then
`R` to rescan.

## 3. (Optional) Register API keys

Some providers return more detailed data with an API key:

```bash
fishbowl api register
```

Without keys, Fishbowl still works. See
[Threat Intelligence](threat-intelligence.md) for which providers need a key
and which don't. Full key handling is in [API Keys](api-keys.md).

---

[← Documentation home](README.md)
