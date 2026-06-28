# Interface

Fishbowl's on-page UI runs in an isolated overlay so it doesn't interfere with
the page.

## HUD and panels

- **HUD**: the on-page control surface. Hide it with `H` in execution mode.
- **Panels**: draggable cards grouping detected entities by type. Toggle with
  `P`; reset their positions for the current site with `C`.
- **Highlights**: inline markers on detected entities. Toggle them from the popup
  debug panel.

All toggles run from [execution mode](keyboard-shortcuts.md) (`Ctrl+X`).

## Entity inspector and search

- **Entity Inspector** (`E`, or the HUD entities chip): a drawer listing every
  entity found on the page, grouped by type. Each entry shows its verdict,
  enrichment (badges and per-provider results), external lookup links, and
  related entities (a referenced ASN, others found on the same page). It reads
  the entities already collected from the page and makes no new backend calls.
- **Entity search** (`:`): an overlay that filters across all detected entities
  as you type. Shows up to 20 results and is keyboard-navigable.

## Entity selection and quick actions

Click a highlight, or a row in an entity panel, to select it; click more to
build up a selection. A quick-action row appears with the lookups and actions
available for that entity type. Run them with the buttons or their
[keyboard shortcuts](keyboard-shortcuts.md#selecting-entities): analyze the
selection, open it in the Entity Inspector, or send it to an external service.
Hold the analyze button (or `Z`) to pick a specific service. Copy the selected
values with `Ctrl+C`, select everything in a panel with `Ctrl+A`, and clear the
selection with `Esc`.

## Region selection

Analyze only part of a page instead of the whole document:

1. Press `Ctrl+X` to enter execution mode.
2. Press `S`.
3. Select a region of the page.

## Textarea overlay (experimental)

Inspect text typed or pasted into forms, input fields, and rich-text editors
(including TinyMCE) without sending it anywhere first. Enable the feature in the
settings popup, then press `Ctrl+X` followed by `V` to show or hide the overlays.

## Settings popup

Open the extension popup to configure Fishbowl.

### Settings

- entity highlighting
- HUD visibility
- panel headers
- caching
- opacity
- theme

### Analysis

Enable or disable individual [threat-intelligence providers](threat-intelligence.md)
per entity type.

### Whitelist

- Restrict Fishbowl to specific domains.
- Configure CSP-bypass exceptions (see
  [Troubleshooting](troubleshooting.md#pages-that-wont-scan)).

### Logs

View extension activity for debugging.

---

[← Documentation home](README.md)
