# API Keys

Some providers return more detailed data when Fishbowl calls their API with a key.
Keys are optional: providers that support public result pages are scraped
automatically when no key is set. See
[Threat Intelligence](threat-intelligence.md) for which provider needs what.

## Services that accept a key

`virustotal`, `abuseipdb`, `bazaar`, `shodan`.

## Register keys

Interactively (prompts for service and key):

```bash
fishbowl api register
```

Or name the service directly:

```bash
fishbowl api register virustotal
fishbowl api register abuseipdb
fishbowl api register bazaar
fishbowl api register shodan
```

List configured keys (shows a fingerprint and created/last-used dates, never the
secret):

```bash
fishbowl api list
```

Remove a key:

```bash
fishbowl api delete [service]
```

## Where to get a key

| Service | Where |
|---|---|
| VirusTotal | Account → API key (free tier; see the notice below) |
| AbuseIPDB | Account → API → create key |
| MalwareBazaar | abuse.ch account → Auth-Key (optional) |
| Shodan | Account → API key |

## Storage

Keys are kept in an encrypted vault under your OS config directory:

| OS | Location |
|---|---|
| Linux | `~/.config/fishbowl/` |
| macOS | `~/Library/Application Support/fishbowl/` |
| Windows | `%AppData%\fishbowl\` |

The vault holds the encrypted keys (`apikeys.enc`) plus its metadata
(`vault.json`). Files are written private (0600) in a private directory (0700).
When Fishbowl performs an API lookup, it sends the relevant key directly to that
provider. Keys are not sent to a Fishbowl-controlled service.

**Two unlock modes:**

- **Seed mode** (default): the key is bound to a machine-local seed file
  (`vault.seed`) and unlocks silently. No prompt.
- **Passphrase mode**: opt-in. The backend prompts for a passphrase on start.

Switch modes with `fishbowl vault lock` / `fishbowl vault unlock`, and rotate
the passphrase with `fishbowl vault passwd`. See the
[CLI Reference](cli-reference.md).

See [Vault Cryptography](vault-cryptography.md) for the encryption and
key-derivation details.

## Environment overrides

For CI or automation, an environment variable overrides the vault for that
service:

```
FISHBOWL_VIRUSTOTAL_KEY
FISHBOWL_ABUSEIPDB_KEY
FISHBOWL_BAZAAR_KEY
FISHBOWL_SHODAN_KEY
```

## VirusTotal usage notice

VirusTotal's free API tier prohibits commercial use, business workflows, and
production integrations. Review VirusTotal's terms before using it in a
professional environment.

---

[← Documentation home](README.md)
