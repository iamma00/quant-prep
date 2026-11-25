# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1 | No |

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability that can affect users.
Report it privately through GitHub's
[Security → Report a vulnerability](https://github.com/iamma00/quant-prep/security/advisories/new)
form. Include the version, platform, reproduction steps and impact. We aim to
acknowledge within 72 hours and to ship a fix or mitigation within 30 days.

If the advisory form is unavailable, open a minimal issue that says only that
you have a security report and ask for a private channel.

## What the app does to reduce risk

- **No telemetry, no accounts, no analytics.** The only network request is an
  explicit content update check, initiated by the user or by the opt-in
  automatic check interval.
- **Data, not code.** Updates carry a JSON content bundle. The app never
  executes downloaded JavaScript, native code, or shell commands. The webview
  runs under a strict Content Security Policy with `script-src 'self'`.
- **HTTPS only** for remote update URLs. Plain HTTP is accepted only for
  loopback hosts, so local testing works without weakening remote safety.
- **Host allowlist.** Update manifests and bundles must come from the manifest
  host, a subscribed GitHub host, or loopback.
- **SHA-256 verification** of the whole bundle before it is handed to the
  content store, plus structural validation (schema, versions, unique chapter
  IDs, required fields, size limits).
- **Atomic install and rollback.** A failed install leaves the current bundle
  untouched. The previous bundle is retained so a bad update can be rolled
  back from Settings.
- **Size caps.** Manifests are limited to 256 KB; bundles are capped before and
  during download, and downloads abort as soon as the cap is crossed.
- **No embedded credentials** in URLs; redirects are capped and re-validated at
  every hop.
- **Least-privilege shell.** The Tauri capability file grants only the commands
  the UI needs. External links open in the system browser through a narrow
  command that accepts `http`, `https` and `mailto` only.

## What is out of scope

- Someone with write access to the update host can publish a malicious bundle.
  The hash protects integrity in transit, not the trustworthiness of the
  publisher. Protect the GitHub account and branch, and review content changes.
- Local attackers who can already modify files in your user profile or attach a
  debugger are outside the app's threat model.
- Denial of service by the update host (it can simply refuse to serve updates)
  is handled by keeping the installed bundle, not by availability guarantees.
- Third-party package vulnerabilities are tracked through Dependabot and
  `npm audit` / `cargo audit`; report anything suspicious anyway.

## Verifying a release

Every release is built by GitHub Actions from a tagged commit. You can compare
the SHA-256 of a downloaded installer with the checksums attached to the
release. The content bundle's hash is also visible in **Settings → Content** and
in the update manifest.
