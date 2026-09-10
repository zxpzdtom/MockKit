<p align="center">
  <img src="./assets/AppIcon.png" alt="MockKit icon" width="96" height="96">
</p>

<h1 align="center">MockKit</h1>

<p align="center">
  面向 Chrome DevTools Local Overrides 的 macOS 本机 Mock 工作台。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="https://github.com/zxpzdtom/MockKit/issues">问题反馈</a> ·
  <a href="./LICENSE">许可证</a>
</p>

MockKit 帮前端开发者把 Chrome Local Overrides 变成可管理的 Mock 工作区。它可以扫描 Overrides 文件夹、整理接口分组、为同一个接口维护多个返回场景，并把当前场景立即应用到 Chrome。

MockKit 不代理流量，也不会 hook `fetch` 或 `XMLHttpRequest`。它直接管理 Chrome Overrides 文件夹里的文件。

## 亮点

- **Chrome Overrides 工作区**：绑定、扫描、编辑和应用 Mock 文件。
- **接口业务分组**：树状目录和列表视图适合管理较大的 Overrides 文件夹。
- **多个返回场景**：同一个接口可以快速切换成功、失败、空数据等场景。
- **cURL 导入**：从浏览器或代理工具复制 cURL 后生成接口。
- **AI 辅助**：支持接口命名、响应生成和业务域自动分组。
- **中文 / 英文界面**：语言偏好保存在本机配置里。
- **主题预设**：基于 shadcn 风格 token 映射到 MockKit 界面变量。
- **CLI 支持**：在终端脚本里扫描、导入、编辑、切换场景、应用和禁用 Mock。
- **应用更新**：通过 GitHub Releases 检查更新，支持更新弹框、下载进度、跳过版本和重启安装。
- **本地优先**：应用数据和 API Key 默认只保存在本机。

## 工作方式

MockKit 会在 Overrides 文件夹里写入一个隐藏 manifest：

```text
.mockkit-manifest.json
```

这个 manifest 用来记录 MockKit 管理过的文件，避免禁用或应用 Mock 时误删同目录下的非托管文件。

MockKit 默认使用 App 自己的数据目录作为 Overrides 文件夹：

```text
~/Library/Application Support/MockKit/Overrides
```

如果 Chrome DevTools 已经配置了 Local Overrides 文件夹，MockKit 会跟随 Chrome 的设置，确保 Chrome 和 MockKit 读写同一个目录。

## Chrome 设置

1. 打开 Chrome DevTools。
2. 进入 `Sources` -> `Overrides`。
3. 选择你的 Overrides 文件夹。
4. 允许 Chrome 访问该文件夹。
5. 使用 MockKit 扫描、编辑和应用返回场景。

Chrome Local Overrides 只有在当前页面打开 DevTools 时才会生效。

## 本地开发

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会启动 Vite `http://127.0.0.1:5173`，并设置 `MOCKKIT_FRONTEND_DEV_SERVER` 后启动 macOS shell。前端改动会通过 Vite HMR 热更新，不需要反复重新打包 App。

Swift 或 Rust 改动仍然需要重启开发进程。

## CLI

开发时先构建 CLI：

```bash
cargo build
```

直接运行 debug binary：

```bash
./target/debug/mockkit status
./target/debug/mockkit list
./target/debug/mockkit search "users" --method GET
./target/debug/mockkit show "example.com/api/users"
./target/debug/mockkit group add "用户中心/账户"
./target/debug/mockkit endpoint add "example.com/api/users" --name "用户列表" --group "用户中心/账户"
./target/debug/mockkit group reorder "用户中心" --first
./target/debug/mockkit endpoint move "example.com/api/users" --group "用户中心/账户" --first
./target/debug/mockkit sync
./target/debug/mockkit apply
./target/debug/mockkit import-curl "curl 'https://example.com/api/users'"
./target/debug/mockkit use "example.com/api/users" "成功"
./target/debug/mockkit case list "example.com/api/users"
./target/debug/mockkit disable
./target/debug/mockkit enable
./target/debug/mockkit disable "example.com/api/users"
./target/debug/mockkit enable --matching "users"
./target/debug/mockkit delete --group "用户" --dry-run
```

