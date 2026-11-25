"""Generate the editable Excel leveling matrix from the canonical framework."""
from __future__ import annotations

import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

import framework_data as fd

APP = Path(__file__).resolve().parents[1]
OUT = APP / "quant-org-leveling-matrix.xlsx"

INK = "0F2E2E"
TEAL = "0E6B63"
TEAL_LIGHT = "D9EFEC"
SAND = "F6F3EC"
AMBER = "B7791F"
RED = "B42318"
GREEN = "067647"
GREY = "667085"
WHITE = "FFFFFF"

thin = Side(style="thin", color="D0D5DD")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
HDR_FILL = PatternFill("solid", fgColor=TEAL)
HDR_FONT = Font(name="Segoe UI", bold=True, color=WHITE, size=10)
BODY_FONT = Font(name="Segoe UI", size=10, color="1D2939")
TITLE_FONT = Font(name="Segoe UI Semibold", size=20, color=INK)
SUB_FONT = Font(name="Segoe UI", size=11, color=GREY)
BAND_FONT = Font(name="Segoe UI Semibold", size=10, color=TEAL)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)


def parse_range(text: str, pct: bool = False) -> tuple[float, float, str]:
    """Parse '1.25–1.45', '20–40%', '0.35–0.45 (stipend)' into (low, high, note)."""
    if not text or text.strip() in {"—", "-", "–"}:
        return 0.0, 0.0, ""
    note = ""
    m = re.search(r"\((.+?)\)", text)
    if m:
        note = m.group(1)
    raw = re.sub(r"\(.+?\)", "", text)
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", raw)]
    if not nums:
        return 0.0, 0.0, note
    if len(nums) == 1:
        return nums[0], nums[0], note
    return nums[0], nums[1], note


def style_header(ws, row: int, ncols: int) -> None:
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = CENTER
        cell.border = BORDER
    ws.row_dimensions[row].height = 30


def style_body(ws, first_row: int, last_row: int, ncols: int, zebra: bool = True) -> None:
    for r in range(first_row, last_row + 1):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = BODY_FONT
            cell.border = BORDER
            cell.alignment = WRAP
            if zebra and (r - first_row) % 2 == 1:
                cell.fill = PatternFill("solid", fgColor="FAFAF9")


def set_widths(ws, widths: list[int]) -> None:
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def title_block(ws, title: str, subtitle: str, ncols: int) -> None:
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    ws.cell(row=1, column=1, value=title).font = TITLE_FONT
    ws.cell(row=1, column=1).alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 34
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
    ws.cell(row=2, column=1, value=subtitle).font = SUB_FONT
    ws.row_dimensions[2].height = 20


