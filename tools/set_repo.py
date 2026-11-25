"""Point the project at your GitHub owner/repository.

The default is iamma00/quant-org-os. If you fork or rename the repository,
run this once so the About link, update manifest and package metadata agree.

    python tools/set_repo.py --owner your-name
    python tools/set_repo.py --owner your-org --repo quant-firm-os
    python tools/set_repo.py --owner your-name --dry-run
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
OLD = "iamma00/quant-org-os"
TEXT_FILES = [
    "README.md",
    "CHANGELOG.md",
    "SECURITY.md",
    "docs/OFFLINE-AND-UPDATES.md",
    "docs/PUBLISHING.md",
    "ui/js/app.js",
    "src-tauri/Cargo.toml",
    "src-tauri/src/settings.rs",
    "src-tauri/src/update.rs",
    "tools/make_manifest.py",
    "updates/manifest.json",
]
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner", required=True, help="GitHub user or organisation")
    parser.add_argument("--repo", default="quant-org-os", help="repository name")
    parser.add_argument("--dry-run", action="store_true", help="show changes only")
    args = parser.parse_args()

    if not NAME.fullmatch(args.owner) or not NAME.fullmatch(args.repo):
        print("ERROR owner and repo may contain only letters, digits, '.', '_' and '-'", file=sys.stderr)
        return 1

    new = f"{args.owner}/{args.repo}"
    if new == OLD:
        print(f"Already set to {OLD}; nothing to do.")
        return 0

    changed = 0
    for relative in TEXT_FILES:
        path = APP / relative
        if not path.exists():
            print(f"WARN  missing {relative}", file=sys.stderr)
            continue
        text = path.read_text(encoding="utf-8")
        count = text.count(OLD)
        if not count:
            continue
        print(f"{'would update' if args.dry_run else 'updated'} {relative} ({count} reference(s))")
        if not args.dry_run:
            path.write_text(text.replace(OLD, new), encoding="utf-8")
        changed += 1

    if args.dry_run:
        print(f"\nDry run: {changed} file(s) would change to {new}.")
    else:
        print(f"\nNow set to {new} in {changed} file(s).")
        print("Next: python tools/make_manifest.py --check")
        print("      git add -A && git commit -m \"chore: point at " + new + "\"")
    return 0


if __name__ == "__main__":
    sys.exit(main())
