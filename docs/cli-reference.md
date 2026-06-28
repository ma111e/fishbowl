# CLI Reference

All Fishbowl commands run through the `fishbowl` binary.

## Server and setup

| Command | Description |
|---|---|
| `fishbowl server` | Start the analysis backend on `localhost:7158`. |
| `fishbowl setup` | Open the local install page (`localhost:3001`) and start the backend after installation. |
| `fishbowl version` | Print the build version. |

### Interactive server controls

While `fishbowl server` runs in a terminal:

- Press **`Ctrl-C`** to shut down.

Re-enrollment is automatic: if the extension's signature stops matching (e.g.
it was reinstalled) or a pairing code expires before it's used, the backend
resets enrollment and prints a fresh pairing code the next time the extension
reaches it. Reload the page in the browser to bring up the pairing prompt.

## API keys

| Command | Description |
|---|---|
| `fishbowl api register [service]` | Store an API key (prompts; service optional). |
| `fishbowl api delete [service]` | Remove a stored key. |
| `fishbowl api list` | Show fingerprint, created, and last-used per service: never the secret. |

Services that accept a key: `virustotal`, `abuseipdb`, `bazaar`, `shodan`. See
[API Keys](api-keys.md).

## Vault

| Command | Description |
|---|---|
| `fishbowl vault lock` | Switch to passphrase-protected mode. |
| `fishbowl vault unlock` | Switch back to machine-bound seed mode. |
| `fishbowl vault passwd` | Change the unlock passphrase (passphrase mode only). |

## Ports

| Service | Address |
|---|---|
| Backend | `localhost:7158` |
| Setup page | `localhost:3001` |

---

[← Documentation home](README.md)
