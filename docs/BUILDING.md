# Building Quant Org OS

The app is a Tauri 2 shell with a Rust backend and a plain HTML/CSS/JS
frontend. Nothing is bundled or transpiled: `tauri.conf.json` points
`frontendDist` at `ui/`, and `npm` is used only to install the Tauri CLI.

All commands below assume the repository root.

```text
npm ci
npm test
npm run build
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Desktop dev build with a native window. |
| `npm run build` | Optimized desktop build + installer/bundle. |
| `npm run build:app` | Optimized executable without installer tooling. |
| `npm run build:portable` | Executable + portable Windows zip, no WiX/NSIS. |
| `npm run build:debug` | Debug desktop build, faster, larger. |
| `npm test` | Rust unit tests (content store, updates, settings). |
| `npm run verify` | Validate the document, bundle, counts and hashes. |
| `npm run manifest` | Regenerate `updates/manifest.json` from the bundle. |
| `npm run portable` | Assemble the portable Windows zip from an existing build. |
| `npm run check` | `cargo check` without linking a bundle. |
| `npm run content` | Rebuild `src-tauri/resources/seed.json`. |
| `npm run diagrams` | Regenerate the six SVG diagrams. |
| `npm run excel` | Regenerate the leveling workbook. |
| `npm run map` | Regenerate the career map (HTML/PDF/PNG). |
| `npm run android:init` | Scaffold `src-tauri/gen/android` (once). |
| `npm run android:build` | Build Android (AAB by default; pass `-- --apk`). |

Release artefacts land in:

- `src-tauri/target/release/quant-org-os.exe`
- `dist/quant-org-os-<version>-windows-portable.zip`
- `src-tauri/target/release/bundle/msi/*.msi`
- `src-tauri/target/release/bundle/nsis/*-setup.exe`
- `src-tauri/target/release/bundle/dmg/*.dmg`
- `src-tauri/target/release/bundle/macos/*.app`
- `src-tauri/gen/android/app/build/outputs/apk/...`

## Windows

### Recommended: MSVC

1. Install **Visual Studio Build Tools** with *Desktop development with C++*,
   including the Windows 10/11 SDK and the MSVC v143 toolset.
2. Install Rust: <https://rustup.rs> (`stable-x86_64-pc-windows-msvc`).
3. Install Node 20+.
4. WebView2 is present on Windows 10/11. On older images install the Evergreen
   WebView2 Runtime.
5. Run:

   ```powershell
   npm ci
   npm run build
   ```

The generated `.msi` and NSIS `-setup.exe` are both produced because
`bundle.targets` is `"all"`. Building installers downloads the WiX/NSIS
toolchains on first use and therefore needs network access once. If that
download is unavailable, use the portable build instead:

```powershell
powershell -ExecutionPolicy Bypass -File tools/make_portable.ps1
# dist/quant-org-os-<version>-windows-portable.zip
```

### Fallback: GNU toolchain

This repository was also built with the Windows GNU toolchain when the MSVC
Windows SDK was unavailable. It works, but MSVC is the better distribution
path. Prerequisites:

- [MSYS2](https://www.msys2.org/) with the UCRT64 environment:

  ```bash
  pacman -S --needed mingw-w64-ucrt-x86_64-gcc
  ```

- Rust target `x86_64-pc-windows-gnu`, Node 20+, WebView2 Runtime.

Build with the MSYS2 binutils ahead of the MSVC linker:

```powershell
rustup toolchain install stable-x86_64-pc-windows-gnu --profile minimal
$env:PATH = "C:\msys64\ucrt64\bin;" + $env:PATH
npx tauri build
```

`tools/cargo-gnu.cmd` does the same for direct Cargo commands:

```powershell
cmd /c tools\cargo-gnu.cmd test --manifest-path src-tauri/Cargo.toml
```

Two Windows-GNU details are intentional and should not be "cleaned up":

- **`.cargo/config.toml`** passes `-Wl,--exclude-all-symbols` for
  `x86_64-pc-windows-gnu`. The library is a `cdylib` (needed by mobile
  targets); MinGW otherwise tries to export every reachable Rust symbol and
  fails with `export ordinal too large`.
- **`src-tauri/build.rs` + `test.manifest`** embed the common-controls v6
  manifest into *all* linkable targets. `tauri-build` only attaches it to the
  app binary; without it, `cargo test` binaries load `comctl32` v5, miss
  `TaskDialogIndirect` (imported by `tao`) and abort with
  `STATUS_ENTRYPOINT_NOT_FOUND`.

## macOS

1. Install Xcode Command Line Tools: `xcode-select --install`.
2. Install Rust: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.
3. Node 20+.
4. Build a universal app:

   ```bash
   npm ci
   npx tauri build --target universal-apple-darwin
   ```

Unsigned builds are blocked by Gatekeeper on first launch. For local use:
right-click the `.app` → **Open**, or remove the quarantine attribute:

```bash
xattr -dr com.apple.quarantine "/Applications/Quant Org OS.app"
```

For distribution, sign with a Developer ID certificate and notarize. Set
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` in the release workflow
environment; Tauri's bundler picks them up.

## Android

Requirements:

- JDK 17 (`JAVA_HOME` set).
- Android Studio or command-line tools with:
  - Android SDK platform 34+ and Build Tools,
  - NDK **27.x** (Tauri 2's supported line),
  - `ANDROID_HOME` and `NDK_HOME`/`ANDROID_NDK_HOME` pointing at them.
- Rust targets:

  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi \
      i686-linux-android x86_64-linux-android
  ```

- Node 20+.

Scaffold once:

```bash
npm run android:init
```

This creates `src-tauri/gen/android`, which should be committed if you generate
it locally. The release workflow runs `npx tauri android init` automatically
when the directory is absent, so a clone without the scaffold can still build
the APK in CI. Then:

```bash
npm run android:build -- --apk --debug   # installable debug APK
npm run android:build -- --apk           # release APK (needs signing)
```

Tauri writes a debug-signed APK for `--debug`, which is what the CI workflow
publishes. A release APK/AAB must be signed with your keystore:

1. Generate a keystore:

   ```bash
   keytool -genkey -v -keystore quant-org-os.keystore -alias quantorg \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add a `signingConfigs` block to
   `src-tauri/gen/android/app/build.gradle.kts` and point the release build at
   it. Keep the keystore and passwords out of git; inject them from CI secrets
   or a local `keystore.properties` (already ignored).
3. Build with `npm run android:build -- --apk`.

The Android app uses the same embedded seed and the same data folder semantics
(`app_data_dir` maps to the app's private storage). Updates are content-only;
store releases for the APK itself. Android's WebView must be reasonably current;
the minimum SDK is 24.

## Linux (unsupported but close)

Tauri supports Linux, but this project does not test or ship it. You need
`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` and
`patchelf`, then `npm run build`. Release workflows intentionally cover only
Windows, macOS and Android.

## Reproducing the content and documents

The app bundle, workbook and career map are generated. A fresh clone can
rebuild them:

```bash
python -m pip install openpyxl pillow reportlab matplotlib
python tools/make_diagrams.py
python tools/build_content.py
python tools/make_excel.py
python tools/make_career_map.py
python tools/verify_content.py
```

`tools/build_content.py` reads `quant-org-career-framework.md` from the
repository root. The framework document is the single source of truth;
generated files should not be edited by hand.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `link.exe not found` | MSVC toolchain without Visual Studio Build Tools. Install the C++ workload or use the GNU fallback. |
| `export ordinal too large` | Missing the `--exclude-all-symbols` linker flag in `.cargo/config.toml`, or an editor deleted the file. |
| Test exe exits with `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139) | The common-controls v6 manifest was not linked. Keep `test.manifest`, `test-manifest.rc` and the `embed-resource` build dependency. |
| Blank white window | WebView2 Runtime missing or blocked. Install the Evergreen runtime; check `msedgewebview2.exe` is allowed by policy. |
| `404` on the default update URL before the repo is published | Expected. Publish `updates/manifest.json` or change the manifest URL in Settings. |
| Update check says "manifest uses schema 1" | You published an incompatible manifest. Use `tools/make_manifest.py`. |
| `tauri android init` fails: SDK/NDK not found | Set `ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME`; install NDK 27. |
| Android build fails on `aarch64-linux-android` | `rustup target add` for all four Android targets. |
| App opens with stale content after an update | Settings → Content → **Roll back** or **Restore bundled edition**; diagnostics show the active path and hash. |
| Build works but data folder is in Temp | The OS profile was unavailable, so the app fell back to the temp directory. Settings shows the real path. |
