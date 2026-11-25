"""Parse the canonical framework markdown into structured data.

Single source of truth: quant-org-career-framework.md at the repository root.
A copy one directory above is accepted for the original workspace layout.
Used by make_excel.py, make_career_map.py and build_content.py.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

APP = Path(__file__).resolve().parents[1]
LOCAL_MD = APP / "quant-org-career-framework.md"
WORKSPACE_MD = APP.parent / "quant-org-career-framework.md"
MD_PATH = LOCAL_MD if LOCAL_MD.exists() else WORKSPACE_MD

LEVEL_KEYS = [
    ("mission", "Mission"),
    ("scope", "Scope"),
    ("autonomy", "Autonomy"),
    ("horizon", "Impact horizon"),
    ("deliverables", "Deliverables"),
    ("decisions", "Decision rights"),
    ("people", "People"),
    ("promotion", "Promotion signal"),
    ("titles", "Common titles"),
    ("good", 'What "good" looks like'),
]


def read_md() -> str:
    return MD_PATH.read_text(encoding="utf-8")


def slugify(value: str) -> str:
    value = value.lower()
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def strip_md(value: str) -> str:
    value = re.sub(r"\*\*(.+?)\*\*", r"\1", value)
    value = re.sub(r"\*(.+?)\*", r"\1", value)
    value = re.sub(r"`(.+?)`", r"\1", value)
    return value.strip()


def parse_table(lines: list[str], start: int) -> tuple[list[str], list[list[str]], int]:
    """Parse a GitHub pipe table starting at lines[start]. Returns headers, rows, end index."""
    header_line = lines[start].strip()
    headers = [c.strip() for c in header_line.strip("|").split("|")]
    rows: list[list[str]] = []
    i = start + 2  # skip separator
    while i < len(lines) and lines[i].strip().startswith("|"):
        cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
        if len(cells) == len(headers):
            rows.append(cells)
        i += 1
    return headers, rows, i


def find_table(lines: list[str], needle: str, start: int = 0) -> tuple[list[str], list[list[str]], int] | None:
    for i in range(start, len(lines)):
        if needle in lines[i] and lines[i].strip().startswith("|"):
            return parse_table(lines, i)
    return None


def parse_levels(text: str) -> list[dict[str, Any]]:
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("## 11."))
    table = find_table(lines, "| Band | Firm-facing title", start)
    if not table:
        raise RuntimeError("level table not found")
    _, rows, _ = table
    levels: list[dict[str, Any]] = []
    for row in rows:
        band = int(re.search(r"L(\d+)", row[0]).group(1))
        levels.append(
            {
                "band": band,
                "code": f"L{band}",
                "title": strip_md(row[1]),
                "owns": strip_md(row[2]),
                "autonomy": strip_md(row[3]),
                "horizon": strip_md(row[4]),
                "people": strip_md(row[5]),
                "comp_shape": strip_md(row[6]),
            }
        )

    # Detail sections in section 12
    start = next(i for i, l in enumerate(lines) if l.startswith("## 12."))
    end = next(i for i, l in enumerate(lines) if l.startswith("## 13."))
    detail_text = "\n".join(lines[start:end])
    chunks = re.split(r"^### (L\d) — (.+)$", detail_text, flags=re.M)
    details: dict[int, dict[str, Any]] = {}
    for i in range(1, len(chunks), 3):
        code = chunks[i]
        title = chunks[i + 1].strip()
        body = chunks[i + 2]
        entry: dict[str, Any] = {"detail_title": title}
        mission = re.search(r"\*\*Mission:\*\*\s*(.+)", body)
        if mission:
            entry["mission"] = strip_md(mission.group(1))
        for key, label in LEVEL_KEYS:
            if key == "mission":
                continue
            m = re.search(rf"- \*\*{re.escape(label)}:\*\*\s*(.+)", body)
            if m:
                entry[key] = strip_md(m.group(1))
        # multi-line bullets (continuation lines)
        for key, label in LEVEL_KEYS:
            if key in entry:
                continue
            m = re.search(rf"- \*\*{re.escape(label)}:\*\*\s*(.+(?:\n(?!- \*\*|\n).+)*)", body)
            if m:
                entry[key] = strip_md(" ".join(x.strip() for x in m.group(1).splitlines()))
        details[int(code[1:])] = entry

    for level in levels:
        level.update(details.get(level["band"], {}))
    return levels


def parse_tracks(text: str) -> list[dict[str, Any]]:
    part_start = text.index("# PART IV")
    part_end = text.index("# PART V")
    part = text[part_start:part_end]
    chunks = re.split(r"^## (\d+)\. (.+)$", part, flags=re.M)
    tracks: list[dict[str, Any]] = []
    for i in range(1, len(chunks), 3):
        number = int(chunks[i])
        title = chunks[i + 1].strip()
        body = chunks[i + 2]
        lines = body.splitlines()
        entry: dict[str, Any] = {
            "id": slugify(re.sub(r"\s*\(.*?\)\s*", "", title)).replace("-track", ""),
            "number": number,
            "title": title,
        }
        aliases = {
            "data-and-ml-engineering": "data-ml",
            "risk-and-model-validation": "risk",
            "compliance-and-legal": "compliance-legal",
            "finance-and-treasury": "finance",
            "product-and-business": "product-business",
        }
        entry["id"] = aliases.get(entry["id"], entry["id"])
        m = re.search(r"\*\*Entry points:\*\*\s*(.+)", body)
        if m:
            entry["entry_points"] = strip_md(m.group(1))

        table = find_table(lines, "| Band | Title | Mission")
        if table:
            headers, rows, _ = table
            entry["columns"] = [strip_md(h) for h in headers]
            entry["ladder"] = []
            for row in rows:
                band_m = re.search(r"L(\d+)", row[0])
                entry["ladder"].append(
                    {
                        "band": int(band_m.group(1)) if band_m else None,
                        "title": strip_md(row[1]),
                        "mission": strip_md(row[2]),
                        "scope": strip_md(row[3]),
                        "kpis": strip_md(row[4]),
                        "gate": strip_md(row[5]),
                    }
                )

        # labelled paragraphs
        for key, label in [
            ("branches", "Branches"),
            ("lateral", "Lateral moves"),
            ("failure_modes", "Failure modes"),
        ]:
            m = re.search(rf"\*\*{label}:\*\*\s*(.+)", body)
            if m:
                entry[key] = strip_md(m.group(1))
        m = re.search(r"\*\*Promotion evidence[^:]*:\*\*\s*(.+)", body)
        if m:
            entry["promotion_evidence"] = strip_md(m.group(1))

        # journey narrative bullets
        narrative: list[dict[str, str]] = []
        m = re.search(r"\*\*Journey narrative\.\*\*\s*\n((?:.|\n)*?)(?=\n\*\*|\n## |\Z)", body)
        if m:
            for line in m.group(1).splitlines():
                bm = re.match(r"- \*\*(.+?):\*\*\s*(.+)", line.strip())
                if bm:
                    narrative.append({"phase": strip_md(bm.group(1)), "text": strip_md(bm.group(2))})
        entry["narrative"] = narrative

        # optional model-validation sub-track
        sub = re.search(r"\*\*Model Validation sub-track\*\*.*?\n\n((?:\|.*\n)+)", body)
        if sub:
            sub_lines = sub.group(1).strip().splitlines()
            if len(sub_lines) >= 2:
                headers, rows, _ = parse_table(sub_lines, 0)
                entry["subtracks"] = {
                    "title": "Model Validation sub-track",
                    "columns": [strip_md(h) for h in headers],
                    "rows": [[strip_md(c) for c in r] for r in rows],
                }
        tracks.append(entry)
    return tracks


def parse_comp(text: str) -> dict[str, Any]:
    lines = text.splitlines()
    comp: dict[str, Any] = {}
    start = next(i for i, l in enumerate(lines) if l.startswith("## 38."))
    end = next(i for i, l in enumerate(lines) if l.startswith("## 39."))
    section = "\n".join(lines[start:end])
    sub = section.splitlines()

    t = find_table(sub, "| Band | Base index |")
    if t:
        headers, rows, _ = t
        comp["bands"] = []
        for row in rows:
            comp["bands"].append(
                {
                    "band": int(re.search(r"L(\d+)", row[0]).group(1)),
                    "base": strip_md(row[1]),
                    "bonus": strip_md(row[2]),
                    "lti": strip_md(row[3]),
                    "total": strip_md(row[4]),
                }
            )
        comp["columns"] = [strip_md(h) for h in headers]

    t = find_table(sub, "| Track | Base vs firm median |")
    if t:
        headers, rows, _ = t
        comp["modifiers"] = []
        for row in rows:
            comp["modifiers"].append(
                {
                    "track": strip_md(row[0]),
                    "base": strip_md(row[1]),
                    "variable": strip_md(row[2]),
                    "notes": strip_md(row[3]),
                }
            )
        comp["modifier_columns"] = [strip_md(h) for h in headers]

    m = re.search(r"```\n(Desk bonus pool.*?)```", section, re.S)
    if m:
        comp["formula"] = m.group(1).strip()

    comp["principles"] = [
        strip_md(line[2:])
        for line in section.splitlines()
        if re.match(r"^\d+\. \*\*", line)
    ]
    return comp


def parse_translation(text: str) -> dict[str, Any]:
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("## 13."))
    table = find_table(lines, "| Band | HFT / prop firm", start)
    if not table:
        return {"columns": [], "rows": []}
    headers, rows, _ = table
    return {
        "columns": [strip_md(h) for h in headers],
        "rows": [[strip_md(c) for c in r] for r in rows],
    }


def parse_glossary(text: str) -> list[dict[str, str]]:
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("## Appendix B"))
    table = find_table(lines, "| Term | Meaning |", start)
    if not table:
        return []
    _, rows, _ = table
    return [{"term": strip_md(r[0]), "meaning": strip_md(r[1])} for r in rows]


def parse_checklists(text: str) -> list[dict[str, Any]]:
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("## Appendix A"))
    end = next(i for i, l in enumerate(lines) if l.startswith("## Appendix B"))
    section = lines[start:end]
    lists: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in section:
        b = re.match(r"\*\*(.+checklist)\*\*", line.strip(), re.I)
        if b:
            current = {"title": strip_md(b.group(1)).rstrip(":"), "items": []}
            lists.append(current)
            continue
        item = re.match(r"- \[ \]\s*(.+)", line.strip())
        if item and current is not None:
            current["items"].append(strip_md(item.group(1)))
    return lists


def parse_kpis(text: str) -> dict[str, Any]:
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("## Appendix F"))
    table = find_table(lines, "| KPI | Definition", start)
    if not table:
        return {"columns": [], "rows": []}
    headers, rows, _ = table
    return {
        "columns": [strip_md(h) for h in headers],
        "rows": [[strip_md(c) for c in r] for r in rows],
    }


def parse_parts(text: str) -> dict[str, Any]:
    """Split the document into parts and chapters for the reader."""
    lines = text.splitlines()
    h1 = [(i, l) for i, l in enumerate(lines) if re.match(r"^# (PART |APPENDICES)", l)]
    if not h1:
        raise RuntimeError("no parts found")

    front = lines[: h1[0][0]]
    parts: list[dict[str, Any]] = []

    def split_chapters(block: list[str]) -> tuple[str, list[dict[str, Any]]]:
        idx = [i for i, l in enumerate(block) if l.startswith("## ")]
        if not idx:
            return "\n".join(block).strip(), []
        intro = "\n".join(block[: idx[0]]).strip()
        chapters = []
        for n, i in enumerate(idx):
            j = idx[n + 1] if n + 1 < len(idx) else len(block)
            chunk = "\n".join(block[i:j]).strip()
            heading = block[i][3:].strip()
            num = re.match(r"(\d+)\.\s+(.+)", heading)
            app = re.match(r"Appendix ([A-H])\s+—\s+(.+)", heading)
            closing = heading.lower().startswith("closing")
            if num:
                cid = f"ch-{num.group(1)}"
                ctitle = num.group(2).strip()
                cnum = num.group(1)
            elif app:
                cid = f"app-{app.group(1).lower()}"
                ctitle = f"Appendix {app.group(1)} — {app.group(2).strip()}"
                cnum = f"Appendix {app.group(1)}"
            elif closing:
                cid = "closing"
                ctitle = "Closing note"
                cnum = ""
            else:
                cid = "start-" + slugify(heading)
                ctitle = heading
                cnum = ""
            chapters.append({"id": cid, "number": cnum, "title": ctitle, "markdown": chunk})
        return intro, chapters

    # front matter
    intro, chapters = split_chapters(front)
    # drop the generated TOC chapter (the app has its own navigation)
    chapters = [c for c in chapters if c["id"] != "start-table-of-contents"]
    parts.append(
        {
            "id": "start",
            "title": "Start here",
            "roman": "",
            "intro": intro,
            "chapters": chapters,
        }
    )

    for n, (i, line) in enumerate(h1):
        j = h1[n + 1][0] if n + 1 < len(h1) else len(lines)
        title = line[2:].strip()
        pid = "appendices" if title == "APPENDICES" else "part-" + slugify(title.split("—")[0].replace("PART", ""))
        intro, chapters = split_chapters(lines[i + 1 : j])
        parts.append(
            {
                "id": pid,
                "title": title,
                "roman": title.replace("PART ", "").split("—")[0].strip() if title.startswith("PART") else "",
                "intro": intro,
                "chapters": chapters,
            }
        )
    return {"parts": parts}


def parse_all() -> dict[str, Any]:
    text = read_md()
    return {
        "title": text.splitlines()[0].lstrip("# ").strip(),
        "levels": parse_levels(text),
        "tracks": parse_tracks(text),
        "comp": parse_comp(text),
        "translation": parse_translation(text),
        "glossary": parse_glossary(text),
        "checklists": parse_checklists(text),
        "kpis": parse_kpis(text),
        "document": parse_parts(text),
    }


if __name__ == "__main__":
    data = parse_all()
    out = APP / "tools" / "_parsed.json"
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print("levels:", len(data["levels"]))
    print("tracks:", len(data["tracks"]), [t["id"] for t in data["tracks"]])
    print("comp bands:", len(data["comp"].get("bands", [])))
    print("glossary:", len(data["glossary"]))
    print("checklists:", [(c["title"], len(c["items"])) for c in data["checklists"]])
    print("parts:", len(data["document"]["parts"]))
    for p in data["document"]["parts"]:
        print(" ", p["id"], len(p["chapters"]), p["title"][:50])
    print("wrote", out)
