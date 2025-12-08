# Release App

See [.github/workflows/release.yml](.github/workflows/release.yml)

## macOS Runner Architecture Mismatch Issue

If you build x64 version on an ARM64 runner, dugite will download ARM64 git binaries. When users run the x64 app on Intel Mac, it fails with error: `spawn Unknown system error -86 (EBADEXEC)`.

Solution: Use architecture-specific runners:

- Use `macos-13` for x64 builds (free)
- Use `macos-latest` for arm64 builds (free)

See `.github/workflows/release.yml` matrix configuration.

### Future: When macos-13 is Deprecated

When GitHub fully deprecates `macos-13`, you have two options:

Option A (Simple, Costs Money):
Replace `macos-13` with `macos-15-large` in release.yml. Note that `-large` runners require GitHub Team or Enterprise plan and incur charges even for public repos.

Option B (Complex, Free):
Use npm_config_arch environment variable to force dugite download correct architecture on ARM64 runner:

```yaml
- name: Install dependencies
  run: pnpm install
  env:
    npm_config_arch: ${{ matrix.arch }}
```

This tells dugite's postinstall script which architecture to download, regardless of host machine. See `node_modules/dugite/script/config.js` for details.

## App Size Reduction

dugite bundles a full git distribution. The package contains unnecessary components for TidGi:

- 141 git command symlinks (all point to main git binary, only needed if directly invoking `git-add` instead of `git add`)
- Git LFS (13MB, TiddlyWiki wikis don't use LFS)
- Git Credential Manager + .NET runtime (26MB on macOS, TidGi embeds credentials directly in URLs)

afterPack script automatically removes these, saving approximately 40-60MB per platform. See `scripts/trimDugite.ts` for implementation details.
