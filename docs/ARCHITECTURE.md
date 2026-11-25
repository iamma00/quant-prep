# Architecture

Quant Org OS is deliberately boring: a static web UI, a small Rust core, and
one JSON file that contains every word and diagram. There is no server, no
database, no bundler, no JavaScript framework and no runtime dependency on the
network.

```text
┌──────────────────────────────────────────────────────────────┐
│ WebView (Tauri on desktop/Android; browser for preview)      │
│                                                              │
│ index.html ── app.js ── markdown.js ── app.css               │
│     │            │           │                               │
│     │            └── renders seed JSON, sanitises SVG         │
│     └── CSP: default-src 'self'; script-src 'self'            │
└───────────────▲──────────────────────────┬───────────────────┘
                │ invoke (IPC)             │ localStorage
┌───────────────┴──────────────────────────▼───────────────────┐
│ Rust core (Tauri)                                            │
│                                                              │
│ commands.rs ── bootstrap / content / settings / updates      │
│ content.rs  ── install, validate, atomically swap, rollback  │
│ update.rs   ── manifest, HTTPS allowlist, stream + SHA-256   │
│ settings.rs ── clamped, versioned user preferences           │
└───────────────┬──────────────────────────┬───────────────────┘
                │                          │
        app_data_dir()               included at compile time
                │                          │
   content/current/seed.json        resources/seed.json
   content/previous/seed.json       resources/diagrams/*.svg
   meta.json, settings.json
```

## Layers

### Content (the product)

`quant-org-career-framework.md` is the source of truth. `tools/framework_data.py`
parses the stable structures (levels, tracks, compensation, glossary,
checklists, chapters) and `tools/build_content.py` emits one self-contained
`seed.json`. Diagrams are generated as theme-aware SVG and embedded as strings,
so a bundle is a single file that can be hashed, downloaded and validated.

The bundle is compiled into the binary with `include_str!`. First launch copies
it to the data folder; there is no scenario in which the app needs the network
to show content.

### Rust core

| Module | Responsibility |
| --- | --- |
| `lib.rs` | Resolves the data directory, constructs shared state, registers commands. Falls back to the temp directory if the OS profile is unavailable, so a read-only profile cannot prevent the app from opening. |
| `commands.rs` | The entire IPC surface: `bootstrap`, `get_content`, `save_settings`, `check_updates`, `install_update`, `rollback_content`, `reset_content`, `open_external`, `open_data_dir`, `diagnostics`, `save_diagnostics`. Every argument is treated as untrusted. |
| `content.rs` | Seed install, bundle validation (schema, versions, unique IDs, size), atomic directory swaps, previous-version retention, rollback, recovery from corruption, meta bookkeeping. |
| `update.rs` | Manifest fetch with ETag, redirect validation at every hop, host allowlist, size caps, streaming SHA-256, install and progress events. |
| `settings.rs` | Typed preferences with clamping and URL validation. Settings are written atomically. |

The content store keeps a validated snapshot in memory and never hands the UI a
path it can write to. Directory layout:

```text
<app_data_dir>/
├── settings.json
├── meta.json                    # current/previous version, timestamps, history
└── content/
    ├── current/seed.json        # active edition
    ├── previous/seed.json       # rollback target
    └── staging/                 # transient; emptied after install
```

### Frontend

`ui/index.html` is a shell: header, sidebar, `<main>`, palette, modal host and
toast host. It loads one stylesheet, one Markdown renderer and one app module.

| File | Responsibility |
| --- | --- |
| `app.js` | Hash router, all ten views, state, persistence, update UX, search palette, diagnostics, boot. |
| `markdown.js` | A small Markdown renderer (headings, tables, lists, task lists, code, quotes, links) plus an SVG sanitiser. Content is treated as untrusted: no raw HTML, no scripts, no event attributes, no external references. |
| `app.css` | Design tokens (light/dark/sepia), layout, components, responsive and print rules. |

State is split on purpose:

- **Rust-owned**: settings and installed content. Persisted to the data folder
  and shared across windows/launches.
- **Browser-owned**: reading marks, checklist ticks, last position, expanded
  parts. Persisted in `localStorage` under `qos.*.v1` keys. These are personal
  and disposable; clearing them never touches content.

In a plain browser (GitHub Pages preview), the same UI loads `seed.json` via
`fetch`, uses `localStorage` for settings, and labels update actions as
unavailable. Nothing is conditionally compiled; the UI detects Tauri at boot.

## Boot sequence

