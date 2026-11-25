# Offline behaviour and content updates

## The promise

The app is useful the moment it is installed, with the network unplugged.
Everything needed to read the framework — chapters, tables, checklists,
glossary, diagrams — is compiled into the binary and copied into the data
folder on first launch.

The network is used for exactly one thing: fetching a newer **content bundle**
when the user asks for it (or when the opt-in automatic check runs). There is
no telemetry, no account, no sync, no ads and no remote configuration.

## Where things live

| Platform | Data folder |
| --- | --- |
| Windows | `%APPDATA%\com.quantorg.os` |
| macOS | `~/Library/Application Support/com.quantorg.os` |
| Android | App-private storage (`app_data_dir`) |
| Browser preview | `localStorage` only |

```text
<data folder>/
├── settings.json          # theme, type scale, density, manifest URL, auto-check
├── meta.json              # active/previous version, hashes, check history, ETag
└── content/
    ├── current/seed.json  # what you are reading
    ├── previous/seed.json # rollback target
    └── staging/           # transient
```

If the OS cannot provide a profile directory, the app falls back to the
platform temp directory and says so in **Settings → Diagnostics**. It never
refuses to start because storage is unusual.

## First launch and recovery

1. If `content/current/seed.json` exists and validates, it is used.
2. Otherwise, if `content/previous/seed.json` validates, it is copied back to
   `current` and the recovery is recorded.
3. Otherwise the compiled-in seed is installed.
4. If `meta.json` is missing or unreadable, it is rebuilt from the active
   content. Settings are clamped and re-saved on the next change.

A damaged file therefore costs at most one update, not the library.

## Update protocol

The Rust side performs the whole exchange; the webview only receives JSON.

### 1. Check

`check_updates(force)` fetches the manifest URL from Settings. Unless `force`
is true, the previous `ETag` is sent as `If-None-Match`; a `304 Not Modified`
short-circuits the check.

Validation before the manifest is trusted:

- `schema_version` must be `1`.
- `content_version` and `app_min_version` must be version-like.
- `bundle_size` must be greater than zero and at most **24 MB**.
- `bundle_sha256` must be 64 hex characters.
- `bundle_url` must be HTTPS (HTTP only for loopback), contain no credentials,
  use the standard port for remote hosts, and resolve to an allowed host.
- The manifest itself is capped at **256 KB**.

`github.com`, `api.github.com`, `codeload.github.com`,
`*.githubusercontent.com`, the manifest's own host and loopback are allowed.
Redirects are limited to five and every hop is re-checked against the same
rules.

### 2. Install

`install_update()` re-fetches the manifest (no stale pointer), then streams the
bundle:

- Hard cap enforced before and during download; the transfer aborts as soon as
  the declared or actual size exceeds the limit.
- SHA-256 is computed while streaming.
- The hash must match the manifest exactly.
- The bundle is then structurally validated: schema, versions, part/chapter
  counts, unique chapter IDs, required fields, and the app's minimum version.

Only then is it staged and swapped:

```text
write staging/seed.json
  → rename current → previous
  → rename staging → current
  → update meta.json
```

If the swap fails, `previous` is restored. If the process dies between renames,
the next boot finds `current` missing and recovers from `previous`.

Progress is emitted as `update:progress` events with `phase`, `received`,
`total` and `percent`. The UI serialises installs with a lock and disables the
button while busy.

### 3. Roll back

**Settings → Content → Roll back** swaps `current` and `previous` after
validating the previous bundle. **Restore bundled edition** re-installs the
compiled-in seed. Neither touches your settings, reading marks or checklists.

## Manifest format

`updates/manifest.json` in this repository is a ready-to-publish example:

```json
{
  "schema_version": 1,
  "content_version": "1.0.0",
  "app_min_version": "0.1.0",
  "bundle_url": "https://raw.githubusercontent.com/iamma00/quant-org-os/main/src-tauri/resources/seed.json",
  "bundle_sha256": "<64 lowercase hex characters>",
  "bundle_size": 494050,
  "notes": "Initial edition: 51 sections, 8 appendices, nine tracks, ten bands.",
  "published_at": "2026-11-24T00:00:00Z"
}
```

