# FAQ

## Is my browsing data sent anywhere?

No. Page content is analyzed locally by the backend on your own machine. There
is no cloud relay and no telemetry. The only outbound traffic is the
threat-intelligence lookups you trigger, which go directly to the providers you
have enabled. When an API key is configured, Fishbowl sends it only to that
provider as part of the direct API request, not to a Fishbowl-controlled service.

## Where are my API keys stored?

In an encrypted vault under your OS config directory (e.g.
`~/.config/fishbowl/` on Linux). Keys are encrypted with AES-256-GCM. See
[API Keys › Storage](api-keys.md#storage), or
[Vault Cryptography](vault-cryptography.md) for the key-derivation and
encryption details.

## Do I need API keys to use Fishbowl?

No. Detection and the bundled datasets work offline with no keys. Several
providers also work without a key by parsing their public result pages. Keys add
more detailed and reliable data for VirusTotal, AbuseIPDB, MalwareBazaar, and Shodan.
See [Threat Intelligence](threat-intelligence.md).

## Which browsers are supported?

| Browser | Manifest |
|---|---|
| Chrome, Edge, Brave, Opera | Manifest V3 |
| Firefox | Manifest V3 |

## Can I use VirusTotal at work?

VirusTotal's free API tier prohibits commercial use, business workflows, and
production integrations. Review VirusTotal's terms before using it in a
professional environment.

## How is the extension authenticated to the backend?

Each request is signed with an ECDSA-P256 keypair the extension generates on
first run. The public key is enrolled once via a short-lived pairing code; after
that, signing is automatic. See [Installation › Pairing](installation.md#pairing).

---

[← Documentation home](README.md)
