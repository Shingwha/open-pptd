# cli · 3.0 五命令契约

> 目标：从 2.x 的 12 个命令 + 别名收敛为 5 个用户意图。所有旧命令 3.0 删除，不保留别名/shim。

## 0. 总览

| 命令 | 回答的问题 | 读/写 | 旧命令 |
|---|---|---|---|
| `open` | 我要看/改这份 deck | 起服务，可写 | serve |
| `build` | 我要产出文件 | 产出 | export / export-project / render / ensure |
| `check` | 这份 deck 有没有问题 | 只读 | check / fonts check / ensure 只读部分 |
| `assets` | 字体/图标/主题库齐不齐 | 可下载/导入/删除 | assets / fonts / icons |
| `doctor` | 环境和路径对不对 | 只读 | doctor / paths |

统一：stdout JSON 单行（`--json`），人类文本 stderr；退出码 1 = 错误/严格失败；不读 `config.autoFetch`。

## 1. open

```text
open-pptd open [dir] [--deck <file>] [--port <n>]
               [--detach] [--json] [--open|--no-open]
               [--stop] [--blank]
```

- 无参数：Home（画廊）。
- `<dir>`：自动识别 `deck.pptd` 或目录下唯一 `*.pptd`；多个/没有 → 报错并列出候选；`--deck` 显式指定。
- `--blank`：空白编辑器。
- `--detach`：后台；`--json`：单行 `{url,port,pid,project,deck}`；`--stop`：停止后台实例；`--port`；`--open/--no-open`。
- 默认：前台 + 打开浏览器；`--detach`/`--json` 默认不打开，除非显式 `--open`。
- 状态：从单文件 `state/serve.json` 升级为按 `project`/`port` 索引的实例表（或至少记录 project+port，`--stop` 可定位当前项目实例；`--stop --all` 可选）。不误杀陈旧 pid。
- 预览 URL：`/editor/?deck=...`；单壳后可指向 shell 路由，但 `open --json` 返回给用户/agent 的 URL 必须是可直接打开的编辑器地址。
- 找不到 manifest fail-fast；不再“先起服务、编辑器再报错”。

## 2. build

```text
open-pptd build <manifest> --format pptx|png|bundle
               [-o <path>] [--fetch|--offline] [--strict] [--json]
pptx   [--theme <id>] [--no-embed-fonts] [--full-fonts]
png    [--page <n|all>] [--scale <1|2|3>] [--browser <path>] [--timeout <ms>]
bundle [--raw]
```

- 默认 `--format pptx`。
- 所有格式先跑 full `checkProject`：schema/token/资源/fonts/icons/media/layout/contrast；error 阻断；warning 软；`--strict` 时 warning/missing 也阻断。
- `--fetch`：只补齐项目引用字体；`--offline` 禁止网络；互斥。默认不 fetch（与 2.x export 的软降级一致，但去掉 config.autoFetch）。
- `pptx`：等同 2.x export + full check；字体全局嵌入（默认 subset）；`--theme <id>` 可应用主题库快照（仅本次导出，不改项目；如果保留该 flag，JSON 要标记 `themeOverride`）。
- `png`：等同 2.x render；pages/scale/browser/timeout；需 Chrome/Edge；scale=1|2|3；输出目录或单文件。
- `bundle`：项目 zip；默认模型快照（与编辑器导出一致）；`--raw` 磁盘原样（保留注释/格式，Node-only）。
- `--json` 输出：

```json
{"ok":true,"format":"pptx","outPath":"/abs/...","checked":{"fonts":3,"icons":4,"media":2},"fetched":[],"embedded":[...],"skipped":[],"missing":[],"warnings":[],"pages":12}
```

- error JSON：`{"ok":false,"error":{"code":"...","message":"..."}}`；退出 1。
- 不要求浏览器（pptx/bundle）；png 缺浏览器返回 `RenderBackendUnavailableError`，提示安装 Chrome/Edge 或 `--browser`。
- 不再有 export-project/render/ensure 独立命令；旧 flags 映射：`--out` → `-o/--out`；`--page/--scale/--browser/--timeout` 保留；`--no-embed-fonts/--full-fonts/--theme` 保留。

## 3. check

```text
open-pptd check <manifest> [--json] [--strict]
```

- 只读：不写、不下载、不出图。
- 内容：schema、类型字段、token、资源（media/fonts/icons）、layout 几何/overflow/overlap、contrast；资源摘要（fonts ready/fetchable/missing/system、icons known/unknown、media ready/missing）。
- 输出：人类按页分组；`--json`：

