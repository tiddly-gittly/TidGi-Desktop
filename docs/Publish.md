# Publish TidGi

## GitHub Releases

Push a version tag such as `v0.15.0`. The `Release App` workflow tests and builds the supported packages and creates a draft GitHub Release. Inspect the artifacts and checksums before publishing the draft.

The same run retains Steam-ready Windows and Linux x64 depot archives for 30 days.

## One-time Steamworks setup

SteamPipe provides content upload, encryption, distribution, beta branches, and updates. It does not provide an Apple Developer ID certificate. Valve requires new macOS applications to be notarized by Apple, so the current Steam setup deliberately publishes Windows and Linux only.

In Steamworks:

1. Note the application ID.
2. Configure two consecutive depots:
   - depot 1 (`App ID + 1`): Windows x64
   - depot 2 (`App ID + 2`): Linux x64
3. Configure launch options:
   - Windows: the TidGi `.exe` in the Windows depot, restricted to Windows
   - Linux: the `tidgi` executable in the Linux depot, restricted to Linux
4. Create a private beta branch named `prerelease`.
5. Create a dedicated Steam build account with only the permissions required to edit the app's metadata and publish app changes.

The automated workflow assumes the two depot IDs are consecutive and start at `App ID + 1`. If the Steamworks application already uses a different depot layout, update the `depot1Path`, `depot2Path`, and `firstDepotIdOverride` inputs in `.github/workflows/steam-release.yml` before the first upload.

## GitHub configuration

Add this repository variable:

- `STEAM_APP_ID`: the numeric Steamworks application ID

Add these repository secrets:

- `STEAM_USERNAME`: the dedicated Steam build account username
- `STEAM_CONFIG_VDF`: the base64-encoded Steam Guard session configuration for that account

Generate `STEAM_CONFIG_VDF` locally:

1. Install Valve's official `steamcmd`.
2. Run `steamcmd +login <builder-user> +quit` and complete Steam Guard.
3. Run the same command again and confirm it no longer asks for a code.
4. Base64-encode the generated `config/config.vdf` file and store it as `STEAM_CONFIG_VDF`.

Do not commit Steam credentials, `config.vdf`, or the Steamworks SDK.

## Uploading a build

1. Wait for a version tag's `Release App` workflow to pass.
2. Copy its numeric workflow run ID from its URL.
3. Manually run `Publish Steam Build` with:
   - that release workflow run ID
   - a build description such as `v0.15.0`
   - the private branch `prerelease`
4. Install and test the build through the Steam client on Windows and Linux.
5. Promote the tested build to the default branch from Steamworks when it is ready for customers.

The workflow never targets the default Steam branch automatically.
