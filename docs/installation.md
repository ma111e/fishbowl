# Installation

Fishbowl bundles the extension inside the binary. No browser-store install is
required.

Start the installer:

```bash
fishbowl setup
```

This serves a local install page at `http://localhost:3001` and opens it in your
default browser. The page detects your browser and shows the matching option.
After it detects the installed extension, `fishbowl setup` starts the backend
automatically. All Chromium-family browsers (Chrome, Edge, Brave, Opera) use the
same build. Fishbowl needs Chromium 111+ or Firefox 113+.

## Firefox

1. Run `fishbowl setup`.
2. Click **Install**.
3. Approve the browser prompt.

A signed Firefox XPI can be installed permanently. For an unsigned development
build, download the XPI from the install page and load it through
`about:debugging#/runtime/this-firefox` as a temporary add-on. Firefox removes
temporary add-ons when it restarts.

## Chrome / Chromium browsers

1. Run `fishbowl setup`.
2. Click **Download**.
3. Unzip the extension.
4. Open `chrome://extensions`.
5. Enable **Developer Mode**.
6. Click **Load unpacked** and select the extracted folder.

## Pairing

The extension and backend authenticate each other. On first connection the
extension generates an ECDSA-P256 keypair and enrols its public key with the
backend; this requires a one-time pairing code.

1. Finish installing the extension. The setup process starts the backend
   automatically. For later sessions, start it with `fishbowl server`.
2. The backend prints a **6-digit pairing code** in its terminal. It is valid for
   30 seconds.
3. Enter the code in the extension's pairing prompt.

If the code expires before you enter it, just reload the page: the backend
issues a fresh code automatically the next time the extension reaches it (look
for the new code in the server log). If `fishbowl setup` owns the backend and it
isn't running yet, click **Start the backend** on the install page.

After pairing, no manual setup is needed; every request is signed
automatically. To re-pair a different extension later, see
[Troubleshooting › Re-pairing](troubleshooting.md#re-pairing).

---

[← Documentation home](README.md)