1. `applySettings()` applies the cached theme early to avoid a flash.
2. `loadContent()` invokes `bootstrap` in Tauri, or fetches the seed in a
   browser. The Rust bootstrap validates the installed bundle, falls back to
   the previous bundle, then to the embedded seed.
3. The search index is built in memory from the seed's pre-computed blocks.
4. The shell renders, the route renders, and the document becomes visible.
5. A silent update check runs after 1.4 s if `auto_check` is on and the browser
   reports online. Failures are silent; the app is already usable.

Errors at any step are caught and shown on a boot screen with the diagnostics
path and a retry action. A blank window is never the failure mode.

## Update flow

```text
user/auto ──► check_updates ──► GET manifest (ETag-aware, ≤256 KB)
                                   │ validate schema, versions, URL, hash
                                   ▼
                              remote > current?
                                   │ yes
                                   ▼
                         install_update ── GET bundle (≤24 MB)
                                   │ stream + hash, abort on overflow
                                   ▼
                         SHA-256 match? ── no ──► abort, keep current
                                   │ yes
                                   ▼
                    validate bundle structure (schema, IDs, fields)
                                   │ fail ──► abort, keep current
                                   ▼
                    stage → rename current to previous
                          → rename staging to current
                                   │ fail ──► restore previous
                                   ▼
                         update meta, reload UI, emit progress
```

The UI receives `update:progress` events (`manifest`, `download`, `verify`,
`install`) and shows a determinate bar when the size is known. The update lock
serialises concurrent installs.

## Failure handling

| Failure | Behaviour |
| --- | --- |
| First run, no writable data dir | Falls back to the temp dir; app still opens; Settings shows the path. |
| Corrupted `current` bundle | Validates `previous`; if valid, copies it back and records the recovery in `meta.json`. |
| Both installed bundles invalid | Installs the embedded seed. |
| `meta.json` unreadable | Rebuilt from the active content; the error is logged in the diagnostics report. |
| Network offline / captive portal | Check fails with a readable message; installed content remains. |
| Manifest too large, wrong schema, bad host, bad hash format | Rejected before any download. |
| Bundle exceeds the size cap while streaming | Download aborts; nothing is staged. |
| Hash mismatch | Rejected; current and previous are untouched. |
| Disk full during write | Staging write fails; current stays active; error is surfaced. |
| Crash between renames | On next boot, `current` is missing but `previous` is valid, so recovery runs. |
| Update points to a newer app requirement | Blocked with "requires app x.y" instead of installing incompatible content. |
| User dislikes an update | Settings → roll back, or restore the bundled edition. |
| User clears app data | The next launch reinstalls the embedded seed. |

## Security boundaries

- The webview is locked by CSP: no remote scripts, styles, fonts, frames or
  connections. `connect-src` is limited to the IPC endpoint.
- The Tauri capability file exposes only the commands above; there is no
  filesystem, shell or HTTP plugin in the frontend.
- `open_external` accepts `http`, `https` and `mailto` only and uses the
  platform opener.
- Update URLs: HTTPS (HTTP only for loopback), no credentials, host allowlist,
  redirects re-checked, standard ports for remote hosts.
- The Markdown renderer does not execute raw HTML. SVG is parsed and sanitised:
  scripts, foreign objects, event handlers and external URLs are removed.
- Diagnostics contain versions, paths and error messages, never content or
  personal data; they are only written when the user asks.

## Why these choices

- **Embedded seed.** Guarantees offline first run and a recovery floor. The
  binary grows by ~500 KB, which is acceptable for the reliability it buys.
- **One JSON bundle.** Atomic, hashable, easy to host on GitHub, no migrations
  of a database, no partial file states.
- **No framework.** The UI is ten views of mostly static content. A framework
  would add build complexity and attack surface without solving a real problem.
- **Generated SVG instead of a diagram runtime.** No Mermaid/JS dependency, no
  layout flash, prints correctly, and each diagram is theme-aware via CSS
  variables.
- **Relative compensation.** Absolute numbers age badly and differ by market.
  Bands plus multipliers stay useful and avoid implying a single market's pay.

## Cross-platform notes

| Platform | Shell | Storage | Notes |
| --- | --- | --- | --- |
| Windows | WebView2 | `%APPDATA%\com.quantorg.os` | MSI + NSIS. GNU fallback documented. |
| macOS | WKWebView | `~/Library/Application Support/com.quantorg.os` | Universal binary; unsigned builds need Gatekeeper approval. |
| Android | System WebView | App-private storage | Content-only updates; APK updates via store/sideload. |
| Browser preview | Any modern browser | `localStorage` | Read-only content; no native updates. |
