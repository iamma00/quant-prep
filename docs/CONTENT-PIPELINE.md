# Content pipeline

Everything the reader sees is generated from one Markdown document plus a small
Python parser. This keeps the document, the app, the workbook and the printable
map from drifting apart.

```text
quant-org-career-framework.md
        │
        ├── tools/framework_data.py ──► structured levels/tracks/comp/glossary
        │
        ├── tools/build_content.py ──► src-tauri/resources/seed.json
        │        │                         (embedded in the Rust binary)
        │        └── tools/make_manifest.py ──► updates/manifest.json
        │
        ├── tools/make_excel.py ──────► quant-org-leveling-matrix.xlsx
        ├── tools/make_career_map.py ─► career-map.html / .pdf / .png
        └── tools/make_diagrams.py ───► src-tauri/resources/diagrams/*.svg
```

## Source document

`quant-org-career-framework.md` is the canonical text. It is deliberately
structured for both humans and machines:

- A start-here section, then Parts I–X, then Appendices A–H.
- Numbered sections `## 1. ...` through `## 51. ...` (the parser keys on the
  number and heading).
- Stable subheadings inside each section (mission, scope, KPIs, gates).
- Markdown tables for levels, tracks, compensation and title translation.
- `[[diagram:name]]` lines where a generated SVG belongs.
- Mermaid fences in the document are rendered to static SVG for the app, so no
  diagram runtime is shipped.

The original "Core Domains & Job Titles" and "Typical Ranks & Career
Progression" text is preserved verbatim in Appendix H and expanded in the
earlier parts. Do not replace it.

### Adding or editing a section

1. Keep the heading level and numbering consistent. If you insert a section,
   renumber subsequent sections and update cross-references.
2. Use the existing tables as templates. Header rows are significant; the
   parser expects the same column names for levels, tracks and comp.
3. Put a blank line before and after tables, code fences and diagrams.
4. If you add a diagram, add it to `DIAGRAM_ORDER` in `tools/build_content.py`
   and to `tools/make_diagrams.py`; otherwise the reference is reported by the
   verifier.
5. Rebuild and verify:

   ```bash
   python tools/build_content.py
   python tools/verify_content.py
   ```

## Parser

`tools/framework_data.py` extracts:

| Structure | Count | Used by |
| --- | --- | --- |
| Levels L0–L9 | 10 | app level explorer, workbook, map |
| Tracks | 9 | app track explorer, workbook |
| Compensation bands | 10 | app comp builder, workbook |
| Glossary terms | 67 | app glossary, workbook |
| Checklists | 2 | app checklists |
| Document parts/chapters | 12 / 61 | app reader, search |

The parser is intentionally conservative: it fails loudly when a heading or
table it depends on disappears. That is better than silently shipping a bundle
with nine levels.

## Bundle format (`seed.json`)

Top-level keys:

| Key | Meaning |
| --- | --- |
| `schema_version` | Bundle format version. Currently `1`; the app rejects anything else. |
| `content_version` | Semantic version of the edition, compared with the manifest. |
| `app_min_version` | Minimum app version that may install this bundle. |
| `generated_at`, `edition` | Human-readable provenance. |
| `title`, `subtitle`, `home`, `stats` | Shell and home view metadata. |
| `parts[]` | Reading structure. Each part has `id`, `title`, `chapters[]`. |
| `parts[].chapters[]` | `id`, `title`, `markdown`, `part`, optional `number`. |
| `levels[]` | Ten band records: `band`, `code`, `title`, `mission`, `scope`, `owns`, `people`, `horizon`, `autonomy`, `deliverables`, `decisions`, `good`, `promotion`, `comp_shape`, `detail_title`, `titles`. |
| `tracks[]` | Nine tracks with `entry_points`, `columns`, a ten-row `ladder`, `branches`, `lateral`, `failure_modes`, `promotion_evidence`, `narrative[]`. |
| `comp` | `bands[]`, `columns`, `modifiers[]`, `modifier_columns`, `formula`, `principles`. |
| `translation` | `columns` and `rows` translating each band to HFT, multi-strat, bank, big-tech and crypto titles. |
| `glossary[]` | `term`, `meaning`. |
| `checklists[]` | `title`, `items[]`. |
| `kpis` | Table used by the workbook and home stats. |
| `diagrams` | Name → sanitised SVG string. |
| `search[]` | Pre-computed search blocks: `chapter`, `part`, `title`, `heading`, `text`. |
| `_sha256`, `_bytes` | Hash and byte size of the bundle without these two fields. |

