# Threat Intelligence

Clicking a detected entity opens a reputation dashboard with enrichment from the
configured providers. Each provider is queried for the entity types it supports.

## Providers

| Provider | Covers | Mode | API key |
|---|---|---|---|
| VirusTotal | IPs, domains, hashes | API (files fall back to scraping) | Required for API |
| AbuseIPDB | IP reputation | API, scraping fallback | Required for API |
| MalwareBazaar | Malware hash lookups | API | Optional |
| Shodan | IP host/port/CVE data | API only | Required |
| IPinfo | IP and ASN metadata | Scraping | No |
| Spur | IP infrastructure / proxy context | Scraping | No |

**Mode** explains how Fishbowl gets the data:

- **API**: a direct call to the provider's API. Needs a key (see the API key
  column). VirusTotal and AbuseIPDB fall back to scraping when no key is set.
  MalwareBazaar uses its API with or without a key. Shodan is API-only: with no
  key it returns `unknown`.
- **Scraping**: Fishbowl parses the provider's public result page. No key
  required.

Register and manage keys in [API Keys](api-keys.md). Enable or disable providers
per entity type from the [settings popup](interface.md#analysis).

## Verdicts

Each provider result carries a verdict:

| Verdict | Meaning |
|---|---|
| `benign` | No indicators of malice |
| `neutral` | Low signal; nothing notable |
| `suspicious` | Some risk indicators present |
| `malicious` | Strong indicators of malice |
| `unknown` | No data, or lookup unavailable (e.g. missing key) |

## How verdicts are scored

Scoring is per provider:

- **VirusTotal**: by malicious-detection count: `0` → benign, `1-2` → neutral,
  `3-5` → suspicious, `>5` → malicious.
- **AbuseIPDB**: by abuse-confidence score and report count: score `>50` or
  `≥20` reports → malicious; score `>20` → suspicious.
- **MalwareBazaar**: `malicious` if the hash is present in the dataset,
  otherwise `unknown` (not found).
- **Spur**: `suspicious` when proxies or risk signals are present, otherwise
  `neutral`.

IPinfo reports contextual metadata rather than a risk verdict.

---

[← Documentation home](README.md)
