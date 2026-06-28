# Troubleshooting

## The extension can't reach the backend

The backend must be running for analysis to work.

1. Start it: `fishbowl server`.
2. Confirm it's listening on `localhost:7158` (the startup log prints the
   address).
3. If a scan still fails, check the extension popup's **Logs** section for the
   error.

The backend binds to `localhost` (not `127.0.0.1`) to match the extension's CSP
allowlist; don't change the host.

## Pairing code expired or rejected

The pairing code is valid for **30 seconds**, and five wrong attempts within the
window invalidate it.

Reload the page in the browser. The backend automatically issues a fresh code
the next time the extension reaches it (the new code is printed in the server
log); enter that code in the pairing prompt.

## Re-pairing

To enrol a different extension (e.g. after reinstalling the browser or
extension), nothing manual is needed:

1. Install/switch to the extension and reload a page. Its new keypair no longer
   matches the enrolled key, so the backend resets enrollment and prints a fresh
   pairing code automatically.
2. The pairing prompt comes up; enter the new code from the server log.

## Pages that won't scan

Some sites' Content-Security-Policy blocks the extension's overlay or its calls.

- Add the site under **Whitelist → CSP-bypass exceptions** in the
  [settings popup](interface.md#whitelist).
- If you've restricted Fishbowl to specific domains in the whitelist, make sure
  the current site is included.

## A provider returns "unknown"

`unknown` means there was no data or the lookup couldn't run:

- The provider has no record for that entity.
- An API-only provider has no key configured. **Shodan** in particular returns
  `unknown` without a key; register one (see [API Keys](api-keys.md)).
- For providers with a scraping fallback (VirusTotal, AbuseIPDB), a layout
  change on the provider's site can break parsing; configuring an API key is
  more reliable.

---

[← Documentation home](README.md)
