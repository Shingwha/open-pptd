# Spec A3 · resources-cli：资源外置 + CLI 产品化（W2）

> agent 代号 A3，分支 `feat/p0-resources-cli`。深读：`docs/specs/ref/integration-plan.md` §3.3 契约 5、§3.6 分发安装、§4.2 L1.5/L1.6、附录 D.8/D.9。
> 前置阅读：`docs/specs/00-overview.md`。**前置：W1 已合并**（`packages/index.js` 骨架与 `package.json` exports 已含 `./paths`/`./config` 条目）。

## 目标

`~/.open-pptd` 资源外置（读三级写一级、注册表永远只读包内、原子下载）+ CLI 作为独立产品可交付（doctor/paths/assets/ensure/serve 三 flag/导出前置体检）。**解析链落在静态服务层，浏览器 0 行改动**。

## 工单（建议 commit 顺序）

### T1 `packages/paths.js` + `packages/config.js`（契约 5，签名见附录 D.8）

- `openPptdHome()`：`process.env.OPEN_PPTD_HOME` → `os.homedir()/.open-pptd`（Node 不展开 `~`）。
- `ensureHome()`：幂等创建目录树（assets/{fonts,icons}、cli、state、cache、tmp），返回 home；`EACCES/EPERM` 时抛出明确错误（调用方决定降级）。
- `paths`：`{home, assets, fonts, icons, cli, cliCurrent, config, state, cache, tmp}`。
- `resourceRoots`：`{ fonts: [home, <包根>], icons: [home, <包根>], registry: [<包根>] }`——**registry 必须只有一根**（版本耦合，永不被 home 遮蔽）。包根定位：`import.meta.url` 相对上溯。
- `resolveCliRoot()` / `contractRoot()`：`OPEN_PPTD_CLI` → `~/.open-pptd/cli/current` → null（不查 PATH）。
- `config.js`：`readConfig()`（默认值合并 + `version` 字段缺失时补 1）、`writeConfig(patch)`（浅合并、保留未知键、原子写 tmp→rename）。

### T2 静态多根 + 常量拆分

- `packages/server/static.js`：`resolveFile()` 支持多根按序尝试；`registry.json` **永远只查包内根**。
- `packages/server/index.js`：`createServer({ resourceRoots })`，缺省取 `paths.resourceRoots`。
- `packages/cli/export.js:23-25` 常量拆分：`FONT_REGISTRY_DIR`/`ICON_REGISTRY_DIR`（包内，只 registry.json）+ `FONT_BYTES_DIR`/`ICON_BYTES_DIR`（home 大件）；保留 `FONT_LIB_DIR`/`ICON_LIB_DIR` 作兼容别名。
- `packages/model/font-registry.js`、`icon-fa.js`：**仅 Node 分支**改为 `fontDir` 由调用方传注册表目录；**浏览器分支一行不动**（这是本 spec 最重要的红线，`resource-paths.mjs` 长期守住）。

### T3 原子下载

`packages/cli/fonts.js`、`icons.js`：写盘目标改 home；下载先落 `tmp/<random>.part` → 同盘 `rename()` 原子落地；保留既有 magic 前 4 字节 + size 比对校验（`cli/fonts.js:83-93` 已有，勿删）；并发 6 与两段超时（10s/60s）保留。

### T4 CLI 新命令（命令面全表见附录 D.9；`packages/cli/bin.js` 命令表与 `usage()` 同步）

