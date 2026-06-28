# Embedded setup assets

This directory is the embed root for the `fishbowl setup` command.

`make build` (from the repo root) populates it with the built extension
artifacts before compiling the binary:

- `fishbowl-chrome.zip` - Chromium extension (Load unpacked)
- `fishbowl-firefox.xpi` - Firefox extension
- `icon.png` - page logo

Those files are git-ignored; only this README is tracked so that
`//go:embed assets` always matches at least one file and a plain
`go build` succeeds even without running the web build.
