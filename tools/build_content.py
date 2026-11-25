"""Build the app's offline content bundle.

Reads quant-org-career-framework.md from the repository root, the generated SVG diagrams and the
structured data parser, then writes src-tauri/resources/seed.json.

The bundle is embedded into the Rust binary with include_str!, so a fresh
install works with no network at all. The same format is used for downloaded
updates, which is why everything (including diagrams) is self-contained.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import framework_data as fd

APP = Path(__file__).resolve().parents[1]
MD = fd.MD_PATH
OUT = APP / "src-tauri" / "resources" / "seed.json"
DIAGRAMS = APP / "src-tauri" / "resources" / "diagrams"
CONTENT_VERSION = "1.0.0"
APP_MIN_VERSION = "0.1.0"

DIAGRAM_ORDER = [
    ("org-current", "Current state · <100 people"),
    ("org-scaleup", "Scale-up · 100–250 people"),
    ("org-multi", "Multi-pod / multi-office · 250–500 people"),
    ("desk", "A trading desk · 2–5 pods"),
    ("research-pod", "A research pod"),
    ("platform", "Platform architecture"),
]

# Sections that are navigation rather than content. The app has its own nav.
SKIP_CHAPTERS = {"start-table-of-contents"}


def strip_markdown(text: str) -> str:
    """Reduce markdown to plain text for the search index."""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"\[\[diagram:[a-z0-9-]+\]\]", " ", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.M)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.M)
    text = re.sub(r"^\s*>\s?", "", text, flags=re.M)
    text = re.sub(r"\|", " ", text)
    text = re.sub(r"^-{3,}\s*$", " ", text, flags=re.M)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def replace_mermaid(markdown: str, counter: list[int]) -> str:
    def repl(match: re.Match[str]) -> str:
        idx = counter[0]
        counter[0] += 1
        if idx >= len(DIAGRAM_ORDER):
            return "```\n" + match.group(1) + "```"
        name, caption = DIAGRAM_ORDER[idx]
        return f"\n[[diagram:{name}]]\n\n*{caption}.*\n"

    return re.sub(r"```mermaid\n(.*?)```", repl, markdown, flags=re.S)


def chapter_anchors(markdown: str) -> list[dict]:
    """Split a chapter into searchable blocks at h3 boundaries."""
    blocks: list[dict] = []
    current_heading = ""
    buf: list[str] = []

    def flush() -> None:
        body = strip_markdown("\n".join(buf))
        if len(body) < 40:
            return
        # split very long blocks so results stay readable
        size = 1400
        if len(body) <= size:
            blocks.append({"heading": current_heading, "text": body})
            return
        sentences = re.split(r"(?<=[.!?])\s+", body)
        chunk = ""
        for sentence in sentences:
            if len(chunk) + len(sentence) + 1 > size and chunk:
                blocks.append({"heading": current_heading, "text": chunk.strip()})
                chunk = ""
            chunk += sentence + " "
        if chunk.strip():
            blocks.append({"heading": current_heading, "text": chunk.strip()})

    for line in markdown.splitlines():
        if line.startswith("### "):
            flush()
            buf = []
            current_heading = line[4:].strip()
            continue
        buf.append(line)
    flush()
    return blocks


def build() -> dict:
    text = MD.read_text(encoding="utf-8")
    data = fd.parse_all()

    counter = [0]
    parts_out: list[dict] = []
    search: list[dict] = []
    chapter_count = 0
    words = 0

    for part in data["document"]["parts"]:
        chapters_out = []
        for chapter in part["chapters"]:
            if chapter["id"] in SKIP_CHAPTERS:
                continue
            markdown = replace_mermaid(chapter["markdown"], counter)
            words += len(strip_markdown(markdown).split())
            chapter_count += 1
            chapters_out.append(
                {
                    "id": chapter["id"],
                    "number": chapter["number"],
                    "title": chapter["title"],
                    "markdown": markdown,
                }
            )
            for block in chapter_anchors(markdown):
                search.append(
                    {
                        "chapter": chapter["id"],
                        "part": part["id"],
                        "title": chapter["title"],
                        "heading": block["heading"],
                        "text": block["text"],
                    }
                )
        parts_out.append(
            {
                "id": part["id"],
                "title": part["title"],
                "roman": part["roman"],
                "intro": part["intro"],
                "chapters": chapters_out,
            }
        )

    diagrams: dict[str, str] = {}
    for name, _caption in DIAGRAM_ORDER:
        path = DIAGRAMS / f"{name}.svg"
        if path.exists():
            diagrams[name] = path.read_text(encoding="utf-8")

    # A compact home screen payload: what the app shows before you navigate.
    home = {
        "eyebrow": "The Quant Firm Operating System",
        "title": "Nine tracks. Ten bands. One firm.",
        "lede": (
            "An operating manual for how an algorithmic trading firm is structured, "
            "how people grow, and how decisions get made — for a <100-person firm, "
            "with explicit scaling paths to 500."
        ),
        "facts": [
            {"label": "Bands", "value": "L0–L9", "note": "Intern to CEO"},
            {"label": "Tracks", "value": str(len(data["tracks"])), "note": "Every function except HR"},
            {"label": "Chapters", "value": str(chapter_count), "note": "Parts I–X + appendices"},
            {"label": "Comp model", "value": "Relative", "note": "No absolute salaries"},
        ],
        "rules": [
            "Levels describe scope, decision rights and impact horizon — not tenure.",
            "Titles are local; bands are universal. Translate, don't import.",
            "The map is not the territory. Adapt it to your strategy and market.",
        ],
    }

    seed = {
        "schema_version": 1,
        "content_version": CONTENT_VERSION,
        "app_min_version": APP_MIN_VERSION,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "title": data["title"],
        "subtitle": "Organization Design, Leveling & Career Journeys for an Algorithmic Trading Business",
        "edition": "Version 1.0 · November 2026",
        "home": home,
        "stats": {
            "words": words,
            "chapters": chapter_count,
            "parts": len(parts_out),
            "levels": len(data["levels"]),
            "tracks": len(data["tracks"]),
            "glossary": len(data["glossary"]),
        },
        "parts": parts_out,
        "levels": data["levels"],
        "tracks": data["tracks"],
        "comp": data["comp"],
        "translation": data["translation"],
        "glossary": data["glossary"],
        "checklists": data["checklists"],
        "kpis": data["kpis"],
        "diagrams": diagrams,
        "search": search,
    }

    raw = json.dumps(seed, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    seed["_sha256"] = hashlib.sha256(raw).hexdigest()
    seed["_bytes"] = len(raw)
    return seed


def main() -> None:
    seed = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Write LF on every platform. Path.write_text() translates newlines on
    # Windows, which changes the byte size and breaks the update manifest hash
    # relative to the LF-normalised file stored in git.
    with OUT.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(seed, ensure_ascii=False, indent=1))
    size = OUT.stat().st_size
    print("wrote", OUT)
    print("content_version", seed["content_version"])
    print("bytes", size, "sha256", seed["_sha256"])
    print("chapters", seed["stats"]["chapters"], "search blocks", len(seed["search"]), "words", seed["stats"]["words"])
    print("diagrams", sorted(seed["diagrams"]))


if __name__ == "__main__":
    main()
