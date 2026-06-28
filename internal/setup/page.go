package setup

// pageHTML is the install page rendered by `fishbowl setup`. It branches on the
// detected browser and on whether each artifact is bundled in the binary.
const pageHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install FishBowl</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0d1117; color: #e6edf3;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .card {
    width: 100%; max-width: 560px; margin: 24px; padding: 32px;
    background: #161b22; border: 1px solid #30363d; border-radius: 14px;
  }
  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
  .head img { width: 48px; height: 48px; }
  h1 { font-size: 1.5rem; margin: 0; }
  .detected { color: #8b949e; font-size: 0.9rem; margin: 0 0 24px; }
  .btn {
    display: inline-block; padding: 12px 22px; border-radius: 8px; font-size: 1rem; font-weight: 600;
    text-decoration: none; background: #238636; color: #fff; border: 0; cursor: pointer;
  }
  .btn:hover { background: #2ea043; }
  ol { padding-left: 20px; line-height: 1.8; }
  code {
    background: #0d1117; border: 1px solid #30363d; border-radius: 5px;
    padding: 2px 6px; font-size: 0.9em;
  }
  .copy { margin-left: 6px; padding: 2px 8px; font-size: 0.8em; cursor: pointer;
          background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 5px; }
  details { margin-top: 18px; }
  summary { cursor: pointer; color: #58a6ff; }
  .note { margin-top: 8px; color: #8b949e; font-size: 0.88rem; }
  .warn { margin-top: 18px; padding: 12px 14px; border-radius: 8px;
          background: #2d2212; border: 1px solid #5c4813; color: #e3b341; font-size: 0.9rem; }
  .next { margin-top: 28px; padding-top: 18px; border-top: 1px solid #30363d; }
  .next h3 { margin: 0 0 6px; font-size: 1rem; }
  .status { display: flex; align-items: center; gap: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #8b949e; flex: 0 0 auto; }
  .status.ok .dot { background: #2ea043; }
  .status.ok #statusText { color: #2ea043; }
  .linkbtn { background: none; border: 0; color: #58a6ff; cursor: pointer; padding: 0; font-size: 0.88rem; text-decoration: underline; }
  .pair {
    margin-top: 18px; padding: 14px 16px; border-radius: 10px;
    background: #0d1c2e; border: 1px solid #1f6feb;
  }
  .pair h3 { margin: 0 0 6px; font-size: 1rem; color: #58a6ff; }
</style>
</head>
<body>
<div class="card">
  <div class="head">
    <img src="/icon.png" alt="FishBowl" onerror="this.style.display='none'">
    <h1>Install FishBowl</h1>
  </div>

  {{if eq .Browser "firefox"}}
    <p class="detected">Detected browser: Firefox</p>
    {{if .FirefoxAvailable}}
      <a class="btn" href="/download/firefox.xpi">Install FishBowl</a>
      <p class="note">Firefox will ask for permission to add the extension.</p>
      <details>
        <summary>Didn't work? Install temporarily</summary>
        <ol>
          <li><a href="/download/firefox-file.xpi" download="fishbowl-firefox.xpi">Download <code>fishbowl-firefox.xpi</code></a></li>
          <li>Open <code>about:debugging#/runtime/this-firefox</code></li>
          <li>Click <b>Load Temporary Add-on…</b></li>
          <li>Select the downloaded <code>fishbowl-firefox.xpi</code></li>
        </ol>
        <p class="note">A permanent install on release Firefox requires an AMO-signed build; the temporary add-on is removed when Firefox restarts.</p>
      </details>
    {{else}}
      <div class="warn">The Firefox extension isn't bundled in this binary. Rebuild with <code>make build</code>.</div>
    {{end}}

  {{else if eq .Browser "chromium"}}
    <p class="detected">Detected a Chromium-based browser (Chrome / Edge / Brave / Opera)</p>
    {{if .ChromeAvailable}}
      <a class="btn" href="/download/chrome.zip">Download extension</a>
      <ol style="margin-top:20px">
        <li>Unzip the downloaded file</li>
        <li>Open <code>chrome://extensions</code> <button class="copy" onclick="copyExt(this)">copy</button></li>
        <li>Enable <b>Developer mode</b> (top-right)</li>
        <li>Click <b>Load unpacked</b> and select the unzipped folder</li>
      </ol>
    {{else}}
      <div class="warn">The Chrome extension isn't bundled in this binary. Rebuild with <code>make build</code>.</div>
    {{end}}

  {{else}}
    <p class="detected">Couldn't detect your browser - pick your platform:</p>
    {{if .FirefoxAvailable}}<p><a class="btn" href="/download/firefox.xpi">Firefox: Install</a></p>{{end}}
    {{if .ChromeAvailable}}<p><a class="btn" href="/download/chrome.zip">Chrome/Chromium: Download</a> then load it unpacked via <code>chrome://extensions</code>.</p>{{end}}
    {{if and (not .FirefoxAvailable) (not .ChromeAvailable)}}<div class="warn">No extension is bundled in this binary. Rebuild with <code>make build</code>.</div>{{end}}
  {{end}}

  <div class="pair">
    <h3>Pair the extension</h3>
    <p class="note" style="margin-top:0">
      Once the backend starts (see status below), open the extension's popup and enter the
      pairing code printed in the terminal where you ran <code>fishbowl setup</code>.
      If the code expires, stop and restart setup, then use <b>Start the backend</b>
      below if the extension is already installed.
    </p>
  </div>

  <div class="next">
    <h3>Backend</h3>
    <div class="status" id="status">
      <span class="dot"></span>
      <span id="statusText">Waiting for the extension… the backend starts automatically once it's installed.</span>
    </div>
    <p class="note" id="manualWrap">Already installed? <button class="linkbtn" id="manualBtn" onclick="startBackend()">Start the backend</button></p>
    <p class="note" id="doneHint" style="display:none">For normal use later, just run <code>fishbowl server</code>.</p>
  </div>

  <div class="next">
    <h3>API keys &amp; vault</h3>
    <p class="note">FishBowl stores third-party API keys in an encrypted, machine-bound vault that's created automatically on first run — no password required.</p>
    <p class="note">Add a key anytime: <code>fishbowl api register &lt;service&gt;</code> (e.g. <code>virustotal</code>, <code>abuseipdb</code>).</p>
    <p class="note">Optional: protect the vault with a passphrase via <code>fishbowl vault lock</code> — you'll then be prompted at every start.</p>
  </div>
</div>
<script>
  function copyExt(btn) {
    navigator.clipboard.writeText('chrome://extensions').then(function () {
      var t = btn.textContent; btn.textContent = 'copied'; setTimeout(function(){ btn.textContent = t; }, 1200);
    });
  }
  function markReady() {
    document.getElementById('status').classList.add('ok');
    document.getElementById('statusText').textContent = '✓ Extension detected - backend running on localhost:7158. You’re all set!';
    document.getElementById('manualWrap').style.display = 'none';
    document.getElementById('doneHint').style.display = '';
  }
  function startBackend() {
    fetch('/installed', { method: 'POST' }).catch(function () {});
  }

  async function poll() {
    try {
      const r = await fetch('/status');
      const s = await r.json();
      if (s.installed || s.serverRunning) { markReady(); return; }
    } catch (e) {}
    setTimeout(poll, 1500);
  }
  poll();
</script>
</body>
</html>`
