# Publish

Add a tag like `vx.x.x` to a commit, and push it to the origin, Github will start building App for all three platforms.

After Github Action completed, you can open Releases to see the Draft release created by Github, add some comment and publish it.

## Windows Package Manager (WinGet)

WinGet uses the existing Squirrel EXE installers from a stable GitHub Release; it does not require a Microsoft Store account or an MSIX certificate.

The first version must be submitted interactively with Microsoft's WinGet Manifest Creator so the package metadata can be reviewed:

```powershell
winget install --id Microsoft.WingetCreate --exact
wingetcreate new https://github.com/tiddly-gittly/TidGi-Desktop/releases/download/v<VERSION>/Install-TidGi-Windows-x64.exe https://github.com/tiddly-gittly/TidGi-Desktop/releases/download/v<VERSION>/Install-TidGi-Windows-arm64.exe
```

Use a stable package identifier, recommended as `TidGi.TidGi`, and include both x64 and ARM64 installer URLs. After the first manifest pull request is merged, configure automatic updates:

Repository variables:

- `WINGET_PUBLISH_ENABLED`: set to `true` only after the first WinGet package is accepted
- `WINGET_PACKAGE_ID`: the accepted package identifier, for example `TidGi.TidGi`

Repository secret:

- `WINGET_GITHUB_TOKEN`: a classic token with `public_repo` scope from a dedicated GitHub bot account that can fork and submit pull requests to `microsoft/winget-pkgs`

`Publish WinGet Update` runs when a non-prerelease GitHub Release is published. It validates both installers and asks `wingetcreate` to open the update pull request. It can also be dispatched manually for recovery. Do not enable it before the initial package exists.

## Microsoft Store MSIX

The Microsoft Store signs an accepted MSIX. TidGi does not need to buy a separate Windows code-signing certificate for packages distributed by the Store.

Unsigned MSIX files are not published as GitHub Release downloads because Windows will reject them on normal user devices. GitHub Releases continue to publish the EXE installers; the MSIX is built specifically for Store submission and becomes trusted through Store signing.

One-time manual steps for an Individual Partner Center account:

1. Start registration from `storedeveloper.microsoft.com`, choose **Individual**, complete identity verification, and accept the agreements.
2. Reserve the TidGi app name and create the product in Partner Center.
3. Open the product identity page and copy its Package/Identity/Name, Package/Identity/Publisher, publisher display name, and Store product ID.
4. Create or associate a Microsoft Entra application for Store submission API access and grant it access to the Partner Center account.
5. Create a client secret for that Entra application.
6. Complete the Store listing, privacy, age-rating, support, and compliance fields manually before the first submission.

Repository variables copied from Partner Center:

- `MSIX_PACKAGE_IDENTITY`: Package/Identity/Name
- `MSIX_PUBLISHER`: Package/Identity/Publisher, usually a `CN=...` value; it must match exactly
- `MSIX_PUBLISHER_DISPLAY_NAME`: the Partner Center publisher display name
- `MSSTORE_PRODUCT_ID`: the Store product ID

Repository secrets:

- `MSSTORE_TENANT_ID`: Microsoft Entra tenant ID
- `MSSTORE_SELLER_ID`: Partner Center seller ID
- `MSSTORE_CLIENT_ID`: submission API application/client ID
- `MSSTORE_CLIENT_SECRET`: submission API client secret

After all fields are present, manually run `Publish Microsoft Store MSIX` with a published stable version tag. The workflow checks out that exact tag, creates an unsigned x64 MSIX whose identity matches Partner Center, and uploads it through Microsoft's Store CLI. Microsoft certification and Store signing happen after submission.

The Store workflow is deliberately manual. It cannot register the personal account, accept legal agreements, reserve the app name, or complete identity verification on the account owner's behalf.
