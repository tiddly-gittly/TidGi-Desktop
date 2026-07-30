# Release packaging

GitHub Releases are the source of truth for official TidGi binaries. The release workflow builds and tests each supported platform and architecture before creating a draft release.

## macOS signing and notarization

Homebrew requires downloadable apps to pass macOS Gatekeeper checks. A public macOS release therefore needs both a Developer ID signature and Apple notarization.

The tag release workflow requires these repository secrets:

- `MAC_CERT_BASE64`: base64-encoded Developer ID Application `.p12` certificate and private key
- `MAC_CERT_PASSWORD`: password used when exporting the `.p12`
- `APPLE_ID`: Apple Developer account email
- `APPLE_ID_PASSWORD`: app-specific password for the Apple ID, not the normal account password
- `APPLE_TEAM_ID`: Apple Developer team identifier

Pull request builds do not use signing credentials. On a tag build, missing credentials fail the release preflight instead of publishing an unsigned macOS archive.

After the first signed and notarized stable release, the Homebrew cask's `disable!` declaration still needs to be removed in Homebrew's repository. Homebrew's livecheck/BrewTestBot can then continue updating later stable releases automatically.

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

## macOS runner architecture mismatch

If an x64 version is built on an ARM64 runner, dugite can download ARM64 Git binaries. When users run the resulting app on an Intel Mac, it fails with `spawn Unknown system error -86 (EBADEXEC)`.

Use architecture-specific runners:

- `macos-15-intel` for x64 builds
- `macos-latest` for arm64 builds

When the Intel runner is no longer available, either use another Intel runner or set `npm_config_arch` while installing dependencies so dugite downloads binaries for the target architecture:

```yaml
- name: Install dependencies
  run: pnpm install
  env:
    npm_config_arch: ${{ matrix.arch }}
```

## App size reduction

dugite bundles a full Git distribution. The `packageAfterPrune` hook removes components TidGi does not use, including command symlinks, Git LFS, and Git Credential Manager. See `scripts/trimDugite.ts`; this saves approximately 40–60 MB per platform.
