# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-11-24

### Added

- **Framework document** (`quant-org-career-framework.md`): 51 sections across
  ten parts plus eight appendices, covering firm anatomy, the preserved core
  domains and ranks, a unified L0–L9 ladder, nine career tracks, C-suite
  design, governance, promotion and compensation architecture, hiring loops,
  org charts, scaling playbooks, edge cases and a decision record.
- **Excel leveling matrix** (`quant-org-leveling-matrix.xlsx`): twelve
  formula-driven sheets for levels, tracks, compensation bands, a comp builder,
  calibration, org planning, promotions, KPIs, title translation and glossary.
- **Career map** (`career-map.html`, `quant-org-career-map.pdf`,
  `quant-org-career-map.png`): a printable one-page view of the ladder, tracks
  and decision points.
- **Calibration guide** (`docs/CALIBRATION.md`): anchors, ratios, a 60-minute
  calibration agenda, a worked example, common errors and a decision record.
- **Desktop and mobile app** (Tauri 2 + Rust + vanilla HTML/CSS/JS):
  - 61 reading units: 51 numbered sections, 8 appendices, a start-here chapter
    and a closing chapter, all available offline.
  - Level explorer, track explorer with journeys, compensation builder with
    relative multipliers, six theme-aware SVG org charts with pan/zoom/
    fullscreen/export, checklists with saved progress, searchable glossary and
    full-text search palette.
  - Light, dark and sepia themes; adjustable type scale and density; reduced
    motion; remembered reading position and last view.
  - Offline-first content store with atomic updates, SHA-256 verification,
    host allowlist, size caps, rollback and reset-to-bundled.
  - Diagnostics export, update progress events, friendly boot/error states and
    a browser preview mode for reviewing the UI without a build.
- **Content pipeline** (`tools/`): Markdown parser, seed builder, diagram
  generator, Excel generator, career-map generator, manifest publisher and
  content verifier.
- **Automation**: CI for content and Rust tests, plus release workflows for
  Windows (installers and a portable zip), macOS and Android and a GitHub Pages
  web preview.

### Known limitations

- Android release signing requires your own keystore; CI produces an
  installable debug APK by default.
- The default update URL points at `iamma00/quant-prep`. Change it in
  Settings after forking.
- The framework is a design tool, not legal, tax or investment advice.
