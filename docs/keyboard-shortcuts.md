# Keyboard Shortcuts

Fishbowl's page shortcuts run inside **execution mode**. Enter it with:

```
Ctrl+X
```

Then press a single key. The action runs and execution mode exits
automatically. Press `Esc` to leave execution mode without doing anything (or to
cancel an in-progress region selection). Shortcuts are ignored while a text input
is focused.

| Key | Action |
|---|---|
| `S` | Region selection |
| `R` | Rescan the page |
| `P` | Toggle entity panels |
| `H` | Hide the HUD |
| `E` | Open the Entity Inspector |
| `C` | Reset panel positions for the current site |
| `A` | Reset / remount the HUD |
| `T` | Toggle theme |
| `V` | Toggle textarea inspection overlays |
| `O` | Open the investigation sandbox |
| `N` | Create an investigation from the current page |
| `I` | Import the current page into the active investigation |
| `:` | Entity search |
| `Esc` | Exit execution mode (or cancel region selection) |

`Ctrl+R` still reloads the page as usual; it is not intercepted.

## Selecting entities

Click a highlight on the page, or a row in an entity panel, to select it; click
more to build up a selection. This works on its own and does not need execution
mode. While a selection is active, these keys act on it:

| Key | Action |
|---|---|
| `Z` | Analyze reputation; hold to open the service picker |
| `E` | Open the Entity Inspector |
| `D` | Open the dashboard (IP only) |
| `Enter` | Run the default action for the selection |
| `Ctrl+C` | Copy the selected values |
| `Ctrl+A` | Select every entity in the active panel |
| `Esc` | Clear the selection |

The remaining keys open an external lookup for the selected entity. Which keys
are offered depends on the entity type:

| Entity | Lookup keys |
|---|---|
| IP | `G` Google, `S` Spur, `V` VirusTotal, `A` AbuseIPDB, `W` WHOIS, `I` IP Info, `X` AlienVault OTX, `N` GreyNoise, `O` Shodan |
| Domain | `G` Google, `V` VirusTotal, `L` ChatGPT, `P` Perplexity |
| Hash | `V` VirusTotal, `B` MalwareBazaar |
| File | `G` Google, `V` VirusTotal |
| ASN | `I` IPinfo |
| Event ID | `I` Event Info |
| SID | `I` Well-known SIDs, `G` Google |

---

[← Documentation home](README.md)
