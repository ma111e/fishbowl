#!/usr/bin/env python3
"""
CSS token guardrail for FishBowl.

Scans web/styles/*.css and web/js/**/*.js for CSS custom-property *usages*
(`var(--x)`) that are never *defined* (`--x:` in CSS or setProperty('--x') in
JS). Such dangling references fail silently in the browser (the declaration is
dropped), so we catch them at build time instead.

Exit non-zero if any unexpected missing token is found.

Run from the web/ directory (or anywhere - paths are resolved relative to this
file's parent).
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)  # tools/ -> web/

# Tokens that are constructed dynamically at runtime (e.g. `var(--verdict-${v})`)
# and therefore can't be statically resolved. Matched as prefixes.
DYNAMIC_PREFIXES = (
    "--verdict-",  # entity-blocks.js: `var(--verdict-${v})`
)

DEF_RE = re.compile(r"(--[a-z0-9-]+)\s*:", re.IGNORECASE)
SETPROP_RE = re.compile(r"""setProperty\(\s*['"](--[a-z0-9-]+)""")
USE_RE = re.compile(r"var\(\s*(--[a-z0-9-]+)")


def iter_files():
    for root, _dirs, files in os.walk(os.path.join(WEB, "styles")):
        for f in files:
            if f.endswith(".css"):
                yield os.path.join(root, f)
    for root, _dirs, files in os.walk(os.path.join(WEB, "js")):
        for f in files:
            if f.endswith(".js"):
                yield os.path.join(root, f)


def main():
    defined = set()
    used = {}  # token -> set(files)
    for path in iter_files():
        with open(path, encoding="utf-8", errors="ignore") as fh:
            text = fh.read()
        for m in DEF_RE.findall(text):
            defined.add(m)
        for m in SETPROP_RE.findall(text):
            defined.add(m)
        for m in USE_RE.findall(text):
            used.setdefault(m, set()).add(os.path.relpath(path, WEB))

    missing = {
        tok: files
        for tok, files in used.items()
        if tok not in defined and not tok.startswith(DYNAMIC_PREFIXES)
    }

    if missing:
        print("CSS token check FAILED - used but never defined:")
        for tok in sorted(missing):
            print(f"  {tok}  (in {', '.join(sorted(missing[tok]))})")
        print(
            "\nDefine the token in web/styles/common.css, fix the typo, or add a "
            "dynamic prefix to DYNAMIC_PREFIXES in this script."
        )
        return 1

    print(f"CSS token check OK - {len(defined)} defined, {len(used)} referenced, 0 dangling.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
