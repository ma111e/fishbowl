# Detecting Entities

On page load Fishbowl scans the document text and highlights detected entities
inline with color-coded markers. Detected entities are also grouped into
draggable panels by type.

## What Fishbowl detects

| Entity | Notes |
|---|---|
| IP addresses | IPv4, including defanged form (`127.0.0[.]1`, `127[.]0[.]0[.]1`) |
| Domains | Validated against a known-TLD list; defanged form (`evil[.]com`) supported |
| Hashes | SHA-1 (40 hex chars) and SHA-256 (64 hex chars) |
| File paths | Filenames with a recognized extension (Windows and Unix paths) |
| Windows Event IDs | Mapped to a description (e.g. `4624` → successful logon) |
| Security Identifiers (SIDs) | Well-known SIDs resolved to a name (e.g. `S-1-5-18` → SYSTEM) |
| Autonomous System Numbers | `AS####` format |

Defanged IPs and domains are recognized and normalized: `evil[.]com` is treated
as `evil.com`.

## Badges

Some entities carry a badge drawn from Fishbowl's bundled datasets:

- **`known`**: a hash that matches Fishbowl's known-hash dataset.
- **`known-file`**: a filename that matches Fishbowl's known-files dataset.

Badges come from local data and require no API key or network call.

## Highlights and panels

- **Inline highlights** mark each entity where it appears on the page.
- **Panels** group entities by type into draggable cards. Toggle them in
  [execution mode](keyboard-shortcuts.md) with `P`. Highlights can be toggled from
  the popup debug panel.

Click any highlighted entity to open its reputation dashboard. See
[Threat Intelligence](threat-intelligence.md).

---

[← Documentation home](README.md)
