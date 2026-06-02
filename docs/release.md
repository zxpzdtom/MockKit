# Release Signing

MockKit ad-hoc signs app bundles by default, so local builds do not require an Apple Developer account. Ad-hoc signing does not satisfy Gatekeeper for internet downloads, but it keeps the bundle's internal code-signing structure complete.

When Apple Developer credentials are configured, release builds use Developer ID signing for the app executables and app bundle, sign the DMG, notarize it, and staple the notarization ticket.

Required GitHub repository secrets:

- `APPLE_CERTIFICATE_BASE64`: base64-encoded Developer ID Application `.p12` certificate.
- `APPLE_CERTIFICATE_PASSWORD`: password for the `.p12` file.
- `APPLE_KEYCHAIN_PASSWORD`: temporary CI keychain password.
- `APPLE_DEVELOPER_ID_APPLICATION`: signing identity, for example `Developer ID Application: Your Name (TEAMID)`.
- `APPLE_ID`: Apple ID used for notarization.
- `APPLE_APP_PASSWORD`: app-specific password for notarization.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

Create the certificate secret with:

```bash
base64 -i DeveloperIDApplication.p12 | pbcopy
```

## Workflow

Pushes to `main` run the `CI` workflow. That workflow builds the app, packages a DMG, and uploads it as a workflow artifact for verification. It does not publish a GitHub Release, because MockKit's in-app updater treats GitHub Releases as user-facing updates.

Publish a user-facing update by pushing a version tag:

```bash
git tag v0.1.1
git push origin v0.1.1
```

The `Release` workflow builds the DMG, generates release notes from commits since the previous tag, creates or updates the GitHub Release, and uploads the DMG. The app discovers this release through GitHub's releases feed.

If the Apple secrets are missing, the workflow still builds and uploads a DMG containing an ad-hoc signed app bundle. Users may still need to right-click and choose Open the first time.

For local update testing, build an older app version through an environment variable instead of editing package versions:

```bash
APP_VERSION=0.0.0 pnpm mac:build
open dist/MockKit.app
```