def sheet_start(wb: Workbook) -> None:
    ws = wb.active
    ws.title = "Start"
    ws.sheet_properties.tabColor = TEAL
    ws.sheet_view.showGridLines = False
    set_widths(ws, [3, 28, 92, 3])

    ws["B2"] = "THE QUANT FIRM OPERATING SYSTEM"
    ws["B2"].font = Font(name="Segoe UI Semibold", size=24, color=INK)
    ws["B3"] = "Editable leveling, career and compensation matrix · v1.0 · November 2026"
    ws["B3"].font = Font(name="Segoe UI", size=11, color=GREY)

    ws["B5"] = "What this workbook is"
    ws["B5"].font = Font(name="Segoe UI Semibold", size=13, color=TEAL)
    body = (
        "A working companion to quant-org-career-framework.md. Every sheet is editable. "
        "Compensation is expressed as relative indices (L1 = 1.00) — never absolute salaries. "
        "Use the Calibration sheet to anchor the structure to your market, then the Comp Builder to model offers."
    )
    ws["B6"] = body
    ws["B6"].font = Font(name="Segoe UI", size=10, color="344054")
    ws["B6"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("B6:C8")

    ws["B10"] = "Sheet guide"
    ws["B10"].font = Font(name="Segoe UI Semibold", size=13, color=TEAL)
    guide = [
        ("Levels", "The ten bands: scope, autonomy, decision rights, promotion signals."),
        ("Tracks", "All 9 career tracks × L0–L9: mission, scope, KPIs, promotion gate."),
        ("Track Summary", "Entry points, branches, lateral moves, failure modes per track."),
        ("Comp Bands", "Base, bonus and LTI ranges with live formulas."),
        ("Comp Builder", "Model a package by band, track and performance percentile."),
        ("Calibration", "A 60-minute workshop to anchor the indices to your market."),
        ("Org Plan", "Headcount model for 50 / 100 / 250 / 500 people."),
        ("Promotion", "Evidence-based promotion packet and weighted scorecard."),
        ("KPIs", "Metric dictionary by owner and cadence."),
        ("Title Map", "Translate bands to HFT, multi-strat, bank and big-tech titles."),
        ("Glossary", "67 terms used across the framework."),
    ]
    r = 11
    for name, desc in guide:
        ws.cell(row=r, column=2, value=name).font = Font(name="Segoe UI Semibold", size=10, color=INK)
        ws.cell(row=r, column=3, value=desc).font = Font(name="Segoe UI", size=10, color="344054")
        ws.cell(row=r, column=2).border = BORDER
        ws.cell(row=r, column=3).border = BORDER
        ws.cell(row=r, column=2).fill = PatternFill("solid", fgColor=SAND)
        r += 1

    ws["B24"] = "Three rules"
    ws["B24"].font = Font(name="Segoe UI Semibold", size=13, color=TEAL)
    rules = [
        "1. Bands describe scope and decision rights, not tenure. If the job is the same, it is a pay conversation, not a promotion.",
        "2. The index is a structure, not a salary survey. Anchor L1 locally; keep the ratios between bands.",
        "3. HR roles are out of scope. Promotion calibration, comp philosophy and performance reviews remain manager/CEO duties.",
    ]
    r = 25
    for rule in rules:
        ws.cell(row=r, column=2, value=rule).font = Font(name="Segoe UI", size=10, color="344054")
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        ws.cell(row=r, column=2).alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 30
        r += 1

    ws["B30"] = "Source"
    ws["B30"].font = Font(name="Segoe UI Semibold", size=13, color=TEAL)
    ws["B31"] = "quant-org-career-framework.md · generated by tools/make_excel.py · no absolute compensation figures"
    ws["B31"].font = Font(name="Segoe UI", size=9, color=GREY)

    ws.sheet_view.showGridLines = False


def sheet_levels(wb: Workbook, data: dict) -> None:
    ws = wb.create_sheet("Levels")
    ws.sheet_properties.tabColor = "0E6B63"
    headers = [
        "Band", "Code", "Firm-facing title", "Owns", "Autonomy", "Horizon",
        "People", "Comp shape", "Mission", "Scope", "Decision rights",
        "Promotion signal", "Common titles", "Typical time in level",
    ]
    title_block(ws, "The ten bands", "One ladder for every track. Scope × autonomy × horizon × decision rights.", len(headers))
    for c, h in enumerate(headers, 1):
        ws.cell(row=4, column=c, value=h)
    style_header(ws, 4, len(headers))

    time_in_level = {
        0: "10–12 weeks", 1: "18–30 months", 2: "24–36 months", 3: "30–48 months",
        4: "3–5 years", 5: "3–5 years", 6: "3–5 years", 7: "3–5 years",
        8: "5+ years", 9: "Board cycle",
    }
    for r, lv in enumerate(data["levels"], start=5):
        values = [
            lv["band"], lv["code"], lv["title"], lv["owns"], lv["autonomy"], lv["horizon"],
            lv["people"], lv["comp_shape"], lv.get("mission", ""), lv.get("scope", ""),
            lv.get("decisions", ""), lv.get("promotion", ""), lv.get("titles", ""),
            time_in_level.get(lv["band"], ""),
        ]
        for c, v in enumerate(values, 1):
            ws.cell(row=r, column=c, value=v)
    style_body(ws, 5, 14, len(headers))
    for r in range(5, 15):
        ws.cell(row=r, column=1).font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
        ws.cell(row=r, column=1).alignment = CENTER
        ws.cell(row=r, column=2).font = BAND_FONT
        ws.cell(row=r, column=2).alignment = CENTER
        ws.row_dimensions[r].height = 92

    set_widths(ws, [7, 7, 24, 22, 30, 16, 24, 18, 34, 34, 34, 38, 30, 14])
    ws.freeze_panes = "D5"
    ws.auto_filter.ref = f"A4:N14"
    ws.sheet_view.showGridLines = False


def sheet_tracks(wb: Workbook, data: dict) -> None:
    ws = wb.create_sheet("Tracks")
    ws.sheet_properties.tabColor = "1D7A8C"
    headers = ["Track", "Band", "Title", "Mission", "Scope", "Primary KPIs", "Promotion gate"]
    title_block(ws, "Career journeys by track", "81 level entries across 9 tracks. Filter by track or band.", len(headers))
    for c, h in enumerate(headers, 1):
        ws.cell(row=4, column=c, value=h)
    style_header(ws, 4, len(headers))

    r = 5
    for track in data["tracks"]:
        for step in track["ladder"]:
            values = [track["title"].split(" (")[0], f"L{step['band']}", step["title"], step["mission"], step["scope"], step["kpis"], step["gate"]]
            for c, v in enumerate(values, 1):
                ws.cell(row=r, column=c, value=v)
            r += 1
    style_body(ws, 5, r - 1, len(headers))
    for rr in range(5, r):
        ws.cell(row=rr, column=2).alignment = CENTER
        ws.cell(row=rr, column=2).font = BAND_FONT
        ws.row_dimensions[rr].height = 44

    set_widths(ws, [30, 7, 30, 34, 38, 40, 40])
    ws.freeze_panes = "C5"
    ws.auto_filter.ref = f"A4:G{r-1}"
    ws.sheet_view.showGridLines = False


def sheet_track_summary(wb: Workbook, data: dict) -> None:
    ws = wb.create_sheet("Track Summary")
    ws.sheet_properties.tabColor = "2E90A8"
    headers = ["Track", "Entry points", "Branches", "Lateral moves", "Failure modes", "Promotion evidence"]
    title_block(ws, "Track summary", "The qualitative side of each journey: where people come from, where they go, and how they fail.", len(headers))
    for c, h in enumerate(headers, 1):
        ws.cell(row=4, column=c, value=h)
    style_header(ws, 4, len(headers))
    for r, t in enumerate(data["tracks"], start=5):
        values = [
            t["title"], t.get("entry_points", ""), t.get("branches", ""),
            t.get("lateral", ""), t.get("failure_modes", ""), t.get("promotion_evidence", ""),
        ]
        for c, v in enumerate(values, 1):
            ws.cell(row=r, column=c, value=v)
    style_body(ws, 5, 13, len(headers))
    for r in range(5, 14):
        ws.row_dimensions[r].height = 86
        ws.cell(row=r, column=1).font = Font(name="Segoe UI Semibold", size=10, color=TEAL)
    set_widths(ws, [30, 40, 30, 32, 40, 40])
    ws.freeze_panes = "B5"
    ws.sheet_view.showGridLines = False


def sheet_comp(wb: Workbook, data: dict) -> None:
    ws = wb.create_sheet("Comp Bands")
    ws.sheet_properties.tabColor = AMBER
    headers = [
        "Band", "Base min", "Base max", "Base mid", "Bonus min %", "Bonus max %",
        "Bonus mid %", "LTI %", "Total min", "Total mid", "Total max", "Notes",
    ]
    title_block(ws, "Compensation architecture (relative)", "L1 = 1.00. No absolute salaries. Total = base × (1 + bonus).", len(headers))
    for c, h in enumerate(headers, 1):
        ws.cell(row=4, column=c, value=h)
    style_header(ws, 4, len(headers))

    for r, b in enumerate(data["comp"]["bands"], start=5):
        base_lo, base_hi, note = parse_range(b["base"])
        bonus_lo, bonus_hi, _ = parse_range(b["bonus"])
        lti_lo, lti_hi, _ = parse_range(b["lti"])
        lti_mid = (lti_lo + lti_hi) / 2 / 100 if (lti_lo or lti_hi) else 0
        if lti_mid == 0 and b["lti"] and "%" not in b["lti"] and b["lti"] not in {"—", "-"}:
            lti_mid = 0
        ws.cell(row=r, column=1, value=f"L{b['band']}")
        ws.cell(row=r, column=2, value=base_lo)
        ws.cell(row=r, column=3, value=base_hi)
        ws.cell(row=r, column=4, value=f"=AVERAGE(B{r}:C{r})")
        ws.cell(row=r, column=5, value=bonus_lo / 100)
        ws.cell(row=r, column=6, value=bonus_hi / 100)
        ws.cell(row=r, column=7, value=f"=AVERAGE(E{r}:F{r})")
        ws.cell(row=r, column=8, value=lti_mid)
        ws.cell(row=r, column=9, value=f"=B{r}*(1+E{r})")
        ws.cell(row=r, column=10, value=f"=D{r}*(1+G{r})")
        ws.cell(row=r, column=11, value=f"=C{r}*(1+F{r})")
        ws.cell(row=r, column=12, value=note)

    style_body(ws, 5, 14, len(headers))
    for r in range(5, 15):
        ws.cell(row=r, column=1).alignment = CENTER
        ws.cell(row=r, column=1).font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
        for c in range(2, 12):
            ws.cell(row=r, column=c).number_format = "0.00"
            ws.cell(row=r, column=c).alignment = CENTER
        ws.cell(row=r, column=5).number_format = "0%"
        ws.cell(row=r, column=6).number_format = "0%"
        ws.cell(row=r, column=7).number_format = "0%"
        ws.cell(row=r, column=8).number_format = "0%"

    ws.conditional_formatting.add(
        "J5:J14",
        ColorScaleRule(start_type="min", start_color="E8F5F1", mid_type="percentile", mid_value=50, mid_color="FDE9C8", end_type="max", end_color="F9D3C8"),
    )

    ws["A17"] = "Track modifiers"
    ws["A17"].font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
    mod_headers = ["Track", "Base vs firm median", "Variable share", "Notes", "Base multiplier (mid)"]
    for c, h in enumerate(mod_headers, 1):
        ws.cell(row=18, column=c, value=h)
    style_header(ws, 18, len(mod_headers))
    for r, m in enumerate(data["comp"]["modifiers"], start=19):
        lo, hi, _ = parse_range(m["base"])
        mid = (lo + hi) / 2 if hi else lo
        ws.cell(row=r, column=1, value=m["track"])
        ws.cell(row=r, column=2, value=m["base"])
        ws.cell(row=r, column=3, value=m["variable"])
        ws.cell(row=r, column=4, value=m["notes"])
        ws.cell(row=r, column=5, value=round(mid, 3))
    style_body(ws, 19, 27, len(mod_headers))
    for r in range(19, 28):
        ws.cell(row=r, column=5).number_format = "0.00"
        ws.cell(row=r, column=5).alignment = CENTER

    ws["A30"] = "Formula"
    ws["A30"].font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
    ws["A31"] = data["comp"].get("formula", "")
    ws.merge_cells("A31:F35")
    ws["A31"].font = Font(name="Consolas", size=9, color="344054")
    ws["A31"].alignment = Alignment(wrap_text=True, vertical="top")
    ws["A31"].fill = PatternFill("solid", fgColor="F9FAFB")
    ws["A31"].border = BORDER

    set_widths(ws, [10, 10, 10, 10, 12, 12, 12, 10, 10, 10, 10, 30])
    ws.freeze_panes = "B5"
    ws.sheet_view.showGridLines = False


def sheet_builder(wb: Workbook, data: dict) -> None:
    ws = wb.create_sheet("Comp Builder")
    ws.sheet_properties.tabColor = "D97706"
    ws.sheet_view.showGridLines = False
    set_widths(ws, [3, 34, 26, 3, 46])

    ws["B2"] = "Compensation builder"
    ws["B2"].font = Font(name="Segoe UI Semibold", size=20, color=INK)
    ws["B3"] = "Model a relative package. The anchor is optional and user-supplied — this workbook recommends no salary."
    ws["B3"].font = Font(name="Segoe UI", size=10, color=GREY)

    inputs = [
        ("Band", "L5", "L0–L9"),
        ("Track", "Trading", "Track modifier"),
        ("Performance percentile", "75th", "25 / 50 / 75 / 90"),
        ("L1 base anchor (optional, local currency)", None, "Leave blank to stay in index units"),
    ]
    r = 5
    for label, value, note in inputs:
        ws.cell(row=r, column=2, value=label).font = Font(name="Segoe UI Semibold", size=10, color=INK)
        ws.cell(row=r, column=2).fill = PatternFill("solid", fgColor=SAND)
        ws.cell(row=r, column=2).border = BORDER
        cell = ws.cell(row=r, column=3, value=value)
        cell.font = Font(name="Segoe UI Semibold", size=11, color=TEAL)
        cell.fill = PatternFill("solid", fgColor="FFFBEB")
        cell.border = BORDER
        cell.alignment = CENTER
        ws.cell(row=r, column=5, value=note).font = Font(name="Segoe UI", size=9, color=GREY)
        r += 1

    dv_band = DataValidation(type="list", formula1='"L0,L1,L2,L3,L4,L5,L6,L7,L8,L9"', allow_blank=False)
    dv_track = DataValidation(type="list", formula1='"Research,Trading,Technology,Data / ML,Risk,Compliance / Legal,Finance / Treasury,Operations,Product / Business"', allow_blank=False)
    dv_pct = DataValidation(type="list", formula1='"25th,50th,75th,90th"', allow_blank=False)
    ws.add_data_validation(dv_band); dv_band.add("C5")
    ws.add_data_validation(dv_track); dv_track.add("C6")
    ws.add_data_validation(dv_pct); dv_pct.add("C7")

    # Output block
    ws["B11"] = "Relative package"
    ws["B11"].font = Font(name="Segoe UI Semibold", size=13, color=TEAL)
    labels = [
        ("Band midpoint base index", "=INDEX('Comp Bands'!$D$5:$D$14,MATCH($C$5,'Comp Bands'!$A$5:$A$14,0))"),
        ("Bonus midpoint (% of base)", "=INDEX('Comp Bands'!$G$5:$G$14,MATCH($C$5,'Comp Bands'!$A$5:$A$14,0))"),
        ("Total multiple — 25th percentile", "=INDEX('Comp Bands'!$I$5:$I$14,MATCH($C$5,'Comp Bands'!$A$5:$A$14,0))"),
        ("Total multiple — 90th percentile", "=INDEX('Comp Bands'!$K$5:$K$14,MATCH($C$5,'Comp Bands'!$A$5:$A$14,0))"),
        ("Track base multiplier", "=INDEX('Comp Bands'!$E$19:$E$27,MATCH($C$6,'Comp Bands'!$A$19:$A$27,0))"),
        ("Position in band (0–1)", "=IF($C$7=\"25th\",0,IF($C$7=\"50th\",0.5,IF($C$7=\"75th\",0.75,1)))"),
        ("Relative total multiple", "=C14+((C15-C14)*C17)"),
        ("Relative package vs L1", "=C18*C16"),
        ("Illustrative local value (if anchored)", "=IF(ISNUMBER($C$8),C19*$C$8,\"—\")"),
    ]
    r = 12
    for label, formula in labels:
        ws.cell(row=r, column=2, value=label).font = Font(name="Segoe UI", size=10, color="344054")
        ws.cell(row=r, column=2).border = BORDER
        cell = ws.cell(row=r, column=3, value=formula)
        cell.font = Font(name="Segoe UI Semibold", size=11, color=INK)
        cell.border = BORDER
        cell.alignment = CENTER
        cell.fill = PatternFill("solid", fgColor="F0FDF9")
        if 12 <= r <= 16:
            cell.number_format = "0.00"
        elif r == 17:
            cell.number_format = "0%"
        elif r == 18:
            cell.number_format = "0.0\"×\""
        elif r == 19:
            cell.number_format = "0.0\"× L1\""
        elif r == 20:
            cell.number_format = "#,##0"
        r += 1

    ws["B24"] = "How to read it"
    ws["B24"].font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
    notes = [
        "The index is relative to L1 base = 1.00. It is a design tool, not a market benchmark.",
        "Percentile positions the package inside the band range: 25th = low, 90th = high.",
        "The track multiplier reflects market and variable-pay differences (e.g., trading 0.95×, research 1.05×).",
        "If you enter an L1 anchor, the local value is an illustration only. Check it against your market and legal advice.",
        "Deferral, clawback and equity vesting are not modeled here — see Part VII of the framework.",
    ]
    r = 25
    for n in notes:
        ws.cell(row=r, column=2, value="•").font = Font(name="Segoe UI", size=10, color=TEAL)
        ws.cell(row=r, column=5, value=n).font = Font(name="Segoe UI", size=9, color="344054")
        ws.cell(row=r, column=5).alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
        ws.row_dimensions[r].height = 24
        r += 1

    # Track modifier lookup helper values (hidden on the right)
    ws["H4"] = "Track lookup"
    tracks = ["Research", "Trading", "Technology", "Data / ML", "Risk", "Compliance / Legal", "Finance / Treasury", "Operations", "Product / Business"]
    mods = {"Research": 1.05, "Trading": 0.95, "Technology": 1.05, "Data / ML": 1.025, "Risk": 1.0,
            "Compliance / Legal": 1.0, "Finance / Treasury": 1.0, "Operations": 0.9, "Product / Business": 1.0}
    for i, t in enumerate(tracks):
        ws.cell(row=5 + i, column=8, value=t)
        ws.cell(row=5 + i, column=9, value=mods[t])
    ws.column_dimensions["H"].hidden = True
    ws.column_dimensions["I"].hidden = True


def sheet_calibration(wb: Workbook, data: dict) -> None:
    ws = wb.create_sheet("Calibration")
    ws.sheet_properties.tabColor = "7C3AED"
    ws.sheet_view.showGridLines = False
    headers = ["Band", "Current base mid", "Proposed multiplier", "Proposed base", "Proposed total mid", "Check", "Notes"]
    title_block(ws, "Calibration workshop (60 minutes)", "Anchor the relative structure to your market without importing someone else's hierarchy.", len(headers))
    for c, h in enumerate(headers, 1):
        ws.cell(row=4, column=c, value=h)
    style_header(ws, 4, len(headers))

    for r, b in enumerate(data["comp"]["bands"], start=5):
        base_lo, base_hi, _ = parse_range(b["base"])
        mid = (base_lo + base_hi) / 2
        ws.cell(row=r, column=1, value=f"L{b['band']}")
        ws.cell(row=r, column=2, value=round(mid, 3))
        ws.cell(row=r, column=3, value=1.0)
        ws.cell(row=r, column=4, value=f"=B{r}*C{r}")
        ws.cell(row=r, column=5, value=f"=D{r}*(1+INDEX('Comp Bands'!$G$5:$G$14,MATCH(A{r},'Comp Bands'!$A$5:$A$14,0)))")
        ws.cell(row=r, column=6, value=f'=IF(D{r}>=B{r},"OK","REVIEW")')
        ws.cell(row=r, column=7, value="")

    style_body(ws, 5, 14, len(headers))
    for r in range(5, 15):
        ws.cell(row=r, column=1).alignment = CENTER
        ws.cell(row=r, column=1).font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
        for c in range(2, 6):
            ws.cell(row=r, column=c).number_format = "0.00"
            ws.cell(row=r, column=c).alignment = CENTER
        ws.cell(row=r, column=3).fill = PatternFill("solid", fgColor="FFFBEB")
        ws.cell(row=r, column=3).font = Font(name="Segoe UI Semibold", size=11, color=TEAL)
        ws.cell(row=r, column=6).alignment = CENTER

    ws.conditional_formatting.add("F5:F14", CellIsRule(operator="equal", formula=['"OK"'], fill=PatternFill("solid", fgColor="D1FADF"), font=Font(color=GREEN, bold=True)))
    ws.conditional_formatting.add("F5:F14", CellIsRule(operator="equal", formula=['"REVIEW"'], fill=PatternFill("solid", fgColor="FEE4E2"), font=Font(color=RED, bold=True)))

    ws["A17"] = "Sanity checks"
    ws["A17"].font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
    checks = [
        ("Base is monotonic (no lower band paid above a higher band)", '=IF(SUMPRODUCT(--(D6:D14<D5:D13))=0,"PASS","FAIL")'),
        ("L9 / L1 base ratio is between 4× and 10×", '=IF(AND(D14/D6>=4,D14/D6<=10),"PASS","REVIEW")'),
        ("L5 / L3 base ratio is between 1.3× and 2.0×", '=IF(AND(D10/D8>=1.3,D10/D8<=2.0),"PASS","REVIEW")'),
        ("Total comp rises with band", '=IF(SUMPRODUCT(--(E6:E14<E5:E13))=0,"PASS","FAIL")'),
    ]
    r = 18
    for label, formula in checks:
        ws.cell(row=r, column=1, value=label).font = Font(name="Segoe UI", size=10, color="344054")
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
        cell = ws.cell(row=r, column=6, value=formula)
        cell.font = Font(name="Segoe UI Semibold", size=10)
        cell.alignment = CENTER
        cell.border = BORDER
        r += 1
    ws.conditional_formatting.add("F18:F21", CellIsRule(operator="equal", formula=['"PASS"'], fill=PatternFill("solid", fgColor="D1FADF"), font=Font(color=GREEN, bold=True)))
    ws.conditional_formatting.add("F18:F21", CellIsRule(operator="equal", formula=['"FAIL"'], fill=PatternFill("solid", fgColor="FEE4E2"), font=Font(color=RED, bold=True)))
    ws.conditional_formatting.add("F18:F21", CellIsRule(operator="equal", formula=['"REVIEW"'], fill=PatternFill("solid", fgColor="FEF0C7"), font=Font(color=AMBER, bold=True)))

    ws["A24"] = "The 60-minute agenda"
    ws["A24"].font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
    agenda = [
        ("0–10", "Define the reference market: which firms, which cities, which business model?"),
        ("10–20", "Agree the L1 anchor range and the L9/L1 multiple you are willing to defend."),
        ("20–35", "Adjust the proposed multipliers band by band; watch the sanity checks."),
        ("35–45", "Check track modifiers against your hiring reality (who are you losing, and why?)."),
        ("45–55", "Stress-test two offers: a senior hire and a promotion. Do the numbers tell a coherent story?"),
        ("55–60", "Record decisions, owner and review date. Comp philosophy is a board-level choice."),
    ]
    r = 25
    for t, text in agenda:
        ws.cell(row=r, column=1, value=t).font = Font(name="Segoe UI Semibold", size=9, color=TEAL)
        ws.cell(row=r, column=1).alignment = CENTER
        ws.cell(row=r, column=1).fill = PatternFill("solid", fgColor=TEAL_LIGHT)
        ws.cell(row=r, column=2, value=text).font = Font(name="Segoe UI", size=9, color="344054")
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
        r += 1

    ws["A33"] = "Decision record"
    ws["A33"].font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
    record = [
        ("Reference market", ""), ("L1 anchor range", ""), ("L9/L1 multiple", ""),
        ("Approved by", ""), ("Review date", ""),
    ]
    r = 34
    for label, value in record:
        ws.cell(row=r, column=1, value=label).font = Font(name="Segoe UI", size=9, color=GREY)
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        ws.cell(row=r, column=3, value=value).border = BORDER
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
        r += 1

    set_widths(ws, [12, 16, 16, 14, 16, 10, 40])
    ws.freeze_panes = "B5"
    ws.sheet_view.showGridLines = False


def sheet_org(wb: Workbook) -> None:
    ws = wb.create_sheet("Org Plan")
    ws.sheet_properties.tabColor = "0E7490"
    ws.sheet_view.showGridLines = False
    headers = ["Function", "% at <100", "% at 100–250", "% at 250–500", "FTE @ 50", "FTE @ 100", "FTE @ 250", "FTE @ 500", "Notes"]
    title_block(ws, "Headcount plan", "Edit the percentages; FTE columns recalculate. Defaults reflect the framework's scaling stages.", len(headers))
    for c, h in enumerate(headers, 1):
        ws.cell(row=4, column=c, value=h)
    style_header(ws, 4, len(headers))

    rows = [
        ("Trading (desks, PMs, traders)", 0.18, 0.18, 0.16, "Revenue engine; scales with strategies, not headcount"),
        ("Research (QR, ML, microstructure)", 0.18, 0.20, 0.18, "Shared capability; grows with alpha breadth"),
        ("Technology (QD, low-latency, FPGA, SRE)", 0.30, 0.28, 0.26, "Largest function in an HFT firm"),
        ("Data & ML engineering", 0.06, 0.08, 0.10, "Splits from Technology at ~100"),
        ("Risk & model validation", 0.07, 0.08, 0.09, "Independent second line"),
        ("Compliance & Legal", 0.04, 0.05, 0.06, "Scales with jurisdictions × products"),
        ("Finance & Treasury", 0.05, 0.05, 0.05, "Treasury becomes a desk at scale"),
        ("Operations", 0.09, 0.05, 0.05, "Automation reduces ratio over time"),
        ("Product & Business", 0.02, 0.02, 0.03, "Optional below ~150"),
        ("CEO office / Chief of Staff", 0.01, 0.01, 0.02, "Strategy, board, special projects"),
    ]
    for r, (name, p50, p250, p500, note) in enumerate(rows, start=5):
        ws.cell(row=r, column=1, value=name)
        ws.cell(row=r, column=2, value=p50).number_format = "0%"
        ws.cell(row=r, column=3, value=p250).number_format = "0%"
        ws.cell(row=r, column=4, value=p500).number_format = "0%"
        ws.cell(row=r, column=5, value=f"=ROUND(B{r}*50,1)")
        ws.cell(row=r, column=6, value=f"=ROUND(C{r}*100,1)")
        ws.cell(row=r, column=7, value=f"=ROUND(C{r}*250,1)")
        ws.cell(row=r, column=8, value=f"=ROUND(D{r}*500,1)")
        ws.cell(row=r, column=9, value=note)

    style_body(ws, 5, 14, len(headers))
    for r in range(5, 15):
        for c in range(2, 9):
            ws.cell(row=r, column=c).alignment = CENTER
            if c <= 4:
                ws.cell(row=r, column=c).number_format = "0%"
                ws.cell(row=r, column=c).fill = PatternFill("solid", fgColor="FFFBEB")
            else:
                ws.cell(row=r, column=c).number_format = "0.0"
    ws.cell(row=15, column=1, value="Total").font = Font(name="Segoe UI Semibold", size=10, color=INK)
    for c in range(2, 9):
        cell = ws.cell(row=15, column=c, value=f"=SUM({get_column_letter(c)}5:{get_column_letter(c)}14)")
        cell.font = Font(name="Segoe UI Semibold", size=10, color=TEAL)
        cell.border = BORDER
        cell.alignment = CENTER
        cell.fill = PatternFill("solid", fgColor=TEAL_LIGHT)
        cell.number_format = "0%" if c <= 4 else "0.0"

    ws["A18"] = "Reality checks"
    ws["A18"].font = Font(name="Segoe UI Semibold", size=12, color=TEAL)
    checks = [
        "Technology + Data should be 30–45% of headcount in an HFT firm.",
        "Risk + Compliance should be 10–15% at 100+ people; independence is more important than ratio.",
        "A manager should have 5–8 direct reports; a desk head 3–5 pods.",
        "If a function is below 3 people, ask whether it should be combined or outsourced.",
        "Headcount ratios are a symptom, not a strategy. Validate against your edge.",
    ]
    r = 19
    for ch in checks:
        ws.cell(row=r, column=1, value="•").font = Font(name="Segoe UI", size=10, color=TEAL)
        ws.cell(row=r, column=2, value=ch).font = Font(name="Segoe UI", size=9, color="344054")
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=9)
        r += 1

    set_widths(ws, [36, 10, 12, 12, 10, 10, 10, 10, 44])
    ws.freeze_panes = "B5"
    ws.sheet_view.showGridLines = False


