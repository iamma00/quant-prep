# Calibrating the Framework to Your Firm

> Companion to `quant-org-career-framework.md` and `quant-org-leveling-matrix.xlsx`.
> Goal: turn a universal structure into a defensible local one — without importing another firm's hierarchy or publishing salary numbers.

---

## 1. What calibration is (and is not)

**Calibration is:** choosing the *anchors* and *ratios* that make your bands internally consistent and externally competitive.

**Calibration is not:** copying a salary survey, matching a bank's titles, or paying for tenure. The framework's ratios are the design; the anchor is local.

Three outputs from a calibration session:

1. **An L1 anchor range** — what a strong entry-level hire costs in your market, in your currency, for your business model.
2. **A band ratio table** — how much more each band is paid, expressed as a multiple of L1.
3. **A track modifier table** — how research, trading, technology, risk, operations, etc. differ in mix (base vs variable), not just level.

Record all three. Undocumented calibration becomes folklore within six months.

---

## 2. The five anchors

You do not need to price every band from scratch. Price five anchors and interpolate.

| Anchor | Band | What you are pricing | Market reference |
|---|---|---|---|
| **Entry** | L1 | A strong graduate / junior analyst who can ship with supervision | Graduate programs, junior quant/dev roles, PhD entry |
| **Senior IC** | L3 | Someone who owns a strategy or critical system end-to-end | Senior quant/dev at a comparable fund or tech firm |
| **Desk head** | L5 | A P&L owner with a team and capital budget | PM / desk head / engineering manager |
| **Function head** | L6–L7 | Owns a function or firm-wide domain | Head of Research / CTO-1 / CRO-1 |
| **C-suite** | L8–L9 | Firm-level accountability | CTO/CRO/CFO/COO, CEO/Managing Partner |

**Rule of thumb for ratios (total comp, not base):**

| Ratio | Healthy range | What it tells you |
|---|---|---|
| L3 / L1 | 2.0–3.5× | Is seniority meaningfully differentiated? |
| L5 / L3 | 1.5–2.5× | Is desk leadership paid for P&L responsibility? |
| L6 / L5 | 1.2–1.8× | Is function ownership a real step? |
| L8 / L1 | 10–20× | Is the C-suite sharing firm risk? |
| L9 / L1 | 15–30× | Is the CEO's package defensible to the board? |

If your ratios are far outside these ranges, you either have a market story (e.g., a quant trading firm competing with big tech for engineers) or a structural problem (title inflation, pay compression, or an underpaid control function).

---

## 3. The calibration inputs

Gather these before the session:

- **Reference set (5–8 firms):** same business model, same talent pools, similar scale. Do not mix a 20-person prop shop with a 5,000-person bank.
- **Data sources:** offers you have made and lost, incoming candidate expectations, alumni outcomes, published surveys, recruiter intelligence, internal attrition interviews.
- **Your P&L model:** how much value does an L3 vs L5 vs L8 create? Compensation should track value creation, not just market pressure.
- **Constraints:** cash vs equity, deferral policy, jurisdiction, regulatory comp rules, tax.
- **Decision makers:** CEO, CFO, and at least one function head who hires. Compensation philosophy is a board-level choice; do not delegate it to a spreadsheet.

---

## 4. The method (index math)

The workbook uses **L1 base = 1.00**. Total comp = base × (1 + bonus).

### Step 1 — Anchor L1

Choose a base index of 1.00 and attach a local currency range *outside* the framework (in the Calibration sheet, not in the published document).

### Step 2 — Set band ratios

Start from the framework's default total multiples:

| Band | Default total multiple | Your calibrated multiple |
|---|---|---|
| L0 | 0.35–0.45 | |
| L1 | 1.2–1.4 | 1.00 (anchor) |
| L2 | 1.6–2.3 | |
| L3 | 2.4–3.8 | |
| L4 | 3.4–5.7 | |
| L5 | 5.0–8.3 | |
| L6 | 7.0–12.9 | |
| L7 | 9.5–18.6 | |
| L8 | 13–26 | |
| L9 | 18–40 | |

### Step 3 — Choose the mix

For each band, decide the **base vs variable** split:

- **Trading / research:** higher variable, PnL-linked, deferred above L4.
- **Technology / data:** higher base, equity/LTIP, on-call premium.
- **Risk / compliance / finance:** higher base, firm-pool bonus, no desk P&L linkage (independence).
- **Operations:** higher base, reliability premium, shift allowances.

### Step 4 — Apply track modifiers

Track modifiers adjust the *level* for market pressure and the *mix* for risk. Defaults in the workbook:

