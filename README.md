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
pnpm mac:dev
```

`pnpm mac:dev` starts Vite at `http://127.0.0.1:5173` and launches the
macOS shell with `MOCKKIT_FRONTEND_DEV_SERVER` set, so frontend changes update
through Vite HMR without rebuilding the app bundle. Swift or Rust changes still
need the relevant process to be rebuilt or restarted.

## CLI

MockKit also ships a command-line interface through the same Rust core used by
the macOS app. Build it with:

```bash
cargo build
```

During development, run:

```bash
./target/debug/mockkit status
./target/debug/mockkit list
./target/debug/mockkit show "example.com/api/users"
./target/debug/mockkit show "example.com/api/users" "成功" --body
./target/debug/mockkit scan
./target/debug/mockkit publish
./target/debug/mockkit disable
./target/debug/mockkit disable "example.com/api/users" --publish
./target/debug/mockkit disable --group "订单/列表" --publish
./target/debug/mockkit enable --matching "users" --publish
./target/debug/mockkit edit "example.com/api/users" --name "用户列表" --description "分页返回用户。"
./target/debug/mockkit case add "example.com/api/users" --name "空列表" --body-file ./empty-users.json --publish
./target/debug/mockkit case update "example.com/api/users" "成功" --body-file ./users.json --publish
./target/debug/mockkit case delete "example.com/api/users" "失败"
./target/debug/mockkit import-curl "curl 'https://example.com/api/users'"
./target/debug/mockkit use "example.com/api/users" "成功" --publish
```

After building the app bundle, open MockKit and choose:

```text
MockKit -> Install Command Line Tool
```

That installs the bundled CLI as `mockkit`, so new terminal windows can run:

```bash
mockkit status
mockkit list
mockkit show "example.com/api/users"
mockkit publish
mockkit disable "example.com/api/users" --publish
mockkit enable --matching "users" --publish
mockkit edit "example.com/api/users" --name "用户列表"
mockkit case update "example.com/api/users" "成功" --body-file ./users.json --publish
mockkit use "example.com/api/users" "成功" --publish
```

Useful options:

```bash
./target/debug/mockkit --json status
./target/debug/mockkit --store ./store.json --overrides ./overrides scan
cat request.curl | ./target/debug/mockkit import-curl --fetch
cat users.json | ./target/debug/mockkit case update "example.com/api/users" "成功" --body-stdin --publish
```

By default, the CLI reads the same store as the app:

```text
~/Library/Application Support/MockKit/store.json
```

You can override paths with `--store`, `--overrides`, `MOCKKIT_STORE_PATH`, or
`MOCKKIT_OVERRIDES_FOLDER`.

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