The app validates structure again at install time: schema, version format,
maximum counts, unique chapter IDs, required strings, diagram size and SVG
prefix, and the app minimum version. A malformed bundle never reaches the UI.

## Search index

`build_content.py` strips Markdown syntax and splits each chapter into blocks at
headings. Each block keeps a chapter id so a result can deep-link to
`#/read/<id>`. The index is built in memory at boot; it is not persisted.

Ranking is local and deterministic: title matches outweigh heading matches,
heading matches outweigh body matches, and repeated terms are capped. There is
no fuzzy library and no network call.

## Diagrams

`tools/make_diagrams.py` draws six SVGs with plain Python string templates:

| Name | Used in |
| --- | --- |
| `org-current` | Org charts: current state, <100 people |
| `org-scaleup` | 100–250 people |
| `org-multi` | 250–500 people |
| `desk` | A trading desk |
| `research-pod` | A research pod |
| `platform` | Platform architecture |

The SVGs use CSS variables (`--diagram-ink`, `--diagram-teal`, …) with
fallbacks, so they adapt to the app theme. The reader sanitises the SVG before
inserting it, and the org view renders the same strings with pan/zoom.

## Excel workbook

`tools/make_excel.py` builds twelve sheets with formulas rather than hard-coded
results:

1. Start
2. Levels
3. Tracks
4. Track Summary
5. Comp Bands
6. Comp Builder
7. Calibration
8. Org Plan
9. Promotion
10. KPIs
11. Title Map
12. Glossary

Change the source document or parser, rerun `python tools/make_excel.py`, and
the workbook follows. Formula cells are intentionally left as formulas so a
firm can adjust multipliers and see the result.

## Career map

`tools/make_career_map.py` renders a one-page HTML view and exports PDF and PNG
with the same content: the ladder, the nine tracks, the IC/management fork and
the key decision points. It is designed for A3/ledger printing and for embedding
in a hiring pack.

## Manifest

`tools/make_manifest.py` reads the built seed, computes SHA-256 and size, and
writes `updates/manifest.json`:

```bash
python tools/make_manifest.py --notes "Added treasury ladder; fixed typos"
```

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--version` | seed's `content_version` | Override the published version. |
| `--bundle-url` | GitHub raw URL for `main` | Where the bundle will live. |
| `--notes` | generated summary | Release notes shown in the app. |
| `--published-at` | now (UTC) | ISO-8601 timestamp. |
| `--out` | `updates/manifest.json` | Output path. |

The script refuses to publish if the seed is missing, larger than the app's
limit, contains CR characters, or lacks a valid content version.

The seed is written **LF-only** on every platform. This matters: the manifest
hashes the exact bytes of `seed.json`, while git normalises the file to LF. A
CRLF copy would have a different hash and every update check would fail. Both
the verifier and the manifest generator reject CR bytes, so a Windows editor
cannot silently reintroduce them.

## Verification

`tools/verify_content.py` checks both the document and the generated bundle:

- 51 numbered sections, appendices A–H, no `<!-- CONTINUE -->` markers.
- Balanced code fences and no table column mismatches.
- Unique chapter ids; every search block points at a real chapter.
- Ten levels, nine tracks with ten ladder rows, ten comp bands, non-empty
  glossary and checklists.
- Every `[[diagram:...]]` reference exists in `seed.json` and starts with
  `<svg`.
- `_sha256`/`_bytes` match the bundle content (excluding those fields).
- No absolute salary patterns in compensation text (a heuristic warning).

Run it in CI and before every release.

## Generated files: do not edit by hand

- `src-tauri/resources/seed.json`
- `src-tauri/resources/diagrams/*.svg`
- `quant-org-leveling-matrix.xlsx`
- `career-map.html`, `quant-org-career-map.pdf`, `quant-org-career-map.png`
- `updates/manifest.json` (regenerate; do not hand-edit the hash)

The Markdown document, the Python tools, the Rust sources and the frontend are
the editable sources.
