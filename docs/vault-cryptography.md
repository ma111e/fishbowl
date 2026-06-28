# Vault Cryptography

Fishbowl's vault and backend run locally. Provider API keys are encrypted at
rest and are sent only to their respective providers when an API lookup runs;
they are never sent to a Fishbowl-controlled service. Signing private keys stay
on your machine. Signed requests authenticate the extension and backend to each
other over the local HTTP channel.

To register keys or switch unlock modes, see [API Keys](api-keys.md) and the
[CLI Reference](cli-reference.md).

## At a glance

| Purpose | Primitive | Source |
|---|---|---|
| Secret encryption at rest | AES-256-GCM, 96-bit random nonce per message | `internal/config/envelope.go` |
| Key-encryption-key (KEK) derivation | Argon2id | `internal/config/kdf.go` |
| Vault lifecycle, modes, file guards | n/a | `internal/config/vault.go` |
| Request/response authentication | ECDSA P-256 / SHA-256 (IEEE P1363) | `internal/api/auth.go`, `web/js/fishbowl-net.js` |
| Extension enrollment | 6-digit pairing code, `crypto/rand`, constant-time compare | `internal/pairing/pairing.go` |
| Randomness | `crypto/rand` (Go) / `crypto.getRandomValues` via WebCrypto (extension) | n/a |

Keys and nonces come from `crypto/rand` (or WebCrypto in the extension). There
are no hard-coded keys, and `math/rand` is never used for secrets.

## Why these tools

If you're new to this, here is what each piece is doing and why it was picked.
Every row maps a need to the tool that meets it.

| Need | Tool | Why this one |
|---|---|---|
| Keep provider keys unreadable on disk | AES-256-GCM | Encrypts the keys and stamps each file with a check value, so a file that was edited or corrupted is refused instead of read back wrong. |
| Turn a seed or passphrase into the encryption key | Argon2id | Built to be slow and memory-heavy on purpose, so guessing a passphrase by trying millions of options stays too expensive to be worth it. |
| Notice a wrong passphrase or swapped seed before touching secrets | A small sealed test value in `vault.json` | Fishbowl tries to unseal one known string first; if that fails, the key is wrong and no real secret is ever opened. |
| Tie the encrypted files to this machine and user | The seed file and your user id, plus the machine id on Linux, all fed into the key | Copy the files to another computer or user and the key can't be rebuilt, so the copies are useless. |
| Prove a request really came from the paired extension | ECDSA P-256 signatures | Each side has its own private key it never shares; only the real extension can produce a signature that checks out, so there's no shared password to steal. |
| Stop someone from recording a request and resending it | A timestamp plus a one-time check | A request is accepted once and only within 30 seconds, so a copied request is rejected the second time. |
| Let the extension spot a fake backend | The backend signs its replies, and the extension remembers the first key it saw | If the reply key ever changes, the extension warns that something may be impersonating the backend. |
| Hand out a safe one-time code for pairing | A random 6-digit code, compared carefully | The code is random so it can't be guessed, and the comparison takes the same time whether it's right or wrong, so timing can't leak it. |
| Make every key, code, and random value unpredictable | The operating system's secure random source | Uses the strong randomness meant for security, never the ordinary random numbers used for things like shuffling. |

## File layout & locations

The vault lives in the per-user OS config directory:

