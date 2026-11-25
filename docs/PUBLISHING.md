# Publishing to GitHub

This directory is already a git repository with one commit ready to push. The
defaults point at `iamma00/quant-prep`. If that is not your account, change
the owner first.

## 1. Point at your repository

```bash
python tools/set_repo.py --owner YOUR-GITHUB-NAME
python tools/make_manifest.py --check
git add -A
git commit -m "chore: point at YOUR-GITHUB-NAME/quant-org-os"
```

`--repo` changes the repository name too:

```bash
python tools/set_repo.py --owner your-org --repo quant-firm-os
```

The script updates the README link, About link, update manifest, package
metadata and test fixtures together so they cannot drift.

## 2. Create the empty repository

On GitHub: **New repository** → name `quant-org-os` → **Public** → do **not**
add a README, license or .gitignore. Then, from this directory:

```bash
git remote add origin https://github.com/YOUR-GITHUB-NAME/quant-org-os.git
git push -u origin main
```

Or with GitHub CLI:

```bash
gh repo create YOUR-GITHUB-NAME/quant-org-os --public --source=. --remote=origin --push
```

If the remote already exists:

```bash
git remote set-url origin https://github.com/YOUR-GITHUB-NAME/quant-org-os.git
```

## 3. Enable the services

- **Actions** → allow workflows. The `CI` workflow runs on the first push.
- **Settings → Pages → Build and deployment → Source: GitHub Actions** for the
  web preview.
- **Settings → Actions → General → Workflow permissions**: read and write, so
  the release job can create releases.
- Optional signing secrets (see `docs/BUILDING.md`):
  `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
  Android release signing needs a keystore and gradle changes.

## 4. Cut a release

The version must agree in `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`. Then:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow builds and attaches:

- Windows portable `.zip`, `.msi` and NSIS `-setup.exe`
- macOS universal `.dmg` (unsigned unless secrets are configured)
- Android debug-signed `.apk`
- `SHA256SUMS.txt`

It can also be started manually with a tag input. The tag must match the
versions in the three files above or the installed app will report an
unexpected version.

## 5. Verify the published app

1. Download the portable zip from the release.
2. Unpack it on a machine with no development tools.
3. Launch it with the network disconnected: content must appear.
4. Open **Settings → Content** and confirm edition `1.0.0`, source `seed`,
   hash, and a writable data path.
5. Open the Pages preview; it should load the same content read-only.
6. On a tagged build, check **About** for the repository link and version.

## 6. Publish a content update

Content and app releases are separate on purpose: a wording change should not
require a new binary.

```bash
# edit quant-org-career-framework.md or the generated structured data
python tools/build_content.py          # bump CONTENT_VERSION first
python tools/verify_content.py
python tools/make_manifest.py --notes "What changed"
git add src-tauri/resources/seed.json updates/manifest.json
git commit -m "content: v1.1.0 - what changed"
git push
```

Installed apps see the new manifest on their next check. If you need an
immediate rollout, publish the bundle under a versioned path (for example
`updates/bundles/seed-1.1.0.json`) and point the manifest at it; GitHub's raw
CDN may otherwise cache the old file for a few minutes.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Actions cannot create a release | Settings → Actions → General → Workflow permissions → Read and write. |
| Pages workflow fails | Set Pages source to **GitHub Actions**, then re-run the workflow. |
| Windows bundle fails downloading WiX/NSIS | The runner needs GitHub access. The portable zip is built from the same executable and does not need either toolchain. |
| macOS app is "damaged" | It is unsigned/not notarised. Right-click → Open, or configure Apple secrets and rebuild. |
| Android job cannot find the SDK | The workflow installs platform 35, build-tools 35 and NDK 27; check the `android-actions/setup-android` step if GitHub changes the image. |
| App says "manifest 404" | The repo is not published yet, or the manifest path/branch is wrong. Open the URL in a browser. |
| App says "hash mismatch" | Regenerate `updates/manifest.json` with `tools/make_manifest.py`; do not edit the hash by hand. |
| Update check is cached | Use **Check again** (force) in Settings, or wait for the raw CDN cache to expire. |

## What not to commit

`node_modules/`, `src-tauri/target/`, `dist/`, logs, keystores, `.env` files and
generated portable zips are ignored. Signing keys belong in repository secrets,
never in git history.
