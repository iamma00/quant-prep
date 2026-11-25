# Contributing

Thanks for improving Quant Org OS. The project is intentionally small: a
Rust/Tauri shell, a dependency-free web frontend, and a Python content
pipeline that turns one Markdown document into the app bundle, the Excel
workbook and the printable career map.

## Ground rules

- Be precise about people and firms. This is an operating manual, not a
  collection of vibes. Claims about levels, comp or governance should be
  defensible; mark firm-specific choices as choices.
- Never add absolute compensation numbers. The framework deliberately uses
  relative bands and multipliers so it stays useful across markets and years.
- Preserve the original "Core Domains & Job Titles" and "Typical Ranks &
  Career Progression" text. Expand around it; do not replace it.
- Keep the app offline-first. A new feature must not require a network call to
  read content that is already installed.
- No frontend framework, no runtime CDN, no web fonts. The webview must render
  from local files only.

## Editing content

1. Edit `quant-org-career-framework.md` at the repository root.
2. If you add a section, keep the numbering and heading levels consistent so
   the parser can find it.
3. Regenerate the bundle and derived artefacts:

   ```bash
   python tools/build_content.py
   python tools/make_diagrams.py     # only if a diagram changed
   python tools/verify_content.py
   ```

4. If the change is user-visible, bump `CONTENT_VERSION` in
   `tools/build_content.py` and regenerate `updates/manifest.json`:

   ```bash
   python tools/make_manifest.py --notes "What changed"
   ```

5. Run the checks:

   ```bash
   node --check ui/js/app.js
   node --check ui/js/markdown.js
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

6. Open a pull request that explains the editorial change and any decisions it
   encodes. Screenshots help for UI changes.

## Editing the app

- `ui/js/app.js` — routing, views, state, updates, search. Keep it dependency
  free and prefer small pure helpers.
- `ui/js/markdown.js` — the Markdown renderer and SVG sanitizer. Treat all
  content as untrusted: no raw HTML passthrough, no event handlers, no
  external references.
- `ui/css/app.css` — design tokens at the top; components below. Test light,
  dark and sepia themes.
- `src-tauri/src/` — content store, update protocol, settings, commands. Add a
  unit test for every failure mode you handle.
- `src-tauri/resources/seed.json` is generated. Do not edit it by hand.

## Commit style

Short imperative subject (`add comp band explainer`), then a body explaining
why. One logical change per commit. Reference issues when relevant.

## Developer Certificate of Origin

By contributing you certify that you wrote the contribution or have the right
to submit it under the MIT license, and that you agree to license it under the
same terms.
