# Release QA checklist

Run this before tagging a release. It combines automated checks with the
manual cases that unit tests cannot cover (real webviews, real networks, real
installers). Mark each item with the build under test.

## 0. Automated gates

- [ ] `python tools/verify_content.py` — content, counts, hash, diagrams.
- [ ] `node --check ui/js/app.js` and `node --check ui/js/markdown.js`.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` — 12 tests pass.
- [ ] `npm run build` completes on Windows; macOS and Android jobs are green.
- [ ] `tools/make_portable.ps1` produces a zip that launches on a clean profile.
- [ ] `updates/manifest.json` matches `src-tauri/resources/seed.json`
      (`python tools/make_manifest.py --check`).
- [ ] No secrets, keystores or signing files in `git status`.

## 1. First run, no network

- [ ] Unplug the network or enable airplane mode before launching.
- [ ] App opens to Home with content visible; no error dialog.
- [ ] **Settings → Content** shows the edition, source `seed`, hash and path.
- [ ] Read three chapters; diagrams render; tables are readable.
- [ ] Close and relaunch: last view and reading position are restored.
- [ ] Toggle theme (system/light/dark/sepia), type scale, density; relaunch and
      confirm they persist.
- [ ] Enable reduced motion; transitions are suppressed.

## 2. Navigation and reading

- [ ] Every sidebar destination opens: Home, Read, Levels, Tracks, Comp, Org,
      Checklists, Glossary, Settings, About.
- [ ] Deep links work: `#/read/ch-38`, `#/read/app-b`, `#/comp?band=5&track=research&perf=1.2`.
- [ ] Previous/next chapter buttons follow document order, including appendices
      and closing.
- [ ] Mark-as-read persists and the progress counter matches.
- [ ] Tables do not overflow on a 360 px viewport; code blocks scroll.
- [ ] Links inside chapters open the system browser, never in-app navigation
      away from the app.
- [ ] Browser back/forward behaves like route history.

## 3. Search

- [ ] `Ctrl/⌘ K` and `/` open the palette; `Esc` closes it.
- [ ] Queries find chapter titles, headings and body text.
- [ ] Arrow keys and Enter navigate results; the target scrolls to the block.
- [ ] Unicode and punctuation queries do not throw.
- [ ] Empty query shows recent/valuable suggestions rather than a blank panel.
- [ ] Search works offline (it is local).

## 4. Levels, tracks, compensation

- [ ] All ten bands render with mission, scope, ownership and promotion.
- [ ] Compare-levels opens and is keyboard operable.
- [ ] All nine tracks open; each shows ten ladder rows, branches, lateral
      moves, failure modes and narrative.
- [ ] Comp builder updates base/bonus/LTI/total when band, track or performance
      changes.
- [ ] Deep-linked comp state matches the controls and URL.
- [ ] No absolute salary figures appear anywhere in content or workbook.

## 5. Org charts

- [ ] Six diagrams render, including the tall multi-pod chart.
- [ ] Tall charts open focused on the root, not as an unreadable thumbnail.
- [ ] Pan with drag; zoom with wheel/buttons; Fit all; Focus root.
- [ ] Fullscreen opens and closes with `Esc`; focus stays usable.
- [ ] Download produces a valid `.svg` that opens in a browser.
- [ ] Print preview includes the chart and not the app chrome.
- [ ] Diagrams are legible in light, dark and sepia themes.

## 6. Checklists and glossary

- [ ] Ticking items persists across relaunch.
- [ ] Progress counts and reset work, with confirmation.
- [ ] Glossary filter finds terms; A–Z grouping is correct.
- [ ] Deep links to glossary terms scroll and highlight.

## 7. Settings and content lifecycle

- [ ] Manifest URL rejects `http://` remote URLs, `file:`, credentials and
      non-loopback IPs with a readable message.
- [ ] Loopback HTTP is accepted for local testing.
- [ ] **Check for updates** with the network off shows a friendly error and
      leaves content intact.
- [ ] With a valid newer manifest: update available, notes and size shown.
- [ ] Install shows progress, then the new version; hash/path update.
- [ ] Install a deliberately corrupted bundle (changed hash or malformed JSON):
      rejected, current version unchanged.
- [ ] Install a bundle with `app_min_version` in the future: blocked with the
      required version.
- [ ] Roll back returns to the previous edition; roll back again is refused
      when no previous exists.
- [ ] Restore bundled edition reinstalls the compiled-in content.
- [ ] Kill the app during a download; relaunch has intact content and no
      half-written files.
- [ ] Delete `content/current/seed.json`; relaunch recovers from previous.
- [ ] Delete both installed bundles; relaunch restores the seed.
- [ ] Corrupt `meta.json`; relaunch still opens and rebuilds it.

## 8. Diagnostics and privacy

- [ ] Diagnostics show app version, platform, data path, content hash, settings
      and last error.
- [ ] Copy and Save diagnostics work; the saved file is readable.
- [ ] No chapter text, search query or personal data appears in diagnostics.
- [ ] Clearing local data removes reading marks/checklists but not content.

## 9. Desktop platform matrix

| Case | Windows 10/11 | macOS 13+ | Notes |
| --- | --- | --- | --- |
| Launch from installer | [ ] | [ ] | SmartScreen/Gatekeeper expectations documented |
| High DPI / 150% scaling | [ ] | [ ] | No clipped labels |
| 360 px narrow window | [ ] | [ ] | Mobile layout activates |
| Fullscreen / maximize | [ ] | [ ] | Layout reflows |
| Keyboard only | [ ] | [ ] | Focus visible, no traps |
| Screen reader smoke test | [ ] | [ ] | Buttons and headings announced |
| Print / Save as PDF | [ ] | [ ] | Reader and org chart |
| Sleep/resume | [ ] | [ ] | No blank webview |

## 10. Android

- [ ] Install the APK on a phone/emulator (Android 7+).
- [ ] First run offline shows content.
- [ ] Bottom tabs / navigation work; no hover-only controls.
- [ ] Rotation and split-screen reflow without losing state.
- [ ] Pinch-zoom in the org viewer; system back closes overlays first.
- [ ] Share/export actions use Android's sheet.
- [ ] App data clear restores the embedded seed.
- [ ] Update check over mobile data respects the size and error paths.
- [ ] APK is signed and installable; version code increases per release.

## 11. Accessibility and content quality

- [ ] Keyboard focus visible on every interactive element.
- [ ] Colour contrast meets WCAG AA for body text in all themes.
- [ ] Images/diagrams have accessible names; decorative SVGs are labelled.
- [ ] No heading-level skips in rendered chapters.
- [ ] Links have descriptive text (no bare "click here").
- [ ] `prefers-reduced-motion` is honoured.
- [ ] Spell-check chapter titles, headings, tables and glossary.

## 12. Release packaging

- [ ] Version bumped in `package.json`, `src-tauri/Cargo.toml`,
      `src-tauri/tauri.conf.json` and `CHANGELOG.md` (must match).
- [ ] `CONTENT_VERSION` bumped when content changed; manifest regenerated.
- [ ] Release notes mention content version and app version.
- [ ] Installers and checksums uploaded to the GitHub release.
- [ ] macOS build signed/notarised or explicitly labelled unsigned.
- [ ] Android APK labelled debug/release and signed by the expected key.
- [ ] A clean machine installs, launches offline and shows the current edition.
