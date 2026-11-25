"""Generate a print-ready one-page career map (A3 landscape PDF + PNG)."""
from __future__ import annotations

import html
import subprocess
from pathlib import Path

import framework_data as fd

APP = Path(__file__).resolve().parents[1]
HTML = APP / "career-map.html"
PDF = APP / "quant-org-career-map.pdf"
PNG = APP / "quant-org-career-map.png"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")

TRACK_SHORT = {
    "research": "RESEARCH",
    "trading": "TRADING",
    "technology": "TECHNOLOGY",
    "data-ml": "DATA & ML",
    "risk": "RISK & VALIDATION",
    "compliance-legal": "COMPLIANCE & LEGAL",
    "finance": "FINANCE & TREASURY",
    "operations": "OPERATIONS",
    "product-business": "PRODUCT & BUSINESS",
}

BAND_LABEL = {
    9: ("L9", "CEO", "The firm"),
    8: ("L8", "C-suite", "Firm pillar"),
    7: ("L7", "VP / SVP", "Firm-wide domain"),
    6: ("L6", "Head of Function", "Function strategy"),
    5: ("L5", "Head of Desk", "Desk P&L + team"),
    4: ("L4", "Staff / Principal", "Platform or cluster"),
    3: ("L3", "Senior", "Strategy / system"),
    2: ("L2", "Mid-level", "Signal / module"),
    1: ("L1", "Entry", "Component"),
    0: ("L0", "Intern", "Assigned task"),
}

