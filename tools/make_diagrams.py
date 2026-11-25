"""Generate theme-aware SVG org diagrams for the app and the docs."""
from __future__ import annotations

import html
from pathlib import Path
from typing import Any

APP = Path(__file__).resolve().parents[1]
OUT = APP / "src-tauri" / "resources" / "diagrams"
OUT.mkdir(parents=True, exist_ok=True)

NODE_W = 216
NODE_H = 62
H_GAP = 54
V_GAP = 14
MARGIN = 28


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def wrap(text: str, width: int = 27, max_lines: int = 2) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        cand = f"{cur} {w}".strip()
        if len(cand) <= width:
            cur = cand
        else:
            if cur:
                lines.append(cur)
            cur = w
            if len(lines) == max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    if len(lines) == max_lines and len(" ".join(words)) > sum(len(x) for x in lines) + max_lines:
        lines[-1] = lines[-1][: width - 1].rstrip() + "…"
    return lines or [text[:width]]


class Node:
    def __init__(self, label: str, sub: str = "", tone: str = "plain", children: list["Node"] | None = None, note: str = ""):
        self.label = label
        self.sub = sub
        self.tone = tone
        self.children = children or []
        self.note = note
        self.x = 0.0
        self.y = 0.0
        self.w = NODE_W
        self.h = NODE_H


def layout(root: Node) -> tuple[float, float]:
    """Left-to-right tidy tree. Returns (width, height)."""
    leaf_index = [0]

    def assign(node: Node, depth: int) -> float:
        if not node.children:
            node.y = MARGIN + leaf_index[0] * (NODE_H + V_GAP)
            leaf_index[0] += 1
        else:
            for child in node.children:
                assign(child, depth + 1)
            node.y = (node.children[0].y + node.children[-1].y) / 2
        node.x = MARGIN + depth * (NODE_W + H_GAP)
        return node.y

    assign(root, 0)
    height = MARGIN * 2 + max(1, leaf_index[0]) * (NODE_H + V_GAP) - V_GAP
    width = MARGIN * 2 + 4 * (NODE_W + H_GAP)
    return width, height


def render_node(node: Node) -> str:
    x, y, w, h = node.x, node.y, node.w, node.h
    label_lines = wrap(node.label, 27, 2)
    sub_lines = wrap(node.sub, 34, 1) if node.sub else []
    total = len(label_lines) * 13 + (4 if sub_lines else 0) + len(sub_lines) * 11
    start = y + (h - total) / 2 + 11
    parts = [f'<g class="node tone-{node.tone}">']
    parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" rx="8"/>')
    for i, line in enumerate(label_lines):
        parts.append(
            f'<text class="label" x="{x + 13:.1f}" y="{start + i * 13:.1f}">{esc(line)}</text>'
        )
    sub_start = start + len(label_lines) * 13 + 3
    for i, line in enumerate(sub_lines):
        parts.append(
            f'<text class="sub" x="{x + 13:.1f}" y="{sub_start + i * 11:.1f}">{esc(line)}</text>'
        )
    parts.append("</g>")
    return "".join(parts)


def render_edges(node: Node) -> str:
    out = []
    px = node.x + node.w
    py = node.y + node.h / 2
    for child in node.children:
        cx = child.x
        cy = child.y + child.h / 2
        mx = px + H_GAP / 2
        out.append(
            f'<path class="edge" d="M{px:.1f},{py:.1f} H{mx:.1f} V{cy:.1f} H{cx:.1f}"/>'
        )
        out.append(render_edges(child))
    return "".join(out)


def render_tree(node: Node) -> str:
    return render_edges(node) + render_node(node) + "".join(render_children(node))


def render_children(node: Node) -> list[str]:
    out = []
    for child in node.children:
        out.append(render_node(child))
        out.extend(render_children(child))
    return out


