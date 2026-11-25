"""Validate the canonical document and the generated app bundle.

Run from anywhere:

    python tools/verify_content.py [--strict]

Errors exit non-zero. Warnings (e.g. possible absolute compensation figures)
only fail with --strict.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
LOCAL_MD = APP / "quant-org-career-framework.md"
WORKSPACE_MD = APP.parent / "quant-org-career-framework.md"
MD = LOCAL_MD if LOCAL_MD.exists() else WORKSPACE_MD
SEED = APP / "src-tauri" / "resources" / "seed.json"
DIAGRAMS = APP / "src-tauri" / "resources" / "diagrams"

errors: list[str] = []
warnings: list[str] = []


def error(message: str) -> None:
    errors.append(message)


def warn(message: str) -> None:
    warnings.append(message)


def check_document() -> None:
    if not MD.exists():
        error(f"missing source document: {MD}")
        return
    text = MD.read_text(encoding="utf-8")
    if "<!-- CONTINUE -->" in text:
        error("the document still contains a <!-- CONTINUE --> marker")

    sections = re.findall(r"(?m)^## (\d+)\. ", text)
    numbers = [int(n) for n in sections]
    if len(numbers) != 51:
        error(f"expected 51 numbered sections, found {len(numbers)}")
    if sorted(numbers) != list(range(1, 52)):
        missing = sorted(set(range(1, 52)) - set(numbers))
        dupes = sorted({n for n in numbers if numbers.count(n) > 1})
        error(f"section numbering is not 1..51 (missing={missing}, duplicates={dupes})")

    appendices = re.findall(r"(?m)^## Appendix ([A-H])\b", text)
    if appendices != list("ABCDEFGH"):
        error(f"appendices A-H are not in order: {appendices}")

    if text.count("```") % 2:
        error("unbalanced Markdown code fences")
    mermaid = len(re.findall(r"(?m)^```mermaid\s*$", text))
    if mermaid != 6:
        warn(f"expected 6 Mermaid diagrams, found {mermaid}")

    # Table integrity: every row in a table block must have the same number of
    # unescaped pipes as the header. Fenced code and inline code are skipped.
    lines = text.splitlines()
    in_fence = False
    block: list[str] = []

    def flush() -> None:
        if len(block) >= 2 and all("|" in line for line in block):
            counts = [len(re.findall(r"(?<!\\)\|", line)) for line in block]
            if len(set(counts)) != 1:
                error(f"table near line {start} has inconsistent columns: {sorted(set(counts))}")
        block.clear()

    start = 0
    for i, line in enumerate(lines, 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        if in_fence:
            if block:
                flush()
            continue
        if line.strip().startswith("|"):
            if not block:
                start = i
            block.append(line)
        else:
            if block:
                flush()
    if block:
        flush()


def check_seed() -> None:
    if not SEED.exists():
        error(f"missing content bundle: {SEED}")
        return
    raw = SEED.read_bytes()
    try:
        seed = json.loads(raw)
    except json.JSONDecodeError as exc:
        error(f"seed.json is not valid JSON: {exc}")
        return

    if seed.get("schema_version") != 1:
        error("seed schema_version must be 1")
    version = str(seed.get("content_version", ""))
    if not re.fullmatch(r"\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?", version):
        error(f"content_version is not semver-like: {version!r}")
    if not str(seed.get("app_min_version", "")).strip():
        error("app_min_version is missing")

    sha = seed.get("_sha256")
    expected_bytes = seed.get("_bytes")
    unsigned = {k: v for k, v in seed.items() if k not in {"_sha256", "_bytes"}}
    rebuilt = json.dumps(unsigned, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if sha != hashlib.sha256(rebuilt).hexdigest():
        error("_sha256 does not match the bundle contents (rebuild with tools/build_content.py)")
    if expected_bytes != len(rebuilt):
        error(f"_bytes is {expected_bytes}, expected {len(rebuilt)}")

    parts = seed.get("parts", [])
    if len(parts) != 12:
        error(f"expected 12 parts, found {len(parts)}")
    chapters = [chapter for part in parts for chapter in part.get("chapters", [])]
    if len(chapters) != 61:
        error(f"expected 61 chapters, found {len(chapters)}")
    ids = [chapter.get("id") for chapter in chapters]
    if len(ids) != len(set(ids)):
        error("chapter ids are not unique")
    expected_ids = (
        {"start-how-to-use-this-document", "closing"}
        | {f"ch-{number}" for number in range(1, 52)}
        | {f"app-{letter.lower()}" for letter in "ABCDEFGH"}
    )
    missing_ids = sorted(expected_ids - set(ids))
    unexpected_ids = sorted(set(ids) - expected_ids)
    if missing_ids:
        error(f"missing reading units: {missing_ids}")
    if unexpected_ids:
        error(f"unexpected reading units: {unexpected_ids}")
    for chapter in chapters:
        if not str(chapter.get("title", "")).strip():
            error(f"chapter {chapter.get('id')} has no title")
        if len(str(chapter.get("markdown", "")).split()) < 20:
            error(f"chapter {chapter.get('id')} looks empty")
        for ref in re.findall(r"\[\[diagram:([a-z0-9-]+)\]\]", str(chapter.get("markdown", ""))):
            if ref not in seed.get("diagrams", {}):
                error(f"chapter {chapter.get('id')} references missing diagram {ref}")

    levels = seed.get("levels", [])
    if len(levels) != 10 or [item.get("band") for item in levels] != list(range(10)):
        error("levels must be exactly L0..L9")

    tracks = seed.get("tracks", [])
    if len(tracks) != 9:
        error(f"expected 9 tracks, found {len(tracks)}")
    for track in tracks:
        ladder = track.get("ladder", [])
        # Tracks stop at L8. L9 is the C-suite, defined once in Part V rather
        # than duplicated as a track-specific terminal role.
        if [row.get("band") for row in ladder] != list(range(9)):
            error(f"track {track.get('id')} must cover bands L0-L8")
        for row in ladder:
            if not str(row.get("gate", "")).strip():
                error(f"track {track.get('id')} band {row.get('band')} has no promotion gate")

    comp = seed.get("comp", {})
    if len(comp.get("bands", [])) != 10:
        error("compensation must have exactly 10 bands")
    if len(comp.get("modifiers", [])) < 9:
        error("compensation modifiers must cover all nine tracks")
    for band in comp.get("bands", []):
        total = str(band.get("total", ""))
        if not re.fullmatch(r"[0-9.]+(?:–[0-9.]+)?", total):
            warn(f"comp band {band.get('band')} total looks unusual: {total!r}")

    if len(seed.get("glossary", [])) < 60:
        error("glossary has fewer than 60 terms")
    if len(seed.get("checklists", [])) < 2:
        error("expected at least two checklists")
    if len(seed.get("search", [])) < 100:
        error("search index has fewer than 100 blocks")

    diagrams = seed.get("diagrams", {})
    if len(diagrams) < 6:
        error(f"expected at least 6 diagrams, found {len(diagrams)}")
    for name, svg in diagrams.items():
        if not isinstance(svg, str) or not svg.lstrip().startswith("<svg"):
            error(f"diagram {name} is not an SVG string")
        if "<script" in svg.lower():
            error(f"diagram {name} contains a script tag")

    for part in parts:
        for chapter in part.get("chapters", []):
            if not str(chapter.get("title", "")).strip():
                error(f"chapter {chapter.get('id')} has no title")

    known = set(ids)
    for block in seed.get("search", []):
        if block.get("chapter") not in known:
            error(f"search block points at unknown chapter {block.get('chapter')!r}")

    # Heuristic: absolute pay figures would break the relative-only rule.
    comp_text = json.dumps(comp, ensure_ascii=False)
    for match in re.finditer(r"(?:[$€£¥]\s?\d[\d,.]*|\b\d{3},\d{3}\b)", comp_text):
        warn(f"possible absolute compensation figure in comp: {match.group(0)!r}")

    # Bundled diagram files should match the seed keys.
    on_disk = {path.stem for path in DIAGRAMS.glob("*.svg")}
    if on_disk != set(diagrams):
        warn(f"diagram files on disk ({sorted(on_disk)}) do not match seed ({sorted(diagrams)})")

    print(
        f"seed: v{version}, {len(raw):,} bytes, {len(parts)} parts, "
        f"{len(chapters)} chapters, {len(tracks)} tracks, {len(levels)} levels, "
        f"{len(seed.get('search', []))} search blocks, {len(diagrams)} diagrams"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = parser.parse_args()

    check_document()
    check_seed()

    for message in warnings:
        print(f"WARN  {message}")
    for message in errors:
        print(f"ERROR {message}")

    if errors:
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    if warnings and args.strict:
        print(f"\n{len(warnings)} warning(s) treated as errors (--strict)")
        return 1
    print(f"\nOK: document and bundle pass ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