def sheet_promotion(wb: Workbook) -> None:
    ws = wb.create_sheet("Promotion")
    ws.sheet_properties.tabColor = "BE123C"
    ws.sheet_view.showGridLines = False
    set_widths(ws, [3, 30, 16, 60, 3])

    ws["B2"] = "Promotion packet & scorecard"
    ws["B2"].font = Font(name="Segoe UI Semibold", size=20, color=INK)
    ws["B3"] = "Evidence first, then calibration. Fill the white cells; the score and recommendation recalculate."
    ws["B3"].font = Font(name="Segoe UI", size=10, color=GREY)

    fields = [
        ("Candidate", ""), ("Current band / title", ""), ("Proposed band / title", ""),
        ("Track", ""), ("Manager", ""), ("Sponsor", ""),
    ]
    r = 5
    for label, value in fields:
        ws.cell(row=r, column=2, value=label).font = Font(name="Segoe UI Semibold", size=10, color=INK)
        ws.cell(row=r, column=2).fill = PatternFill("solid", fgColor=SAND)
        ws.cell(row=r, column=2).border = BORDER
        ws.cell(row=r, column=3, value=value).border = BORDER
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4)
        r += 1

    ws["B12"] = "Scope change (the core test)"
    ws["B12"].font = Font(name="Segoe UI Semibold", size=11, color=TEAL)
    ws["C12"] = ""
    ws.merge_cells("C12:D14")
    ws["C12"].border = BORDER
    ws["C12"].alignment = Alignment(wrap_text=True, vertical="top")

    ws["B16"] = "Evidence"
    ws["B16"].font = Font(name="Segoe UI Semibold", size=11, color=TEAL)
    ev_headers = ["#", "Evidence type", "Impact (quantified)", "Weight", "Score (1–4)"]
    for c, h in enumerate(ev_headers, 2):
        ws.cell(row=17, column=c, value=h)
    style_header(ws, 17, 5)
    weights = [0.30, 0.20, 0.20, 0.15, 0.15]
    ev_types = ["Strategy / system delivered", "Scope beyond own work", "Mentorship / talent", "Cross-functional influence", "External / brand"]
    for i in range(5):
        r = 18 + i
        ws.cell(row=r, column=2, value=i + 1)
        ws.cell(row=r, column=3, value=ev_types[i])
        ws.cell(row=r, column=4, value="")
        ws.cell(row=r, column=5, value=weights[i]).number_format = "0%"
        ws.cell(row=r, column=6, value=3)
        for c in range(2, 7):
            ws.cell(row=r, column=c).border = BORDER
            ws.cell(row=r, column=c).alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 32

    ws["B24"] = "Weighted score"
    ws["B24"].font = Font(name="Segoe UI Semibold", size=11, color=TEAL)
    ws["F24"] = "=SUMPRODUCT(E18:E22,F18:F22)"
    ws["F24"].font = Font(name="Segoe UI Semibold", size=14, color=TEAL)
    ws["F24"].alignment = CENTER
    ws["F24"].border = BORDER
    ws["F24"].fill = PatternFill("solid", fgColor=TEAL_LIGHT)
    ws["F24"].number_format = "0.00"

    ws["B26"] = "Recommendation"
    ws["B26"].font = Font(name="Segoe UI Semibold", size=11, color=TEAL)
    ws["C26"] = '=IF(F24>=3.5,"PROMOTE",IF(F24>=3.0,"DEFER — close the gap","NOT YET"))'
    ws["C26"].font = Font(name="Segoe UI Semibold", size=12, color=INK)
    ws["C26"].fill = PatternFill("solid", fgColor="FFFBEB")
    ws["C26"].border = BORDER
    ws.merge_cells("C26:D26")

    ws["B28"] = "Committee decision"
    ws["B28"].font = Font(name="Segoe UI Semibold", size=11, color=TEAL)
    dv = DataValidation(type="list", formula1='"Promote,Defer,Not yet"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("C28")
    ws["C28"].border = BORDER
    ws["C28"].fill = PatternFill("solid", fgColor="FFFBEB")
    ws["B30"] = "Rationale"
    ws["B30"].font = Font(name="Segoe UI Semibold", size=11, color=TEAL)
    ws.merge_cells("C30:D33")
    ws["C30"].border = BORDER
    ws["C30"].alignment = Alignment(wrap_text=True, vertical="top")


def sheet_table(wb: Workbook, name: str, title: str, subtitle: str, columns: list[str], rows: list[list], widths: list[int], tab: str) -> None:
    ws = wb.create_sheet(name)
    ws.sheet_properties.tabColor = tab
    ws.sheet_view.showGridLines = False
    title_block(ws, title, subtitle, len(columns))
    for c, h in enumerate(columns, 1):
        ws.cell(row=4, column=c, value=h)
    style_header(ws, 4, len(columns))
    for r, row in enumerate(rows, start=5):
        for c, v in enumerate(row, 1):
            ws.cell(row=r, column=c, value=v)
    style_body(ws, 5, 4 + len(rows), len(columns))
    set_widths(ws, widths)
    ws.freeze_panes = "A5"
    ws.auto_filter.ref = f"A4:{get_column_letter(len(columns))}{4+len(rows)}"


def build() -> Path:
    data = fd.parse_all()
    wb = Workbook()
    sheet_start(wb)
    sheet_levels(wb, data)
    sheet_tracks(wb, data)
    sheet_track_summary(wb, data)
    sheet_comp(wb, data)
    sheet_builder(wb, data)
    sheet_calibration(wb, data)
    sheet_org(wb)
    sheet_promotion(wb)
    sheet_table(
        wb, "KPIs", "KPI dictionary", "Metric, definition, owner, cadence and desired direction.",
        data["kpis"]["columns"], data["kpis"]["rows"], [34, 54, 22, 12, 16], "475467",
    )
    sheet_table(
        wb, "Title Map", "Title translation matrix", "Map bands to HFT, multi-strat, bank, big-tech and crypto titles.",
        data["translation"]["columns"], data["translation"]["rows"], [8, 24, 28, 22, 18, 18], "334155",
    )
    sheet_table(
        wb, "Glossary", "Glossary", "67 terms used across the framework.",
        ["Term", "Meaning"], [[g["term"], g["meaning"]] for g in data["glossary"]], [30, 100], "6B7280",
    )

    wb.calculation.fullCalcOnLoad = True
    for ws in wb.worksheets:
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.print_options.horizontalCentered = True

    wb.save(OUT)
    return OUT


if __name__ == "__main__":
    path = build()
    print("wrote", path)