| OS | Location |
|---|---|
| Linux | `~/.config/fishbowl/` |
| macOS | `~/Library/Application Support/fishbowl/` |
| Windows | `%AppData%\fishbowl\` |

| File | Contents |
|---|---|
| `vault.json` | Metadata: version, mode, KDF salt, KEK verifier (no secrets). |
| `vault.seed` | 32-byte random seed (seed mode only). |
| `apikeys.enc` | AES-256-GCM-encrypted provider API keys. |
| `server_key.enc` | AES-256-GCM-encrypted server response-signing private key (PKCS#8). |
| `pubkey` | The enrolled extension's **public** key (base64 DER). Non-secret. |

The directory is created `0700` and every vault file is written `0600`. The
`pubkey` file holds only a public key, so it is intentionally kept outside the
encrypted vault.

## Encryption envelope (AES-256-GCM)

Every secret is sealed with AES-256-GCM under the 32-byte KEK. The stored blob is:

```
nonce (12 bytes) ‖ ciphertext ‖ GCM auth tag (16 bytes)
```

- Each seal uses a fresh 12-byte nonce from `crypto/rand`, so no nonce repeats
  under a key. Only a few files are sealed per KEK, and only on writes, which
  keeps the count well under the birthday bound for random 96-bit nonces.
- Decryption checks the GCM tag and returns an error on any mismatch, so a
  tampered file or wrong key is rejected instead of partially read.
- The blob is base64-encoded (RFC 4648, standard alphabet) when embedded in
  `vault.json`; the `.enc` payload files store the raw bytes.
- No additional authenticated data (AAD) is currently bound to a blob's file
  role (see [Threat model](#threat-model)).

Decrypted secrets are passed to a callback, and the buffer is zeroed (`zero()`)
afterward. This is best-effort only (see [Threat model](#threat-model)).

## Key derivation (Argon2id)

The KEK that protects the envelope is derived with **Argon2id** and a random
16-byte salt (stored in `vault.json`). The output is a 32-byte (256-bit) key.

| Mode | Time (passes) | Memory | Parallelism |
|---|---|---|---|
| Seed (default) | 3 | 64 MiB | 2 |
| Passphrase (opt-in) | 4 | 128 MiB | 2 |

Both settings sit above current OWASP Argon2id recommendations. Passphrase mode
runs harder because a human-chosen secret has far less entropy than a random
seed.

### Seed mode (default, non-interactive)

```
KEK = Argon2id( seed ‖ machine-id ‖ "uid:<uid>", salt )
```

- `seed` is 32 random bytes stored in `vault.seed`.
- `machine-id` is read from `/etc/machine-id` (or `/var/lib/dbus/machine-id`) on
  Linux; on macOS/Windows it is empty, so the binding there is the seed file plus
  the user id.
- The machine/uid mixing means the encrypted files cannot be decrypted by copying
  them to another host or another user without also copying the seed.

Seed mode unlocks silently at startup with no prompt, and auto-initialises a
vault on first use if none exists yet.

### Passphrase mode (opt-in)

```
KEK = Argon2id( passphrase, salt )
```

The backend prompts for the passphrase on start and allows up to 3 attempts.
Switch into this mode with `fishbowl vault lock` (see the
[CLI Reference › Vault](cli-reference.md#vault)).

## KEK verifier

`vault.json` stores a **verifier**: a fixed canary string
(`fishbowl-vault-kek-v1`) sealed under the KEK at creation time. On unlock the
backend re-decrypts the canary; if the tag fails (a wrong passphrase or a
replaced seed), the KEK is rejected before any payload is read. The canary text
is not secret; only its authentication tag matters.

## Mode switching & rotation

Three operations re-key the vault, each generating a new random salt and a new
KEK, then re-sealing every payload (`apikeys.enc` and `server_key.enc`) under it
via the internal `reencrypt()` path:

| Command | Effect |
|---|---|
| `fishbowl vault lock` | Seed → passphrase. The `vault.seed` file is removed. |
| `fishbowl vault unlock` | Passphrase → seed. A new random seed is generated. |
| `fishbowl vault passwd` | Rotate the passphrase (passphrase mode only). |

See the [CLI Reference › Vault](cli-reference.md#vault) for usage.

## File permissions & integrity

Before reading a vault file the backend enforces a strict policy
(`requirePrivate`):

- The file must be a regular file owned by the current user, mode `0600`.
- Its parent directory must be mode `0700` and owned by the current user.
- The check uses `Lstat`, so a symlink in place of a vault file is rejected
  rather than followed.

Writes are atomic: data goes to a temporary file (`0600`), is `fsync`-ed, then
renamed into place, so a crash leaves either the old file or the complete new
one, never a partially written secret.

These owner and permission checks apply on Unix-like systems. On Windows the
equivalent ACL checks are not yet implemented, so vault files there rely on the
default protections of your user-profile directory (see
[Threat model](#threat-model)).

## Server response-signing key

The backend signs its responses (for mutual authentication, below) with its own
ECDSA P-256 key. On first use it is generated with `crypto/rand`, serialised as
PKCS#8, and stored encrypted in `server_key.enc` under the vault KEK. It is
decrypted into memory once per process and zeroed after parsing the serialised
form.

## Transport authentication (extension ↔ backend)

The backend listens only on localhost, but it still verifies every request and
signs its successful responses: the server accepts requests only from the paired
extension, and the extension can tell when it is talking to a spoofed backend.

### Request signing

- On first run the extension generates an **ECDSA P-256** keypair via WebCrypto
  (`crypto.subtle.generateKey`). The private key (JWK) and public key (base64
  SPKI) are stored in `browser.storage.local`.
- Each request is signed over the canonical string:

  ```
  <method>\n<path>\n<timestamp-ms>\n<body>
  ```

  The URL query string is not part of the signed message today; every endpoint
  reads its input from the JSON body rather than from query parameters.

- Signatures are 64-byte IEEE-P1363 (`r ‖ s`), base64-encoded. They travel in
  `X-Fishbowl-Signature`, with `X-Fishbowl-Timestamp` and the public key in
  `X-Fishbowl-PubKey`.

### Freshness & replay protection

These checks run on the protected data routes (`AuthMiddleware`):

- The timestamp must be within ±30 seconds of server time.
- A nonce cache keyed by the signature rejects any signature seen twice within
  that window, so a captured request cannot be replayed.

The pairing endpoints are guarded differently: `/pair` is protected by its
single-use code, and `/ping` carries no replay cache.

### Mutual authentication (response signing)

The server signs each successful (2xx) response over:

```
<request-signature>\n<response-timestamp>\n<response-body>
```

which binds the response to that specific request. The extension pins the
server's public key on first contact (**trust on first use**) and checks every later
response against it; if the key changes it raises a "Server key mismatch
(possible MITM)" error rather than trusting the new key.

## Pairing / enrollment

Before the server trusts an extension public key, the extension must enroll using
a short-lived pairing code:

- The code is **6 digits** generated with `crypto/rand`, valid for
  **30 seconds**, and single-use (at most one code is active at a time).
- Codes are compared in **constant time** (`crypto/subtle`) to avoid timing
  leaks.
- After 5 failed attempts within a 30-second window the active code is
  invalidated. Five guesses against a one-in-a-million space is about a
  1-in-200,000 chance before lockout.
- Enrollment also requires the candidate to sign the request with the key it is
  enrolling (proof of possession), so a third party cannot register someone
  else's public key.

The pairing flow has dedicated endpoints whose successful responses are
server-signed: **`POST /pair`** performs enrollment (pubkey + code → trusted
key), and **`POST /ping`** reports pairing state and issues a fresh code when the
extension isn't enrolled (also clearing a stale/foreign key so re-pairing can
proceed). A failed `/pair` or an unpaired `/ping` reply (`401`) is returned
unsigned, so the extension can recover before it is enrolled. The data routes
(`/capabilities`, `/analyze-page`, `/analyze-ip-verdict-from-dom`) require a
valid enrolled signature and have no pairing side effects.

For the operator flow and recovery, see
[Installation › Pairing](installation.md#pairing) and
[Troubleshooting › Re-pairing](troubleshooting.md#re-pairing).

## Threat model

**What the vault and transport layer protect against:**

- Exfiltration of the encrypted files (`apikeys.enc`, `server_key.enc`) without
  the seed: the files are useless on another host or to another user.
- Other local users reading your secrets (Unix `0600`/`0700` + owner checks).
- Casual disk or backup inspection: keys are never stored in plaintext.
- Forged, tampered, or replayed requests to the backend, and a spoofed backend
  impersonating the real one (request signing, replay window, mutual auth + TOFU
  pinning).

**What it does *not* protect against:**

- **Same-user, same-host compromise in seed mode.** The seed file, machine-id,
  and uid are all readable by your own account, so anything running as you can
  derive the KEK and decrypt. For confidentiality against this, use
  **passphrase mode** (`fishbowl vault lock`) so the KEK depends on a secret that
  is never written to disk.
- **Windows at-rest enforcement (current state).** Permission/ownership checks are
  Unix-only today; on Windows the files rely on default user-profile ACLs.
- **Memory disclosure.** Zeroing of decrypted secrets is best-effort; Go's garbage
  collector and string copies (e.g. HTTP header values) can retain copies beyond
  its reach.
- **Query-string tampering.** The request signature does not yet cover the URL
  query string; this is currently moot because no endpoint reads query parameters.
- **First-contact MITM on the localhost channel.** Server-key trust is
  established on first use (TOFU); a man-in-the-middle present at the very first
  exchange would be pinned. Subsequent key changes are detected.

## References

Source:

- `internal/config/envelope.go`: AES-256-GCM seal/open, memory zeroing.
- `internal/config/kdf.go`: Argon2id derivation, machine/uid binding.
- `internal/config/vault.go`: modes, file guards, verifier, rotation, server key.
- `internal/config/config.go`: API-key storage and env overrides.
- `internal/api/auth.go`: request verification, response signing, route middleware.
- `internal/api/pairing_handlers.go`: the `/pair` (enrollment) and `/ping`
  (pairing-state probe) handlers.
- `internal/pairing/pairing.go`: pairing code generation and lockout.
- `web/js/fishbowl-net.js`: extension keypair, request signing, TOFU pinning.

Related docs: [API Keys](api-keys.md) · [CLI Reference](cli-reference.md) ·
[Installation](installation.md) · [Troubleshooting](troubleshooting.md) ·
[FAQ](faq.md).

---

[← Documentation home](README.md)
