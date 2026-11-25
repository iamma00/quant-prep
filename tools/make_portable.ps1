# Assemble a portable Windows build without the WiX/NSIS toolchains.
#
# The output is a zip containing the optimized executable, the license, and a
# short read-me. It runs in place; no installer or admin rights are required.
# WebView2 must already be present (Windows 11 and up-to-date Windows 10 have
# it). Use `npx tauri build` for MSI/NSIS installers.

param(
    [string]$Configuration = "release",
    [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$exe = Join-Path $root "src-tauri\target\$Configuration\quant-org-os.exe"
if (-not (Test-Path $exe)) {
    throw "Missing $exe. Run 'npm run build' or 'cargo build --release' first."
}

$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("quant-org-os-portable-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Copy-Item $exe (Join-Path $staging "QuantOrgOS.exe")
# Tauri places WebView2Loader.dll next to the executable; MinGW builds may add
# runtime DLLs. Ship every DLL beside the exe so the portable copy is complete.
Get-ChildItem (Split-Path $exe -Parent) -Filter "*.dll" -File | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $staging $_.Name)
}

foreach ($file in @("LICENSE", "README.md", "docs\OFFLINE-AND-UPDATES.md")) {
    $source = Join-Path $root $file
    if (Test-Path $source) {
        $name = Split-Path $source -Leaf
        Copy-Item $source (Join-Path $staging $name)
    }
}

@"
Quant Org OS $version - portable Windows build
==============================================

Run QuantOrgOS.exe. Nothing is installed; settings and content live in
%APPDATA%\com.quantorg.os. The app works offline on first launch.

Requirements
  - Windows 10 or 11, 64-bit.
  - WebView2 Runtime. It ships with Windows 11 and current Windows 10; if the
    app shows a blank window, install the Evergreen runtime from Microsoft.

Updates
  - Content updates are checked from Settings, or automatically if enabled.
  - The portable executable itself is replaced by downloading a newer zip.
    Your data folder is untouched.

Verify this download against SHA256SUMS.txt in the release.
License: MIT. See LICENSE.
"@ | Set-Content (Join-Path $staging "README-PORTABLE.txt") -Encoding UTF8

$out = Join-Path $root $OutDir
New-Item -ItemType Directory -Path $out -Force | Out-Null
$zip = Join-Path $out "quant-org-os-$version-windows-portable.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $staging -Recurse -Force

$hash = ""
$sha = [System.Security.Cryptography.SHA256]::Create()
$stream = [System.IO.File]::OpenRead($zip)
try {
    $bytes = $sha.ComputeHash($stream)
    $hash = ([System.BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
} finally {
    $stream.Dispose()
    $sha.Dispose()
}
$size = (Get-Item $zip).Length
Write-Output "wrote $zip"
Write-Output ("  size   {0:N0} bytes" -f $size)
Write-Output "  sha256 $hash"