BAND_COLOR = {
    9: ("#0F2E2E", "#FFFFFF"),
    8: ("#0E4F4A", "#FFFFFF"),
    7: ("#0E6B63", "#FFFFFF"),
    6: ("#147A70", "#FFFFFF"),
    5: ("#B7791F", "#FFFFFF"),
    4: ("#D9A441", "#1F2937"),
    3: ("#BFE3DD", "#0F2E2E"),
    2: ("#D9EFEC", "#0F2E2E"),
    1: ("#EDF7F4", "#0F2E2E"),
    0: ("#F2F0E9", "#475467"),
}


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def build_html(data: dict) -> str:
    tracks = {t["id"]: t for t in data["tracks"]}
    order = ["research", "trading", "technology", "data-ml", "risk", "compliance-legal", "finance", "operations", "product-business"]

    def cell(track_id: str, band: int) -> str:
        t = tracks[track_id]
        step = next((s for s in t["ladder"] if s["band"] == band), None)
        if not step:
            return '<td class="empty">—</td>'
        title = step["title"]
        mission = step["mission"]
        badge = ""
        if band == 4:
            badge = '<span class="badge fork">fork</span>'
        elif band == 5:
            badge = '<span class="badge mgr">people</span>'
        elif band >= 6:
            badge = '<span class="badge exec">exec</span>'
        return f'<td class="role"><div class="role-top"><span class="role-title">{esc(title)}</span>{badge}</div><div class="role-mission">{esc(mission)}</div></td>'

    rows = []
    for band in range(9, -1, -1):
        code, label, scope = BAND_LABEL[band]
        bg, fg = BAND_COLOR[band]
        if band == 9:
            rows.append(
                f'<tr class="band-row"><th class="band" style="background:{bg};color:{fg}">'
                f'<div class="band-code">{code}</div><div class="band-label">{label}</div><div class="band-scope">{scope}</div></th>'
                f'<td class="ceo" colspan="9"><div class="ceo-title">CEO · Managing Partner</div>'
                f'<div class="ceo-sub">Owns firm strategy, capital allocation, risk appetite and the executive team. One seat — not a track.</div></td></tr>'
            )
            continue
        cells = "".join(cell(t, band) for t in order)
        rows.append(
            f'<tr class="band-row"><th class="band" style="background:{bg};color:{fg}">'
            f'<div class="band-code">{code}</div><div class="band-label">{label}</div><div class="band-scope">{scope}</div></th>{cells}</tr>'
        )

    headers = "".join(f'<th class="track">{TRACK_SHORT[t]}</th>' for t in order)

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Quant Org Career Map</title>
<style>
  @page {{ size: A3 landscape; margin: 0; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; background: #F7F5EF; }}
  body {{ width: 420mm; height: 297mm; font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif; color: #0F2E2E; overflow: hidden; }}
  .page {{ width: 420mm; height: 297mm; padding: 9mm 10mm 7mm 10mm; display: flex; flex-direction: column; }}
  header {{ display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.4mm solid #0F2E2E; padding-bottom: 2.2mm; }}
  .kicker {{ font-size: 6.4pt; letter-spacing: .18em; text-transform: uppercase; color: #0E6B63; font-weight: 700; }}
  h1 {{ font-size: 21pt; line-height: 1; margin: 1.2mm 0 0 0; letter-spacing: -.02em; }}
  .sub {{ font-size: 7.4pt; color: #475467; margin-top: 1.4mm; max-width: 190mm; line-height: 1.35; }}
  .meta {{ text-align: right; font-size: 6.4pt; color: #667085; line-height: 1.5; }}
  .meta strong {{ color: #0F2E2E; font-size: 8pt; }}
  .legend {{ display: flex; gap: 3mm; align-items: center; font-size: 5.8pt; color: #475467; margin: 2mm 0 1.6mm 0; }}
  .swatch {{ display: inline-block; width: 4mm; height: 2.2mm; border-radius: .6mm; margin-right: 1mm; vertical-align: middle; }}
  table {{ width: 100%; border-collapse: separate; border-spacing: 1.1mm; table-layout: fixed; flex: 1; }}
  thead th {{ font-size: 6.2pt; letter-spacing: .06em; color: #0E6B63; text-transform: uppercase; font-weight: 700; padding: 0 0 1mm 0; text-align: left; }}
  thead th.track {{ border-bottom: .35mm solid #C9D6D3; padding-bottom: 1.2mm; }}
  th.band {{ width: 33mm; border-radius: 1.4mm; padding: 1.4mm 2mm; text-align: left; vertical-align: middle; }}
  .band-code {{ font-size: 10pt; font-weight: 800; letter-spacing: -.02em; line-height: 1; }}
  .band-label {{ font-size: 7.2pt; font-weight: 700; margin-top: .8mm; line-height: 1.1; }}
  .band-scope {{ font-size: 5.4pt; opacity: .82; margin-top: .6mm; line-height: 1.15; }}
  td.role {{ background: #FFFFFF; border: .3mm solid #E2E8E5; border-radius: 1.4mm; padding: 1.3mm 1.6mm; vertical-align: top; overflow: hidden; }}
  .role-top {{ display: flex; align-items: flex-start; justify-content: space-between; gap: 1mm; }}
  .role-title {{ font-size: 6.5pt; font-weight: 700; line-height: 1.15; }}
  .role-mission {{ font-size: 5.3pt; color: #667085; line-height: 1.22; margin-top: .7mm; }}
  .badge {{ font-size: 4.2pt; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; padding: .3mm .8mm; border-radius: .7mm; white-space: nowrap; }}
  .badge.fork {{ background: #FDE9C8; color: #8A5A12; }}
  .badge.mgr {{ background: #0F2E2E; color: #FFFFFF; }}
  .badge.exec {{ background: #D9EFEC; color: #0E6B63; }}
  td.empty {{ background: #FAFAF7; border: .3mm dashed #D0D5DD; border-radius: 1.4mm; text-align: center; color: #98A2B3; font-size: 7pt; }}
  td.ceo {{ background: #0F2E2E; color: #FFFFFF; border-radius: 1.4mm; padding: 1.6mm 3mm; }}
  .ceo-title {{ font-size: 8pt; font-weight: 800; }}
  .ceo-sub {{ font-size: 5.8pt; opacity: .8; margin-top: .5mm; }}
  footer {{ display: grid; grid-template-columns: 1.15fr 1fr 1fr 1fr; gap: 2.4mm; margin-top: 2mm; }}
  .foot-box {{ border-top: .45mm solid #0F2E2E; padding-top: 1.2mm; }}
  .foot-title {{ font-size: 5.6pt; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: #0E6B63; }}
  .foot-text {{ font-size: 5.6pt; color: #475467; line-height: 1.3; margin-top: .6mm; }}
  .fine {{ margin-top: 1.4mm; font-size: 4.9pt; color: #98A2B3; display: flex; justify-content: space-between; }}
</style></head>
<body><div class="page">
  <header>
    <div>
      <div class="kicker">The Quant Firm Operating System · One-page career map</div>
      <h1>Nine tracks. Ten bands. One firm.</h1>
      <div class="sub">Read across a row to compare scope at the same band. Read down a column to see a career. Titles are local; bands are universal. HR roles are excluded by design.</div>
    </div>
    <div class="meta"><strong>v1.0 · Nov 2026</strong><br>L0 Intern → L9 CEO<br>&lt;100 people, scalable to 500+</div>
  </header>

  <div class="legend">
    <span><span class="swatch" style="background:#EDF7F4"></span>IC depth</span>
    <span><span class="swatch" style="background:#BFE3DD"></span>Senior IC</span>
    <span><span class="swatch" style="background:#D9A441"></span>Fork / Staff</span>
    <span><span class="swatch" style="background:#B7791F"></span>Desk leadership</span>
    <span><span class="swatch" style="background:#147A70"></span>Function</span>
    <span><span class="swatch" style="background:#0E4F4A"></span>C-suite</span>
    <span style="margin-left:auto"><b>Promotion test:</b> scope change + evidence at the next band + sponsor + calibration.</span>
  </div>

  <table>
    <thead><tr><th class="band" style="background:transparent;color:#0E6B63">BAND · SCOPE</th>{headers}</tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>

  <footer>
    <div class="foot-box"><div class="foot-title">The dual track</div><div class="foot-text">Staff / Principal and Manager are peers at L4–L5. Neither is above the other. Staying is a valid career.</div></div>
    <div class="foot-box"><div class="foot-title">Governance non-negotiables</div><div class="foot-text">Risk veto + board access · one accountable owner per decision · G2/G3 gates · independent validation · blameless SEV-1/2 post-mortems.</div></div>
    <div class="foot-box"><div class="foot-title">Compensation shape</div><div class="foot-text">L1 = 1.00 index. L8 ≈ 13–26×. PnL share and deferral above L4. Risk-adjusted, never raw P&amp;L.</div></div>
    <div class="foot-box"><div class="foot-title">How to use it</div><div class="foot-text">Pick a track, locate the band, read the mission and gate. Use the full framework for KPIs, hiring loops and RACI.</div></div>
  </footer>
  <div class="fine"><span>Source: quant-org-career-framework.md · quant-org-os app · generated by tools/make_career_map.py</span><span>Print A3 landscape · 100% scale · no absolute salaries</span></div>
</div></body></html>"""


def main() -> None:
    data = fd.parse_all()
    HTML.write_text(build_html(data), encoding="utf-8")
    print("wrote", HTML)
    if not CHROME.exists():
        print("Chrome not found; open the HTML and print to PDF manually")
        return
    url = HTML.resolve().as_uri()
    subprocess.run(
        [str(CHROME), "--headless=new", "--disable-gpu", "--hide-scrollbars",
         "--no-pdf-header-footer", "--virtual-time-budget=4000",
         f"--print-to-pdf={PDF}", url],
        check=True,
    )
    print("wrote", PDF)
    subprocess.run(
        [str(CHROME), "--headless=new", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=2", "--window-size=1587,1123",
         "--virtual-time-budget=4000", f"--screenshot={PNG}", url],
        check=True,
    )
    print("wrote", PNG)


if __name__ == "__main__":
    main()