```json
{"ok":false,"errors":[...],"warnings":[...],"perPage":{...},"resources":{...},"summary":{...}}
```

- 退出：error → 1；仅 warning → 0；`--strict` warning 也 1。
- 吸收 `fonts check`；不再有 ensure 的下载行为；fetch 归 build --fetch/assets sync。

## 4. assets

```text
open-pptd assets list [--json]
open-pptd assets sync [all|fonts|icons] [--from <zip>] [--json]
open-pptd assets clean [--json]

open-pptd assets themes list [--json]
open-pptd assets themes import <file.json>
open-pptd assets themes export <id> <file.json>
open-pptd assets themes delete <id>
open-pptd assets themes apply <id> <deck.pptd> [--dry-run] [--json]  # 可选，建议保留

open-pptd assets fonts list [--json]
open-pptd assets fonts import <file.ttf|otf|url> [--family <name>] [--json]
open-pptd assets fonts remove <family> [--json]
```

- `list`：字体/图标/主题库摘要 + home 路径 + 版本 + 体积；详细逐项可选 JSON。
- `sync`：内置字体/图标 release zip；SHA256/结构校验；`--from` 离线；不碰用户字体/主题。
- `clean`：cache/tmp；不动 assets/config/themes。
- `themes`：内置 + 用户主题（home `~/.open-pptd/themes`）；import/export JSON；delete 仅用户；apply 写 deck.theme（替换+保留引用项），`--dry-run` 输出 preserved/差异。
- `fonts`：内置 registry + 用户字体（home `~/.open-pptd/assets/fonts/user`）；import 复制字节 + 元数据；remove 仅用户；list 状态。
- 旧 `fonts/icons` 命令删除；`assets sync` 保留。
- 主题 apply 是 deck 写操作；必须明确提示/JSON；不作为 build 的隐式副作用。

## 5. doctor

```text
open-pptd doctor [--json]
```

- CLI 版本/根、Node、home 可写、assets 字体/图标/主题计数、PATH、所有路径（home/package/assets/fonts/icons/themes/config/state/cache/tmp/resourceRoots/configValues）、Chrome/Edge 可用性（PNG 能力）。
- `--json` 单行；不列逐字体/逐图标详情（归 assets list）。
- 吸收 paths；不再有 `paths` 命令。
- 退出：CLI/Node/home 不可写等关键失败 → 1；PATH 缺失/资源不全 → 0 + 提示。

## 6. 旧 → 新映射

| 旧 | 新 | 说明 |
|---|---|---|
| serve | open | 改名；自动 manifest；浏览器默认；fail-fast |
| export | build --format pptx | full check；JSON 加 outPath/pages |
| export-project | build --format bundle [--raw] | 默认模型快照；--raw 旧磁盘原样 |
| render | build --format png | 同 page/scale/browser/timeout |
| ensure | check / build --fetch | 只读 vs 显式下载拆分 |
| check | check | 增 --json/--strict/资源摘要 |
| assets list/sync/clean | assets | 保留并扩展 themes/fonts |
| fonts list/download/check | assets fonts list/import; check | 旧别名删除 |
| icons list/download | assets list/sync | 旧别名删除 |
| paths | doctor | 信息并入 doctor/--json |
| gallery scan/list | Home + release 脚本 | 用户 CLI 删除；静态 manifest 由 release/pack 生成 |
| doctor | doctor | 吸收 paths；加 PNG 能力 |

## 7. 安全/状态

- 本地服务只绑 127.0.0.1；保存路径 traversal 检查；batch 保存原子化（W9）。
- `open --detach` 状态文件不误杀非 open-pptd 进程；ping `/api/ping` 确认。
- `/api/export-image` 保留 origin 检查；3.0 可收敛到 ExportService。
- `assets themes apply`/`fonts import` 是写 home/deck 的操作；JSON/提示必须明确；`--dry-run` 支持主题 apply。
- 不 push/tag/发版；release 另行。

## 8. 验收

- `open-pptd --help` 只出现 5 个命令；未知旧命令 → 非零 + 迁移提示（不执行）。
- 每个命令的 `--json` 单行可解析；stdout 无人类文本。
- `open` 无 project → Home；`open <dir>` 自动识别；缺/多 manifest fail-fast。
- `build` 三格式；PNG 无浏览器报错；PPTX/bundle 无浏览器可用。
- `check` 只读；`--strict` 行为。
- `assets` 主题/字体/图标/内置四类；`doctor` 路径/PNG 能力。
- 旧命令全部删除；README/CHANGELOG 迁移表。