- `open-pptd doctor [--json]`：一次输出 cli/node/home（含可写性）/assets（字体图标就绪数）/path 五项；JSON 结构按 D.9 的 `doctor --json` 契约。新文件 `packages/cli/doctor.js`。
- `open-pptd paths [--json]`：输出 home 与各资源目录。新文件 `packages/cli/paths.js`（或并入 doctor.js，二选一）。
- `open-pptd assets list|sync [icons|fonts|all] [--from <zip>]` + `assets clean`：**一次请求装全量**（zip 下载→SHA256 或 size 校验→解压到 home/assets），替代逐文件下载；`--from` 离线导入。注册表永不进 assets/。新文件 `packages/cli/assets.js`。资产 zip 源：GitHub Releases `open-pptd-icons-v<ver>.zip` / `open-pptd-fonts-v<ver>.zip`（由 A4 的 pack-release 产出；URL 规律 `https://github.com/Shingwha/open-pptd/releases/latest/download/<name>`；zip 缺失时回退逐文件下载器并明确提示）。
- `open-pptd ensure <manifest> [--offline] [--strict] [--json]`：导出前置资源体检五步流程（收集引用→三级比对→按需补齐→再校验→输出清单），可编程 API `collectRequirements/checkResources/ensureResources` 签名见附录 D.8，放 `packages/cli/assets.js` 或独立 `ensure.js`。缺字体下载失败 = 软降级（警告 + 跳过嵌入，不抛错）。
- `export` / `export-project` 默认前置体检：`--offline` 只查不下载；`--strict` 缺失即非零退出；`--json` 输出 `{checked, fetched[], embedded[], skipped[], missing[]}`。**保持"不下载不影响导出"的既有承诺**。
- `serve --detach`（detached + unref + stdio ignore，父进程打印后立即退出）、`serve --json`（**stdout 只输出一行** `{"url","port","pid"}`，人类文案全部走 stderr）、`serve --stop`（读 `state/serve.json`，校验 pid 存活且确为本程序启动才杀，陈旧 pid 不误杀）、`serve --open`（唤起默认浏览器）。serve 状态写 `~/.open-pptd/state/serve.json`。
- `fonts list|download|check`、`icons list|download` 保留为兼容别名，内部转发 `assets sync`。
- **已实现且正确的行为不要动**：绑 `127.0.0.1`、EADDRINUSE 顺延 10 个端口、`port:0` 随机、`/editor/?deck=` 入口。

### T5 零迁移与文案

- `packages/writer/font.js:144` 提示文案：`references/design.md §4` → `open-pptd assets list`（references 将迁出本仓）。
- 零迁移验证：`~/.open-pptd` 不存在时 `fonts list`/`icons list`/`serve`/`export` 全部照常（只读回退包内）。

### T6 回归测试 `tests/regression/resource-paths.mjs`

断言：三级解析顺序；`registry.json` 不被 home 遮蔽（在 home 放过期 registry.json 不影响行为）；`OPEN_PPTD_HOME` 覆盖生效；`ensureHome()` 可重入；原子下载（模拟并发写无 .part 残留）；浏览器端资源 URL 生成逻辑 diff 为 0（对 `font-registry.js`/`icon-fa.js` 的浏览器分支做源码级断言或行为断言）。

### T7 追加再导出与契约断言

- `packages/index.js`：追加 `paths`/`config` 再导出（替换 A1 留下的 TODO 注释）。
- `tests/contract/public-api.mjs`：收紧 paths/config 的断言（文件存在 + 导出名齐全 + `resourceRoots.registry` 仅一根）。

## 验收（完成前自测）

1. `node tests/run-all.mjs` 全绿（含新 resource-paths）+ `node tests/contract/public-api.mjs` 绿。
2. `node bin/open-pptd.js doctor` / `doctor --json` 输出五项事实正确。
3. `OPEN_PPTD_HOME=<临时目录> node bin/open-pptd.js paths --json` 指向临时目录；删除临时目录后四命令照常（回退包内）。
4. `node bin/open-pptd.js serve --project tests/projects/chart --detach --json` stdout 恰好一行 JSON 且命令立即返回；`serve --stop` 后端口释放；再次 `--stop` 报"无运行中的 serve"而非误杀。
5. `node bin/open-pptd.js export tests/projects/font-embed/deck.pptd --json` 输出体检清单；本机缺 11 字体场景下 `skipped` 如实反映（worktree 无字体本体，走包内/home 回退逻辑验证即可）。
6. worktree 环境注意：worktree 里没有字体/图标本体（gitignore），`assets sync` 的真实下载验证可跳过（网络），以单元级/离线断言为准；`--from <zip>` 用 `zip` 命令自造小样 zip 验证解压与校验路径。

## 禁触清单

`editor/**`、`packages/model/` 除两个指定文件的 Node 分支外一律禁触、`packages/writer/` 除 font.js 文案外禁触、`package.json`（exports 已由 A1 写全；**确需新增 `files` 之外内容时停下来在报告里说明**）、`scripts/`、`.github/`、`SKILL.md`、`references/`。
