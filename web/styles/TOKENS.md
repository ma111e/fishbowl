# Design tokens

The FishBowl color/spacing system is defined as CSS custom properties (OKLCH) in
[`common.css`](common.css): the dark palette in `:root, :host` and the light
palette in `.fishbowl-theme-light`. Every component stylesheet consumes these
tokens, so changing a value here re-themes the whole UI.

## Source of truth

`common.css` is the runtime source of truth. [`tokens.json`](tokens.json) is the
**design export** it was transcribed from - committed so the palette has a
traceable origin (the Figma "Tokens / Dark" and "Tokens / Light" Dev-Mode
exports). It holds both themes' raw token values.

## Regenerating after a Figma update

1. In Figma Dev Mode, export the **Tokens / Dark** and **Tokens / Light** frames
   as HTML (the same exports this was built from).
2. Re-extract `tokens.json` from those exports:

   ```bash
   # from web/ , with the two exports in /tmp/design/
   python3 - <<'PY'
   import re, json, os
   src='/tmp/design'
   out={}
   for theme,f in [('dark','Tokens _ Dark.html'),('light','Tokens _ Light.html')]:
       html=re.sub(r'data:font/woff2;base64,[A-Za-z0-9+/=]+','',open(os.path.join(src,f)).read())
       defs=re.findall(r'(--[a-z0-9-]+):\s*(oklch\([^)]*\)|[0-9.]+px|[^;"]+?)(?=;)',html)
       seen={k:v.strip() for k,v in defs}
       out[theme]={k:v for k,v in seen.items() if not k.startswith('--dc-')}
   json.dump(out, open('styles/tokens.json','w'), indent=2, ensure_ascii=False)
   PY
   ```

3. Diff `tokens.json` against the previous version and apply any changed values
   to the `:root, :host` (dark) and `.fishbowl-theme-light` blocks in
   `common.css`. Keep derived `--color-*` aliases referencing tokens (don't
   paste raw `oklch()` literals - see the guardrail below).

## Guardrails

- `make lint-css` (runs `tools/check-css-tokens.py`) fails the build if any
  `var(--x)` is used but never defined. It runs automatically before
  `make chrome` / `make firefox`.
- Browser floor: OKLCH + `color-mix()` require **Firefox ≥ 113 / Chrome ≥ 111**;
  the manifests set these minimums. Don't lower them without adding fallbacks.

## Notes

- Components live inside a shadow DOM (the HUD); base tokens are defined on
  `:root, :host` so they resolve both in the page and inside the shadow.
- `--fishbowl-panel-bg-rgb` is the one intentional raw-RGB token, kept only for
  the info-panel opacity slider (a *runtime-variable* alpha that `color-mix()`
  can't express at the current browser floor). It must mirror `--bg-0`.
