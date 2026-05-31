<p align="center">
  <img src="./assets/AppIcon.png" alt="MockKit icon" width="96" height="96">
</p>

<h1 align="center">MockKit</h1>

<p align="center">
  A native-feeling macOS workspace for managing Chrome DevTools Local Overrides.
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文文档</a> ·
  <a href="https://github.com/zxpzdtom/MockKit/issues">Feedback</a> ·
  <a href="./LICENSE">License</a>
</p>

MockKit helps frontend developers turn Chrome Local Overrides into a manageable mock workspace. It scans an Overrides folder, groups endpoints, keeps multiple response cases per endpoint, and publishes the active case back to Chrome without running a proxy.

The app does not hook `fetch` or `XMLHttpRequest`. It manages files in the Chrome Overrides folder directly.

## Highlights

- **Chrome Overrides workspace** for binding, scanning, editing, and publishing mock files.
- **Endpoint groups** with tree and list views for keeping large Overrides folders readable.
- **Multiple response cases** per endpoint, including quick switching and publish workflows.
- **cURL import** for creating endpoints from browser or proxy captures.
- **AI helpers** for endpoint naming, response generation, and business-domain grouping.
- **Chinese / English UI** with local preference storage.
- **Theme presets** built from shadcn-style tokens.
- **CLI support** for scanning, importing, editing, switching cases, publishing, and disabling mocks from terminal scripts.
- **Local-first storage**. App data and API keys are stored locally by default.

## How It Works

MockKit writes a hidden manifest into the Overrides folder:

```text
.mockkit-manifest.json
```

The manifest records files managed by MockKit so disabling or publishing mocks does not delete unrelated files in the same Overrides folder.

By default, development examples target:

```text
/Users/tom/Desktop/mock
```

You can choose another Overrides folder from the app.

## Chrome Setup

1. Open Chrome DevTools.
2. Go to `Sources` -> `Overrides`.
3. Select your Overrides folder.
4. Allow Chrome to access the folder.
5. Use MockKit to scan, edit, and publish response cases.

Chrome applies Local Overrides only while DevTools is open for the current page.

## Development

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts Vite at `http://127.0.0.1:5173` and launches the macOS shell with `MOCKKIT_FRONTEND_DEV_SERVER` set. Frontend changes update through Vite HMR without rebuilding the app bundle.

Swift or Rust changes still require restarting the dev process.

## CLI

Build the CLI during development:

```bash
cargo build
```

Run commands directly from the debug binary:

```bash
./target/debug/mockkit status
./target/debug/mockkit list
./target/debug/mockkit show "example.com/api/users"
./target/debug/mockkit scan
./target/debug/mockkit publish
./target/debug/mockkit import-curl "curl 'https://example.com/api/users'"
./target/debug/mockkit use "example.com/api/users" "Success" --publish
./target/debug/mockkit disable "example.com/api/users" --publish
./target/debug/mockkit enable --matching "users" --publish
```

After building the app bundle, open MockKit and choose:

```text
MockKit -> Install Command Line Tool
```

New terminal windows can then run:

```bash
mockkit status
mockkit list
mockkit show "example.com/api/users"
mockkit publish
mockkit use "example.com/api/users" "Success" --publish
```

Useful options:

```bash
mockkit --json status
mockkit --store ./store.json --overrides ./overrides scan
cat request.curl | mockkit import-curl --fetch
cat users.json | mockkit case update "example.com/api/users" "Success" --body-stdin --publish
```

By default, the CLI reads the same store as the app:

```text
~/Library/Application Support/MockKit/store.json
```

Override paths with `--store`, `--overrides`, `MOCKKIT_STORE_PATH`, or `MOCKKIT_OVERRIDES_FOLDER`.

## Build

```bash
pnpm install
pnpm mac:build
open dist/MockKit.app
```

For release builds:

```bash
pnpm mac:build:release
```

## Project Structure

```text
Sources/ChromeOverridesManager/   macOS app shell and bundled frontend resources
frontend/                         React UI, shadcn-style components, themes, i18n
src/                              Rust core and CLI
scripts/                          Dev and app bundle scripts
assets/                           App icons and icon source images
```

## Limits

- Chrome Overrides matching follows Chrome's own rules.
- Status code and headers are stored in the app model, but the first publishing path focuses on response bodies.
- Same URL with different HTTP methods may not be distinguishable by Chrome Overrides.
- You may need to refresh the page after publishing a case.

## License

MIT
