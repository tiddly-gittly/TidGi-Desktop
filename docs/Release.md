# Release packaging

GitHub Releases are the source of truth for official TidGi binaries. The release workflow builds and tests each supported platform and architecture before creating a draft release.

## macOS distribution

TidGi does not currently maintain a paid Apple Developer membership or a Developer ID certificate. GitHub therefore publishes the macOS ZIP without Apple notarization, and users must approve the application themselves.

Homebrew Cask cannot sign an upstream application. It downloads the ZIP published by this repository and checks its SHA-256 hash. Because Homebrew policy does not allow a cask to require bypassing Gatekeeper, its TidGi cask cannot return to supported status unless this project later obtains a Developer ID certificate and notarizes the application.

SteamPipe also does not replace Apple code signing. Valve requires new macOS applications distributed through Steam to be notarized by Apple. Until TidGi has Apple signing capability, Steam publishing is limited to Windows and Linux.

If signing becomes available later, configure Electron Forge's `osxSign` and `osxNotarize`, import the Developer ID Application certificate in the macOS runner, and only then add a macOS Steam depot. After the first signed and notarized stable release, Homebrew's separate `disable!` declaration will still need to be removed from the Homebrew repository.

## Release checksums

Each build writes a `SHA256SUMS-<platform>-<architecture>.txt` file next to its release artifacts. The checksum generator also verifies that every expected package type exists:

- Linux: DEB and RPM
- macOS: ZIP
- Windows: EXE and MSIX

These files are uploaded to the draft GitHub Release and can be consumed by downstream package maintainers.

## Community package repositories

Homebrew Cask and AUR are maintained outside this repository.

- Homebrew uses a GitHub livecheck and BrewTestBot to follow published stable GitHub Releases.
- AUR packages are maintained by their listed AUR maintainers. AUR itself does not automatically mirror GitHub Releases.

Publishing a GitHub Release cannot push an AUR update without write access to the AUR package repository and a dedicated SSH key. If TidGi takes ownership of an AUR package later, add a separate release-published workflow that updates its `PKGBUILD` and `.SRCINFO`, runs `makepkg --verifysource` and `makepkg` in an Arch Linux environment, and only then pushes to AUR.

## Steam

The release workflow creates Steam-ready x64 depot archives for Windows and Linux and keeps them as workflow artifacts for 30 days. Steam upload is intentionally a separate, manually dispatched workflow so creating a Git tag cannot accidentally make a Steam build live.

See `docs/Publish.md` for the one-time Steamworks depot, launch-option, builder-account, repository-variable, and secret configuration. The Steam workflow uploads to an existing private beta branch for testing; promotion to Steam's default branch remains a deliberate action in Steamworks.

## macOS runner architecture mismatch

If an x64 version is built on an ARM64 runner, dugite can download ARM64 Git binaries. When users run the resulting app on an Intel Mac, it fails with `spawn Unknown system error -86 (EBADEXEC)`.

Use architecture-specific runners:

- `macos-15-intel` for x64 builds
- `macos-latest` for arm64 builds

When the Intel runner is no longer available, either use another Intel runner or set `npm_config_arch` while installing dependencies so dugite downloads binaries for the target architecture:

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
  env:
    npm_config_arch: ${{ matrix.arch }}
```

## App size reduction

dugite bundles a full Git distribution. The `packageAfterPrune` hook removes components TidGi does not use, including command symlinks, Git LFS, and Git Credential Manager. See `scripts/trimDugite.ts`; this saves approximately 40–60 MB per platform.
