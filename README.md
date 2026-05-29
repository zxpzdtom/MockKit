# MockKit

A small native-feeling macOS prototype for managing Chrome DevTools Local Overrides.

The first MVP does not proxy traffic and does not hook `fetch` or `XMLHttpRequest`. It manages the Chrome Overrides folder directly. By default, it targets:

```text
/Users/tom/Desktop/mock
```

## What Works

- Bind or choose a Chrome Overrides folder.
- Scan existing override files into endpoints.
- Create endpoints and multiple response cases.
- Create scenarios.
- Assign a case to the active scenario.
- Publish the active scenario into the Overrides folder.
- Disable managed mocks by removing only files previously written by this app.
- Reveal the Overrides folder in Finder.

The app writes a hidden manifest named:

```text
.mockkit-manifest.json
```

That manifest is used to avoid deleting unmanaged files in the Overrides folder.

## Run From Source

```bash
pnpm install
swift run
```

## Build a Mac App Bundle

```bash
pnpm install
./scripts/build-app.sh
open dist/MockKit.app
```

## License

MIT

## Chrome Setup

1. Open Chrome DevTools.
2. Go to `Sources` -> `Overrides`.
3. Select `/Users/tom/Desktop/mock` as the overrides folder.
4. Allow Chrome to access the folder.
5. Use this app to scan, edit, and publish mock scenarios.

## MVP Limits

- Chrome Overrides matching rules are still Chrome's rules.
- Status code and headers are currently notes in the app model; the first version publishes response bodies only.
- Same URL with different HTTP methods may not be distinguishable by Chrome Overrides.
- You may need to refresh the page after publishing a scenario.
