# The 59 core documents

The framework is one canonical Markdown file, but it contains **59 core
documents**: 51 numbered sections plus 8 appendices. The app wraps them with a
start-here page and a closing note, which is why it reports **61 reading
units**.

Every core document is present in:

- `quant-org-career-framework.md` (canonical text)
- `src-tauri/resources/seed.json` (offline app bundle)
- the reader in the app (`#/read/ch-1` ... `#/read/ch-51`,
  `#/read/app-a` ... `#/read/app-h`)

## 51 numbered sections

| # | Section | Part |
| --- | --- | --- |
| 1 | The <100-person algo trading firm | I. Firm anatomy |
| 2 | Scaling stages: 100-250 and 250-500 | I. Firm anatomy |
| 3 | Ten design principles | I. Firm anatomy |
| 4 | Research & Strategy | II. Core domains |
| 5 | Trading & Portfolio Management | II. Core domains |
| 6 | Software, Low-Latency & Hardware Engineering | II. Core domains |
| 7 | Data, Risk & Control | II. Core domains |
| 8 | Operations & Corporate Functions | II. Core domains |
| 9 | Product & Business | II. Core domains |
| 10 | Why one ladder | III. Leveling |
| 11 | The ten bands at a glance | III. Leveling |
| 12 | Band-by-band definitions | III. Leveling |
| 13 | Title translation matrix | III. Leveling |
| 14 | Time-in-level and promotion philosophy | III. Leveling |
| 15 | Research track | IV. Career journeys |
| 16 | Trading track | IV. Career journeys |
| 17 | Technology track | IV. Career journeys |
| 18 | Data & ML Engineering track | IV. Career journeys |
| 19 | Risk & Model Validation track | IV. Career journeys |
| 20 | Compliance & Legal track | IV. Career journeys |
| 21 | Finance & Treasury track | IV. Career journeys |
| 22 | Operations track | IV. Career journeys |
| 23 | Product & Business track | IV. Career journeys |
| 24 | The CEO | V. Executive design |
| 25 | The functional C-suite | V. Executive design |
| 26 | Minimum-viable vs scaled C-suite | V. Executive design |
| 27 | CEO succession and founder transitions | V. Executive design |
| 28 | Product & Business leadership | V. Executive design |
| 29 | The executive team operating cadence | V. Executive design |
| 30 | Committees and their charters | VI. Governance |
| 31 | RACI for the decisions that matter | VI. Governance |
| 32 | Strategy lifecycle and capital allocation | VI. Governance |
| 33 | Risk limits, model risk, and incidents | VI. Governance |
| 34 | Separation of duties | VI. Governance |
| 35 | Performance philosophy by track | VII. Performance |
| 36 | The promotion process and calibration committee | VII. Performance |
| 37 | The IC vs management dual track | VII. Performance |
| 38 | Compensation architecture (relative) | VII. Performance |
| 39 | Retention, deferrals, clawbacks, and garden leave | VII. Performance |
| 40 | Underperformance and exits | VII. Performance |
| 41 | Loop design by track | VIII. Hiring |
| 42 | Entry points and level calibration | VIII. Hiring |
| 43 | Scorecards and the hiring bar | VIII. Hiring |
| 44 | Current state (<100 people) | IX. Org charts |
| 45 | Scale-up (100-250 people) | IX. Org charts |
| 46 | Multi-pod / multi-office (250-500 people) | IX. Org charts |
| 47 | Internal views: desk, research pod, platform | IX. Org charts |
| 48 | When to add each C-suite role | X. Scaling |
| 49 | Business-model variants | X. Scaling |
| 50 | Multi-office, remote/hybrid, and regulatory notes | X. Scaling |
| 51 | Anti-patterns | X. Scaling |

## 8 appendices

| ID | Appendix | Use |
| --- | --- | --- |
| A | One-page cheat sheet | Print the whole framework on one page |
| B | Level & title glossary | Resolve title inflation across firm types |
| C | Promotion packet template | Assemble evidence for a calibration committee |
| D | 90-day onboarding plans | Onboard an L3-L7 hire by track |
| E | Interview question bank | Build a loop without reusing brainteasers |
| F | KPI dictionary | Define metrics precisely enough to compare |
| G | Further reading | Go deeper on microstructure, org design, risk |
| H | Original source text | The user's original domains and ranks, verbatim |

## Reading paths

| Reader | Start | Then |
| --- | --- | --- |
| New hire / IC | 1, 4-9, 10-14 | Your track in 15-23, then 35-37 |
| New manager | 11-14, 24-25, 29 | 30-34, 36-37, 40 |
| Founder / CEO | 1-3, 24-29 | 30-34, 38-39, 44-51 |
| Compensation / finance | 11-14, 35-39 | Appendix C and the workbook |
| Recruiter (non-HR, hiring manager) | 10-14, 41-43 | The relevant track in 15-23 |
| Auditor / risk / compliance | 7, 19-20, 30-34 | 50, Appendix F |

## App coverage

| App view | Core documents |
| --- | --- |
| Home | Navigation, statistics, reading paths |
| Read | All 59, plus start-here and closing |
| Levels | 10-14 |
| Tracks | 15-23 |
| Comp | 35-39 |
| Org | 44-47 |
| Checklists | 36, 30-34, Appendix C |
| Glossary | Appendix B (67 terms) |
| Search | All 61 reading units |

## Counts are enforced

`tools/verify_content.py` fails the build if the document no longer has 51
sequential sections and appendices A-H, if a chapter is empty, if a chapter id
is duplicated, or if the bundle's hash/size does not match. CI runs it on every
push. The counts are also printed at build time:

```text
51 numbered sections + 8 appendices = 59 core documents
+ start-here + closing = 61 reading units
```
