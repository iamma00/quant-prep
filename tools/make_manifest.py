"""Build or verify updates/manifest.json from the compiled content bundle.

The manifest is the only thing the app polls. It must always describe the
exact bytes of src-tauri/resources/seed.json, otherwise clients will reject the
download after hashing it.

    python tools/make_manifest.py --notes "Added treasury ladder"
    python tools/make_manifest.py --check
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SEED = APP / "src-tauri" / "resources" / "seed.json"
OUT = APP / "updates" / "manifest.json"
DEFAULT_BUNDLE_URL = (
    "https://raw.githubusercontent.com/iamma00/quant-prep/main/"
    "src-tauri/resources/seed.json"
)
MAX_BUNDLE_BYTES = 24 * 1024 * 1024


def fail(message: str) -> None:
    print(f"ERROR {message}", file=sys.stderr)
    raise SystemExit(1)


def load_seed() -> tuple[dict, bytes]:
    if not SEED.exists():
        fail(f"missing bundle: {SEED}. Run tools/build_content.py first.")
    raw = SEED.read_bytes()
    if b"\r" in raw:
        fail(
            "bundle contains CR characters; regenerate with tools/build_content.py "
            "so the published bytes match the manifest"
        )
    if len(raw) > MAX_BUNDLE_BYTES:
        fail(f"bundle is {len(raw)} bytes, above the {MAX_BUNDLE_BYTES} byte app limit")
    try:
        seed = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"bundle is not valid JSON: {exc}")
    version = str(seed.get("content_version", "")).strip()
    if not version:
        fail("bundle has no content_version")
    if not str(seed.get("app_min_version", "")).strip():
        fail("bundle has no app_min_version")
    if seed.get("schema_version") != 1:
        fail("bundle schema_version must be 1")
    return seed, raw


def build(args: argparse.Namespace) -> int:
    seed, raw = load_seed()
    version = seed["content_version"].strip()
    if args.version and args.version != version:
        fail(
            f"--version {args.version!r} does not match the bundle's "
            f"content_version {version!r}. Bump the bundle first."
        )

    notes = args.notes.strip() if args.notes else (
        f"Content {version}: {seed.get('stats', {}).get('chapters', '?')} chapters, "
        f"{seed.get('stats', {}).get('tracks', '?')} tracks, "
        f"{seed.get('stats', {}).get('levels', '?')} levels."
    )
    published_at = args.published_at or datetime.now(timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    manifest = {
        "schema_version": 1,
        "content_version": version,
        "app_min_version": seed["app_min_version"].strip(),
        "bundle_url": args.bundle_url,
        "bundle_sha256": hashlib.sha256(raw).hexdigest(),
        "bundle_size": len(raw),
        "notes": notes,
        "published_at": published_at,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    print(f"  content_version {version}")
    print(f"  bundle_size     {len(raw):,} bytes")
    print(f"  bundle_sha256   {manifest['bundle_sha256']}")
    print(f"  bundle_url      {args.bundle_url}")
    return 0


def check(_: argparse.Namespace) -> int:
    seed, raw = load_seed()
    if not OUT.exists():
        fail(f"missing {OUT}. Run tools/make_manifest.py first.")
    try:
        manifest = json.loads(OUT.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"manifest is not valid JSON: {exc}")

    expected = {
        "schema_version": 1,
        "content_version": seed["content_version"].strip(),
        "app_min_version": seed["app_min_version"].strip(),
        "bundle_sha256": hashlib.sha256(raw).hexdigest(),
        "bundle_size": len(raw),
    }
    problems = []
    for key, value in expected.items():
        if manifest.get(key) != value:
            problems.append(f"{key}: manifest={manifest.get(key)!r} expected={value!r}")
    if not str(manifest.get("bundle_url", "")).startswith("https://"):
        problems.append("bundle_url must be HTTPS")
    if problems:
        for problem in problems:
            print(f"ERROR {problem}", file=sys.stderr)
        print("Regenerate with tools/make_manifest.py.", file=sys.stderr)
        return 1
    print(
        f"OK: {OUT.name} matches seed v{expected['content_version']} "
        f"({expected['bundle_size']:,} bytes, {expected['bundle_sha256'][:12]}…)"
    )
    return 0


def main() -> int:
    global OUT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle-url", default=DEFAULT_BUNDLE_URL, help="public HTTPS URL of seed.json")
    parser.add_argument("--notes", default="", help="release notes shown in the app")
    parser.add_argument("--published-at", default="", help="ISO-8601 UTC timestamp (default: now)")
    parser.add_argument("--version", default="", help="must match the bundle's content_version")
    parser.add_argument("--out", default=str(OUT), help="output path (default: updates/manifest.json)")
    parser.add_argument("--check", action="store_true", help="verify the existing manifest instead of writing")
    args = parser.parse_args()

    OUT = Path(args.out)
    return check(args) if args.check else build(args)


if __name__ == "__main__":
    sys.exit(main())