def svg_doc(root: Node, title: str, subtitle: str, width: float, height: float) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height + 54:.0f}" width="{width:.0f}" height="{height + 54:.0f}" role="img" aria-label="{esc(title)}">
<style>
  .edge {{ fill: none; stroke: var(--diagram-edge, #98A2B3); stroke-width: 1.3; }}
  .label {{ font-family: "Segoe UI", -apple-system, Roboto, Arial, sans-serif; font-size: 12.2px; font-weight: 650; fill: var(--diagram-ink, #0F2E2E); }}
  .sub {{ font-family: "Segoe UI", -apple-system, Roboto, Arial, sans-serif; font-size: 10px; fill: var(--diagram-muted, #667085); }}
  .title {{ font-family: "Segoe UI", -apple-system, Roboto, Arial, sans-serif; font-size: 17px; font-weight: 750; fill: var(--diagram-ink, #0F2E2E); }}
  .caption {{ font-family: "Segoe UI", -apple-system, Roboto, Arial, sans-serif; font-size: 10.5px; fill: var(--diagram-muted, #667085); }}
  .tone-dark rect {{ fill: var(--diagram-ink, #0F2E2E); stroke: var(--diagram-ink, #0F2E2E); }}
  .tone-dark .label {{ fill: #FFFFFF; }}
  .tone-dark .sub {{ fill: #D1E7E3; }}
  .tone-exec rect {{ fill: var(--diagram-teal, #0E6B63); stroke: var(--diagram-teal, #0E6B63); }}
  .tone-exec .label {{ fill: #FFFFFF; }}
  .tone-exec .sub {{ fill: #D1E7E3; }}
  .tone-mid rect {{ fill: var(--diagram-mid, #147A70); stroke: var(--diagram-mid, #147A70); }}
  .tone-mid .label {{ fill: #FFFFFF; }}
  .tone-mid .sub {{ fill: #D1E7E3; }}
  .tone-amber rect {{ fill: var(--diagram-amber, #B7791F); stroke: var(--diagram-amber, #B7791F); }}
  .tone-amber .label {{ fill: #FFFFFF; }}
  .tone-amber .sub {{ fill: #FDE9C8; }}
  .tone-light rect {{ fill: var(--diagram-light, #D9EFEC); stroke: var(--diagram-light-stroke, #A7D5CE); }}
  .tone-light .label {{ fill: var(--diagram-ink, #0F2E2E); }}
  .tone-plain rect {{ fill: var(--diagram-box, #FFFFFF); stroke: var(--diagram-stroke, #D0D5DD); }}
  .tone-plain .label {{ fill: var(--diagram-ink, #0F2E2E); }}
</style>
<text class="title" x="{MARGIN}" y="20">{esc(title)}</text>
<text class="caption" x="{MARGIN}" y="{height + 42:.0f}">{esc(subtitle)}</text>
<g transform="translate(0,34)">
{render_tree(root)}
</g>
</svg>"""


def n(label: str, sub: str = "", tone: str = "plain", children: list[Node] | None = None) -> Node:
    return Node(label, sub, tone, children)


def current_org() -> Node:
    return n("CEO", "L9 · the firm", "dark", [
        n("Head of Strategies", "L7 · trading P&L", "exec", [
            n("Desk 1", "Trading pod", "plain"), n("Desk 2", "Trading pod", "plain"),
            n("Desk 3", "Trading pod", "plain"), n("Desk 4", "Trading pod", "plain"),
        ]),
        n("Head of Research", "L7 · alpha factory", "exec", [
            n("Alpha research", "Signals & backtests", "plain"), n("ML research", "Models & features", "plain"),
            n("Microstructure", "Execution & queue", "plain"), n("Portfolio optimization", "Weights & risk", "plain"),
        ]),
        n("Head of Technology / CTO", "L8 · platform & latency", "exec", [
            n("Infrastructure & co-location", "Compute, network, venues", "plain"),
            n("Low-latency / HFT", "Tick-to-trade", "plain"),
            n("Application software", "OMS, EMS, tools", "plain"),
            n("Data platform", "Tick store & pipelines", "plain"),
        ]),
        n("Head of Risk & Compliance", "L7 · independent control", "amber", [
            n("Market & liquidity risk", "Limits & stress", "plain"),
            n("Model validation", "Independent review", "plain"),
            n("Compliance & surveillance", "Rules & monitoring", "plain"),
        ]),
        n("Head of Operations", "L7 · trade lifecycle", "mid", [
            n("Trade operations", "Reconciliation & settlement", "plain"),
            n("Exchange connectivity", "Certifications & APIs", "plain"),
            n("Corporate actions", "Events & entitlements", "plain"),
        ]),
        n("Finance Lead", "L6 · books & treasury", "light", [
            n("Accounting & control", "Close & audit", "plain"),
            n("Treasury", "Cash & collateral", "plain"),
        ]),
    ])


def scaleup_org() -> Node:
    return n("CEO", "L9 · board interface", "dark", [
        n("Chief Trading Officer", "L8 · Head of Strategies", "exec", [
            n("Desk Head 1", "L6 · pods", "mid", [n("PM", "L5 · pod", "plain"), n("PM", "L5 · pod", "plain")]),
            n("Desk Head 2", "L6 · pods", "mid", [n("PM", "L5 · pod", "plain")]),
            n("Head of Execution", "L6 · venue strategy", "plain"),
        ]),
        n("Chief Scientist", "L8 · Head of Research", "exec", [
            n("Head of Alpha Research", "L6", "plain"), n("Head of ML Research", "L6", "plain"),
            n("Head of Microstructure", "L6", "plain"), n("Head of Research Engineering", "L6", "plain"),
        ]),
        n("CTO", "L8 · technology", "exec", [
            n("Head of Engineering", "L6", "plain"), n("Head of Low-Latency", "L6", "plain"),
            n("Head of Infrastructure / SRE", "L6", "plain"), n("Head of Security", "L6", "plain"),
            n("Head of Hardware / FPGA", "L6", "plain"),
        ]),
        n("CRO", "L8 · independent risk", "amber", [
            n("Head of Market Risk", "L6", "plain"), n("Head of Liquidity & Counterparty", "L6", "plain"),
            n("Head of Model Validation", "L6", "plain"), n("Head of Stress Testing", "L6", "plain"),
        ]),
        n("CFO", "L8 · capital & finance", "exec", [
            n("Head of Finance", "L6", "plain"), n("Head of Treasury", "L6", "plain"),
            n("Head of FP&A", "L6", "plain"), n("Head of Tax", "L6", "plain"),
        ]),
        n("COO", "L8 · operations", "mid", [
            n("Head of Trade Ops", "L6", "plain"), n("Head of Market Ops", "L6", "plain"),
            n("Head of Settlements", "L6", "plain"), n("Head of Vendor Management", "L6", "plain"),
        ]),
        n("CCO / GC", "L8 · compliance & legal", "amber", [
            n("Head of Compliance", "L6", "plain"), n("Head of Legal", "L6", "plain"),
            n("Head of Surveillance", "L6", "plain"),
        ]),
        n("CDO", "L8 · data", "light", [
            n("Head of Data Engineering", "L6", "plain"), n("Head of Data Governance", "L6", "plain"),
            n("Head of MLOps", "L6", "plain"),
        ]),
        n("Head of Product / Business", "L7 · platforms & partners", "light", [
            n("Product", "Internal platforms", "plain"), n("Business Development", "Exchanges & vendors", "plain"),
        ]),
    ])


def multi_org() -> Node:
    return n("CEO", "L9 · board & capital", "dark", [
        n("Global Head of Trading", "L8", "exec", [
            n("Americas", "L7 · regional", "mid", [n("Desk Head", "L6", "plain"), n("Desk Head", "L6", "plain")]),
            n("EMEA", "L7 · regional", "mid", [n("Desk Head", "L6", "plain"), n("Desk Head", "L6", "plain")]),
            n("APAC", "L7 · regional", "mid", [n("Desk Head", "L6", "plain")]),
            n("Global Execution", "L7", "plain"),
        ]),
        n("Chief Scientist", "L8 · research", "exec", [
            n("Head of Alpha", "L7", "plain"), n("Head of ML", "L7", "plain"),
            n("Head of Research Platform", "L7", "plain"), n("External Research", "L7", "plain"),
        ]),
        n("CTO", "L8", "exec", [
            n("Deputy CTO", "L7", "mid", [
                n("Engineering", "L6", "plain"), n("Low-Latency", "L6", "plain"),
                n("Infrastructure", "L6", "plain"), n("Hardware", "L6", "plain"),
            ]),
        ]),
        n("CRO", "L8", "amber", [
            n("Deputy CRO", "L7", "mid", [
                n("Market Risk", "L6", "plain"), n("Credit & Counterparty", "L6", "plain"),
                n("Liquidity Risk", "L6", "plain"), n("Model Risk", "L6", "plain"),
            ]),
        ]),
        n("CFO", "L8", "exec", [
            n("Deputy CFO", "L7", "mid", [
                n("Controller", "L6", "plain"), n("Treasurer", "L6", "plain"),
                n("FP&A", "L6", "plain"), n("Investor Relations", "L6", "plain"),
            ]),
        ]),
        n("COO", "L8", "mid", [
            n("Deputy COO", "L7", "mid", [
                n("Trade Ops", "L6", "plain"), n("Market Ops", "L6", "plain"),
                n("Settlements", "L6", "plain"), n("Business Continuity", "L6", "plain"),
            ]),
        ]),
        n("CCO", "L8", "amber", [
            n("Compliance", "L7", "plain"), n("Surveillance", "L6", "plain"),
            n("Regulatory Affairs", "L6", "plain"),
        ]),
        n("General Counsel", "L8", "exec", [
            n("Corporate Legal", "L6", "plain"), n("Litigation", "L6", "plain"),
            n("IP & Data Licensing", "L6", "plain"),
        ]),
        n("CDO", "L8", "light", [
            n("Data Engineering", "L7", "plain"), n("Data Governance", "L6", "plain"),
            n("MLOps", "L6", "plain"), n("Alternative Data", "L6", "plain"),
        ]),
        n("CISO", "L8", "amber", [
            n("Security Operations", "L6", "plain"), n("Identity & Access", "L6", "plain"),
        ]),
        n("CBO", "L8", "light", [
            n("Product", "L6", "plain"), n("Business Development", "L6", "plain"),
            n("Corporate Development", "L6", "plain"),
        ]),
    ])


def desk_org() -> Node:
    return n("Desk Head", "L5/L6 · desk P&L", "exec", [
        n("PM", "L5 · pod P&L", "mid", [
            n("Senior Trader", "L3", "plain"), n("Trader", "L2", "plain"),
            n("Embedded QR", "L3", "plain"), n("Embedded QD", "L3", "plain"),
        ]),
        n("PM", "L5 · pod P&L", "mid", [
            n("Senior Trader", "L3", "plain"), n("Trader", "L2", "plain"),
            n("Embedded QR", "L2", "plain"), n("Embedded QD", "L2", "plain"),
        ]),
        n("Desk Risk Partner", "L4 · reports to CRO", "amber"),
        n("Desk Ops Partner", "L4 · reports to COO", "light"),
    ])


def research_pod() -> Node:
    return n("Head of Research", "L6/L7 · research agenda", "exec", [
        n("Research Lead", "L4/L5 · pod", "mid", [
            n("Senior QR", "L3", "plain"), n("QR", "L2", "plain"),
            n("QR", "L2", "plain"), n("Research Analyst", "L1", "plain"),
        ]),
        n("Research Lead", "L4/L5 · pod", "mid", [
            n("Senior QR", "L3", "plain"), n("QR", "L2", "plain"),
            n("Research Analyst", "L1", "plain"),
        ]),
        n("Research Engineering Lead", "L4 · platform", "light", [
            n("Data Engineer", "L2", "plain"), n("Research QD", "L2", "plain"),
        ]),
    ])


def platform_svg() -> str:
    width, height = 1240, 640
    cols = [
        ("DATA PLANE", 30, ["Market data ingestion", "Tick / order-book store", "Reference & corporate actions", "Feature store"]),
        ("RESEARCH & SIMULATION", 330, ["Backtesting", "Simulation / replay", "ML training", "Experiment tracking"]),
        ("EXECUTION PLANE", 640, ["Order management", "Execution management", "Gateways / co-location", "FPGA / hardware"]),
        ("CONTROL PLANE", 950, ["Pre-trade risk", "Monitoring / telemetry", "Deployment / CI-CD", "Identity & access"]),
    ]
    box_w, box_h, gap = 240, 46, 18
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="Platform architecture">',
        """<style>
        .pbox{fill:var(--diagram-box,#fff);stroke:var(--diagram-stroke,#D0D5DD);stroke-width:1.2}
        .phead{fill:var(--diagram-ink,#0F2E2E)}
        .ptitle{font-family:"Segoe UI",Arial,sans-serif;font-size:12px;font-weight:700;fill:#fff}
        .plabel{font-family:"Segoe UI",Arial,sans-serif;font-size:11px;fill:var(--diagram-ink,#0F2E2E)}
        .pcap{font-family:"Segoe UI",Arial,sans-serif;font-size:10.5px;fill:var(--diagram-muted,#667085)}
        .parrow{stroke:var(--diagram-edge,#98A2B3);stroke-width:1.5;fill:none;marker-end:url(#arrow)}
        </style>
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#98A2B3"/></marker></defs>""",
    ]
    for title, x, boxes in cols:
        parts.append(f'<rect class="phead" x="{x}" y="18" width="{box_w}" height="34" rx="6"/>')
        parts.append(f'<text class="ptitle" x="{x + 12}" y="40">{esc(title)}</text>')
        for i, b in enumerate(boxes):
            y = 70 + i * (box_h + gap)
            parts.append(f'<rect class="pbox" x="{x}" y="{y}" width="{box_w}" height="{box_h}" rx="7"/>')
            parts.append(f'<text class="plabel" x="{x + 12}" y="{y + 28}">{esc(b)}</text>')

    def arrow(x1, y1, x2, y2):
        parts.append(f'<path class="parrow" d="M{x1},{y1} C{(x1+x2)//2},{y1} {(x1+x2)//2},{y2} {x2},{y2}"/>')

    arrow(270, 150, 330, 150)
    arrow(570, 150, 640, 150)
    arrow(880, 150, 950, 150)
    arrow(1070, 260, 880, 300)
    arrow(1070, 300, 570, 300)
    arrow(1070, 340, 270, 340)
    parts.append(f'<text class="pcap" x="30" y="600">Data flows left to right; the control plane is independent and cannot be bypassed by the execution path.</text>')
    parts.append("</svg>")
    return "".join(parts)


def write(name: str, root: Node, title: str, subtitle: str) -> None:
    width, height = layout(root)
    # trim width to actual depth
    max_depth = 0

    def depth(node: Node, d: int = 0) -> None:
        nonlocal max_depth
        max_depth = max(max_depth, d)
        for c in node.children:
            depth(c, d + 1)

    depth(root)
    width = MARGIN * 2 + (max_depth + 1) * (NODE_W + H_GAP) - H_GAP
    svg = svg_doc(root, title, subtitle, width, height)
    (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")
    print("wrote", OUT / f"{name}.svg", f"{width:.0f}x{height+54:.0f}")


def main() -> None:
    write("org-current", current_org(), "Current state · <100 people", "CEO over six pillars. HR removed; Operations retained. Finance is a lead role at this stage.")
    write("org-scaleup", scaleup_org(), "Scale-up · 100–250 people", "A C-suite owner and an L6 layer for every pillar. PM layer shown for trading only.")
    write("org-multi", multi_org(), "Multi-pod / multi-office · 250–500 people", "Deputy (L7) layer, regional heads, and independent control functions.")
    write("desk", desk_org(), "A trading desk · 2–5 pods", "One P&L owner per pod; embedded QR/QD; risk and ops partners report outside the desk.")
    write("research-pod", research_pod(), "A research pod", "Pods organized by research question, with shared research engineering.")
    (OUT / "platform.svg").write_text(platform_svg(), encoding="utf-8")
    print("wrote", OUT / "platform.svg")


if __name__ == "__main__":
    main()