构建 App 后，打开 MockKit 并选择：

```text
MockKit -> Install Command Line Tool
```

新的终端窗口就可以直接运行：

```bash
mockkit status
mockkit list
mockkit search "users" --group "用户中心" --enabled on
mockkit show "example.com/api/users"
mockkit apply
mockkit use "example.com/api/users" "成功"
```

常用选项：

```bash
mockkit --json status
mockkit --store ./store.json --overrides ./overrides sync
cat request.curl | mockkit import-curl --fetch
cat users.json | mockkit case update "example.com/api/users" "成功" --body-stdin
mockkit delete --matching "deprecated" --yes
```

接口与目录提供资源式 CRUD 命令，并支持排序：

```bash
mockkit endpoint add <path> [options]
mockkit endpoint list [filters]
mockkit endpoint show <endpoint>
mockkit endpoint edit <endpoint> [options]
mockkit endpoint move <endpoint> [--group <path> | --root] [--before <endpoint> | --after <endpoint> | --first | --last]
mockkit endpoint delete <endpoint...> [--yes]

mockkit group add <path>
mockkit group list
mockkit group show <path>
mockkit group rename <path> <new-path>
mockkit group reorder <path> [--before <sibling> | --after <sibling> | --first | --last]
mockkit group delete <path> [--dry-run | --yes]
```

`mockkit search` 和 `mockkit list --matching` 会搜索名称、方法、路径、说明、分组、标签和所有返回场景。可以用 `--regex`、`--group`、`--method`、`--enabled`、`--limit` 继续过滤。`mockkit disable` 与 `mockkit enable` 只切换全局开关并保留单接口状态；`--all` 才会同时修改所有接口。

CLI 默认读取和 App 相同的 store：

```text
~/Library/Application Support/MockKit/store.json
```

CLI 的修改命令会立即同步到 Overrides。`mockkit apply` 只用于外部修改文件后的手动修复。

可以用 `--store`、`--overrides`、`MOCKKIT_STORE_PATH` 或 `MOCKKIT_OVERRIDES_FOLDER` 覆盖路径。`--overrides` 只对当前命令生效，不会改写工作区保存的路径。

## 构建

```bash
pnpm install
pnpm mac:build
open dist/MockKit.app
```

Release 构建：

```bash
pnpm mac:build:release
```

如果要在本地测试“旧版本更新到最新版本”，可以临时指定旧版本号，不要改仓库里的版本文件：

```bash
APP_VERSION=0.0.0 pnpm mac:build
open dist/MockKit.app
```

## CI 和发布

仓库里有两个 GitHub Actions workflow：

- `CI`：在 `main` push 和 pull request 时自动执行，检查前端和 Rust core，构建 Swift App，打包 DMG，并把 DMG 作为 workflow artifact 上传。
- `Release`：在推送 `v*` tag 时执行，构建正式 DMG；如果配置了 Apple Developer secrets，会自动签名、公证、staple；同时根据上一个 tag 到当前 tag 的提交自动生成更新日志，并发布或更新 GitHub Release。

日常提交代码到 `main` 会自动触发构建验证：

```bash
git push origin main
```

要发布 App 能检查到的正式更新，需要推送版本 tag：

```bash
git tag v0.1.1
git push origin v0.1.1
```

MockKit 的检查更新读取 GitHub Releases，所以 `main` 构建用于验证，带版本的 tag 才是用户真正会收到的更新。

## 项目结构

```text
Sources/ChromeOverridesManager/   macOS App shell 和内置前端资源
frontend/                         React UI、shadcn 风格组件、主题和 i18n
src/                              Rust 核心逻辑和 CLI
scripts/                          开发和 App 打包脚本
assets/                           App 图标和图标源文件
.github/workflows/                CI 构建和 tag 发布自动化
```

## 当前限制

- Chrome Overrides 匹配规则仍然遵循 Chrome 自己的行为。
- 状态码和响应头会保存在 App 模型里，但第一版应用路径以响应 body 为主。
- 同 URL 不同 HTTP Method 的请求，Chrome Overrides 可能无法区分。
- 应用场景后，页面可能需要刷新才会看到新响应。

## 许可证

MIT