Generate it rather than editing by hand:

```bash
python tools/make_manifest.py --notes "What changed in this edition"
```

The script reads the actual `seed.json`, computes the hash and size, and writes
`updates/manifest.json`. It refuses to publish if the bundle does not validate.

### Publishing an update

1. Edit the framework or its structured data.
2. Bump `CONTENT_VERSION` in `tools/build_content.py` (semver: content changes
   that alter meaning are at least a minor bump).
3. Rebuild:

   ```bash
   python tools/build_content.py
   python tools/verify_content.py
   ```

4. Regenerate the manifest and commit both files:

   ```bash
   python tools/make_manifest.py --notes "Added X; clarified Y"
   git add src-tauri/resources/seed.json updates/manifest.json
   git commit -m "content: v1.1.0 — added X"
   git push
   ```

5. Existing apps see the new manifest on their next check. The default URL
   points at the `main` branch; for staged rollouts use a branch or a versioned
   bundle path and change the manifest URL in Settings.

GitHub's raw CDN may serve a cached copy for a few minutes. A forced check
bypasses the app's ETag cache but not the CDN; if you need immediate rollout,
publish the bundle under a new versioned path (for example
`updates/bundles/seed-1.1.0.json`) and point the manifest at it. Any host is
allowed if it is the manifest's own host, so a self-hosted mirror works too.

## Edge cases and what happens

| Situation | Result |
| --- | --- |
| No network / airplane mode | Check fails with a clear message; reading continues. |
| Captive portal returns HTML | JSON parse fails; nothing is downloaded. |
| Manifest 404 (repo not published yet) | "Could not check" toast; no console-visible app error. |
| Remote version equals current | "Already up to date"; no download. |
| Remote version older | Treated as up to date; downgrades require rollback. |
| `app_min_version` newer than the app | Update is blocked with the required version. |
| Bad hash | Rejected; current and previous untouched. |
| Bundle truncated / connection drops | Retried once, then aborted; nothing is staged. |
| Bundle too large | Aborted before or during download. |
| Disk full | Staging write fails; current stays active. |
| Manifest URL edited to HTTP | Rejected unless the host is loopback. |
| Manifest points at an unlisted host | Rejected. |
| Redirect to an unlisted host | Rejected at that hop. |
| App crashes mid-swap | Next boot recovers the previous bundle. |
| Current bundle corrupted | Previous bundle restored automatically. |
| Previous bundle corrupted | Embedded seed installed. |
| User wants the original text | Restore bundled edition. |
| Clock is wrong | Irrelevant: versions are semantic, timestamps are informational. |
| Two windows check at once | A shared update lock serialises the operations. |
| Update installed on Android | Content updates immediately; the APK itself is updated through the store or sideload. |

## Privacy

- The update request reveals your IP address and app version to the host, as
  any HTTP request does. There is no other telemetry.
- The manifest URL is stored locally in `settings.json`.
- Diagnostics contain versions, platform, data path, content hash and error
  messages. They never contain chapter text, search queries or personal data,
  and are written only when you click **Save diagnostics**.
- Clearing local data removes reading marks, checklist ticks, expanded parts
  and cached last position. It does not delete installed content unless you
  also choose **Restore bundled edition**.

## Self-hosting

Point **Settings → Updates → Manifest URL** at any HTTPS URL you control. The
manifest and bundle may live on the same host; GitHub hosts remain allowed as
convenience. A static file server is enough:

```text
https://updates.example.com/quant/manifest.json
https://updates.example.com/quant/seed-1.1.0.json
```

The bundle URL in the manifest must be reachable over HTTPS (or HTTP on
loopback) and on the same host as the manifest, a GitHub host, or loopback.
No authentication is supported: protect the host with network policy if the
content is private.