| Track | Base vs firm median | Variable share |
|---|---|---|
| Research | 1.0–1.1× | Medium |
| Trading | 0.9–1.0× | High |
| Technology | 1.0–1.1× | Medium |
| Data / ML | 1.0–1.05× | Medium |
| Risk | 1.0× | Low–medium |
| Compliance / Legal | 1.0× | Low |
| Finance / Treasury | 1.0× | Low–medium |
| Operations | 0.85–0.95× | Low |
| Product / Business | 0.95–1.05× | Medium |

### Step 5 — Sanity-check

Run the four checks in the workbook:

1. Base is monotonic across bands.
2. L9 / L1 base ratio is between 4× and 10×.
3. L5 / L3 base ratio is between 1.3× and 2.0×.
4. Total comp rises with band.

Then ask the human questions:

- Would we hire an L3 at this number without a negotiation exception?
- Would an L5 leave for a competitor at this number?
- Can we explain the L8 package to the board without flinching?
- Does the risk function's package compromise its independence?
- Are we paying for luck (beta, a hot year) or for skill?

---

## 5. The 60-minute agenda

| Time | Topic | Output |
|---|---|---|
| 0–10 | Define the reference market | A named list of 5–8 firms and the talent pools you compete in |
| 10–20 | Agree the L1 anchor and L9/L1 multiple | Two numbers and the rationale |
| 20–35 | Adjust band multipliers | A calibrated band table with sanity checks passing |
| 35–45 | Review track modifiers | A modifier table with notes on attrition/hiring pressure |
| 45–55 | Stress-test two offers | One senior hire, one promotion; do the numbers tell a coherent story? |
| 55–60 | Record decisions | Owner, review date, and what would trigger a re-calibration |

**Who attends:** CEO (chair), CFO, one or two function heads, and a notetaker. No HR function required — the CFO or COO can own the process.

---

## 6. Worked example (relative units)

A firm sets L1 base = **1.00** and targets the **50th percentile** of its reference market.

- L3 base index = **1.75**; bonus target = **70%** → total = **2.98× L1**
- L5 base index = **3.0**; bonus target = **110%** → total = **6.3× L1**
- L5 / L3 = **2.1×** — inside the healthy 1.5–2.5× range.
- L8 base index = **5.8**; bonus target = **200%** → total = **17.4× L1**
- L8 / L1 = **17.4×** — inside the 10–20× range.

Now suppose a trading desk head is benchmarked against a competitor paying 30% more variable. The firm can:

1. Raise the L5 bonus cap for trading only (track modifier), or
2. Increase deferral and equity to compete on long-term value, or
3. Accept the gap and compete on platform, autonomy, and capital.

What it should **not** do is silently move the person to L6 to justify the pay. That is title inflation, and it corrupts every subsequent calibration.

---

## 7. Common calibration errors

| Error | Symptom | Fix |
|---|---|---|
| **Mixing business models** | Comparing a prop shop to a bank MD | Define the reference set by edge, scale, and talent pool |
| **Using base only** | "We pay market" but bonus is 20% of peers | Compare total comp, including deferral and equity |
| **Ignoring deferral** | Cash-heavy offers that create risk-taking incentives | Model the present value and vesting of deferred comp |
| **Paying for AUM, not P&L** | Compensation grows with assets, not risk-adjusted returns | Tie pools to net, risk-adjusted, cost-adjusted P&L |
| **Control-function capture** | Risk/compliance paid from desk P&L | Firm-level pool; independent reporting line |
| **Title inflation** | Everyone is a VP; bands stop predicting scope | Audit titles against decision rights annually |
| **Anchoring to one hire** | One expensive lateral resets the whole ladder | Calibrate to a range; treat outliers as exceptions |
| **No review date** | The table is stale within a year | Re-calibrate annually or when the market moves >10% |

---

## 8. Decision record template

```
Reference market:        [firms / cities / business models]
L1 base anchor:          [range, local currency]
L9 / L1 multiple:        [x]
Track modifiers:         [summary]
Deferral policy:         [% above L4, vesting, clawback]
Approved by:             [CEO / CFO / Board]
Review date:             [date]
Re-calibration triggers: [market move >10%, attrition >X%, new jurisdiction, new business line]
```

Store this with the board minutes. It is the answer to "why is this person paid this?" — and the defense when the answer is challenged.

---

## 9. Legal and ethical notes

- Compensation must comply with local employment, tax, and equality law. Get local counsel.
- Do not publish absolute salary figures in a document that may be shared externally.
- Pay equity reviews are a manager/CFO responsibility in this framework (HR roles are out of scope).
- Deferred comp, clawbacks, non-competes, and garden leave are jurisdiction-dependent. Enforceability varies; do not rely on a contract you cannot enforce.
- The framework is a design tool, not legal, tax, or investment advice.

---

*Version 1.0 · November 2026 · Review annually or at every scaling threshold.*
