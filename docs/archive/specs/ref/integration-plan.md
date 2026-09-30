# open-pptd × DeepSeek Harness 深度集成方案

| 项 | 值 |
|---|---|
| 文档版本 | v1.0（设计稿） |
| 状态 | **待评审，尚未实施**；本文件为设计文档，未修改任何产品代码 |
| 目标 | 把 open-pptd 深度集成进 DeepSeek Harness，并完成两个独立仓库的合理拆分与接口化 |
| 权威运行时 | DeepSeek Harness Desktop **0.2.0-rc.1**（`D:\dsh-desktop\resources\app.asar`） |
| 被测上游 | open-pptd **1.5.0**（`C:\Users\法法\.pi\agent\skills\open-pptd`） |

> **阅读约定**
> - `@/pkg` = `D:\dsh-desktop\resources\app.asar\dsh\node_modules\@deepseek-ai\pkg`（0.2.0-rc.1，权威）。
> - `【已核实】` = 本方案作者第一手读源码/读 asar/实测确认。
> - `【待验证】` = 来自文档或推断，实施前需 10 分钟实测。
> - 所有结论都给了证据路径，见附录 C。

---

## 目录

- [0. 结论摘要](#0-结论摘要)
- [1. 现状：DeepSeek Harness 插件体系](#1-现状deepseek-harness-插件体系)
  - [1.8 桌面壳运行环境（实测）](#18-桌面壳运行环境实测) — origin / 转发链 / HMR / `<webview>`
- [2. 现状：open-pptd 可嵌入性评估](#2-现状open-pptd-可嵌入性评估)
- [3. 目标架构：三仓库 + 一层契约](#3-目标架构三仓库--一层契约)
  - [3.1 仓库划分](#31-仓库划分) · [3.6 分发、安装与三仓解耦](#36-分发安装与三仓解耦) · [3.7 版本治理归属](#37-版本治理归属) · [3.8 内容面归属与漂移守卫](#38-内容面归属与漂移守卫)
- [4. 引擎仓（open-pptd）改造设计](#4-引擎仓open-pptd改造设计)
  - [4.2 文件级任务清单](#42-文件级任务清单)（含 [L1.5 资源与配置外置](#l15-资源与配置外置契约-5)、[L1.6 CLI 打磨](#l16-cli-作为独立产品的打磨与-dsh-适配无关可独立发布)）
- [5. 技能仓与适配仓设计](#5-技能仓与适配仓设计)
  - [5.7 技能仓：分层、瘦身与安装引导](#57-技能仓仓-2分层瘦身与安装引导) · [5.9 预览语义：两种环境统一](#59-预览语义两种环境统一)
- [6. 交互形态方案](#6-交互形态方案)
  - [6.4 UI 现状量化](#64-编辑器-ui-现状量化实测) · [6.6 简化取舍清单](#66-简化原则保留基本编辑的取舍清单) · [6.7 信息架构](#67-信息架构b2减法版已定) · [6.8 锐利令牌体系](#68-设计语言锐利令牌体系) · [6.9 选择模型与键位](#69-选择模型与键位已定重映射) · [6.12 两刀里程碑](#612-两刀里程碑与回归保障) · [6.13 决策记录](#613-本轮决策记录)
- [7. 实施计划](#7-实施计划)
  - [7.6 UI 重构双刀](#76-ui-重构双刀与-p0p3-并行详见-64613)
- [8. 风险登记册](#8-风险登记册)
- [9. 待决问题](#9-待决问题)
- [附录 A：DSH 槽位目录](#附录-adsh-槽位目录)
- [附录 B：可 require 的 9 个模块与主题令牌](#附录-b可-require-的-9-个模块与主题令牌)
- [附录 C：证据索引](#附录-c证据索引)
- [附录 D：接口签名清单](#附录-d接口签名清单)

---

## 0. 结论摘要

### 0.1 六条架构决策

| # | 决策 | 结论 | 理由（一句话） |
|---|---|---|---|
| D1 | 界面接入方式 | **同源挂载**：适配仓 Host 半边把引擎仓根目录挂到 `/pptd/**`，Client 半边用**同源 iframe** 装进右栏标签页（URL 必须**文档相对**） | 只有同源才能注入主题令牌、直控编辑器、用宿主 Chromium 截图；而同源 iframe 仍保有 CSS/DOM 隔离。**§1.8 实测已证**：浏览器（`http://127.0.0.1:19387`）与桌面壳（`dsh-app://app`）**两种环境下都同源**——桌面壳把 `/pptd/**` 转发到 host 并注入 cookie；且 `<webview>` 被 DSH 策略实质关闭（§1.8.5），iframe 是唯一路径 |
| D2 | 交互形态 | **右栏标签页为主**（分栏，可一键全屏）+ `main` 整屏面板为辅 + **agent preset 承担"模式"语义** | 右栏是 DSH 唯一官方分栏列且 session 作用域，天然"边聊边改"；`main` 会隐藏聊天，只适合放素材/模板/批量/放映 |
| D3 | 仓库划分 | **三仓 + 一层契约**：`open-pptd`（引擎+CLI，枢纽）+ `open-pptd-skill`（纯 markdown 知识包）+ `dsh-plugin-pptd`（DSH 适配）；后两者**互不依赖**，各依赖仓 1 的不同侧面 | 现在引擎仓有 **300+ 深路径导入**、无包级入口，下游任何改动都会碎；且"胖技能"把运行时与知识混在一起，三件事互相牵制 |
| D4 | 资源与配置 | 统一到 **`~/.open-pptd/assets/{fonts,icons}`**（`OPEN_PPTD_HOME` 可覆盖）；另有 `cli/versions/<ver>`+`current`、`config.json`、`state/`、`cache/`、`tmp/`；**解析链落在静态服务层，浏览器 0 行改动** | CLI / 技能 / 插件复用同一套资源，不再各自下载；同时解掉包体积（R-7）与"端口变化丢最近项目"（R-10） |
| D5 | 分发与安装 | 安装脚本**只装 CLI**（Windows `install.ps1` / Linux+macOS `install.sh`），装到 `~/.open-pptd/cli` 并写入**用户级** PATH；资源以独立资产包同步；**技能不捆绑任何脚本**，SKILL.md 用"先自检，缺则给安装命令"一句话引导 | 三仓解耦后各自独立升级；技能仓保持纯文本（零可执行内容），审计面最小 |
| D6 | 版本治理 | **归运维/部署方**：装哪个版本、兼容矩阵不进应用层。应用层只留 `--version` 供运维锁定 + `CONTRACT_VERSION` fail-fast 诊断 | 把部署约束写死进应用代码会两头受制；而静默半坏比直接报错难排查得多 |
| D7 | 编辑器 UI 体系 | **减法优先的重构**：① 选择模型改集合（多选/框选/右键菜单）② 画布常驻浮层 4→0 ③ 令牌体系"锐利化"（圆角 2/4/6、1px 边界、2 档阴影）④ 组件原语层（CSS 18→8 文件、类名 268→~110）⑤ 深浅色两层（自带默认板 + DSH 覆盖） | 现状测得 43 个字面色、15 种圆角、24 种 transition、`Shift` 被微调占用导致**多选根本不存在**；而"进步"来自**减法**（收归入口、下沉高级项、右键承载动作），不是把 Ribbon 整套搬来 |

### 0.2 一句话方案

> **仓 1（引擎+CLI）补"可挂载编辑器 + 传输接缝 + 主题注入 + 包级 exports + `contract.json` + 资源/配置解析 + 安装脚本"，仓 2（技能）只放 `SKILL.md` + `references/`（纯文本、零可执行内容），仓 3（DSH 适配）只做"托管 / 挂载 / 桥接 / 预设 / 资源映射"。三者中仓 2 与仓 3 互不认识，都只依赖仓 1 的不同侧面。**

### 0.3 分阶段路线图

| 阶段 | 内容 | 工期 | 产出可验收 |
|---|---|---|---|
| **P0** | 引擎仓接口化（5 组契约 + 契约测试）+ **资源与配置外置** + **CLI 打磨**（`doctor`/`paths`/`assets`/`serve` flags）+ **三仓拆分与发布基础设施**，**功能零变化** | 6–8 天 | 独立 CLI/GitHub Pages 画廊/`tests/run-all.mjs` 全绿；`createEditor()` 可被外部脚本挂载并销毁；`~/.open-pptd` 就位且旧资源仍可读；干净环境跑一次 `install.ps1` 后 `doctor` 与 `serve --detach --json` 可用 |
| **P1** | 适配仓骨架 + 同源路由 + 右栏标签页挂载引擎编辑器 | 4–6 天 | DSH 里点侧栏图标 → 右栏出现可编辑的 PPTD 编辑器；`--dev` 下改动文件即刷新 |
| **P2** | 主题桥（含暗色）、`pptd_*` 宿主工具（含 `pptd_preview`）、`/pptd` 命令与快捷键、`pptd_preview` 预览分支写进 SKILL.md | 4–6 天 | 编辑器跟随深浅色；模型可直接调 `pptd_check/export/render/preview`；DSH 内不再让模型起 serve，非 DSH 场景仍能一键预览 |
| **P3** | 「演示模式」preset + 文件事件推送取代 SSE 轮询 + `main` 素材/批量面板 | 3–5 天 | 新建会话可选「演示模式」；模型写盘后编辑器 <200ms 刷新 |
| **P4**（可选） | 引擎仓 C2 组件化：属性面板/工具栏/缩略条 React 化，画布与图表表格编辑器仍复用 | 1–2 周 | 面板与 DSH 一致；无 iframe 边界 |

---

## 1. 现状：DeepSeek Harness 插件体系

### 1.1 版本版图：哪棵树是权威

这是最容易踩错的前提，必须先钉死。

| 位置 | 版本 | 状态 | 说明 |
|---|---|---|---|
| `D:\dsh-desktop\resources\app.asar\dsh\node_modules\@deepseek-ai\` | **0.2.0-rc.1**（289 包） | ✅ **权威** | 实际被 `dsh-desktop-host` 装载的树；asar 是单文件，`read`/`grep` 工具看不见，须用 Node 在内存里解 |
| `C:\Users\法法\.dsh\profiles\node_modules\@deepseek-ai\` | 0.1.5-rc.1 | ⚠️ 过期 | pnpm hoisted 安装，条目是 junction；**6 个 junction 已断链**（无 `lib`）：`dsh-client-web`、`dsh-client-web-react`、`dsh-client-runtime`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-schema-form` |
| `C:\Users\法法\AppData\Roaming\npm\node_modules\@deepseek-ai\` | 0.1.5-rc.1（239 包） | 仅供参考 | 全局 npm 树 |
| `C:\Users\法法\AppData\Roaming\npm\node_modules\@deepseek-ai\.dsh-zNXlHECr\node_modules\@deepseek-ai\` | 0.1.5-rc.1（193 包） | 仅供参考 | pnpm 内容寻址目录 |

**asar 读取配方**（本次研究全程使用，可复用）：

```js
const fd = fs.openSync(asarPath, "r");
const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0);
const jsonLen = b.readUInt32LE(12);                    // 头部 JSON 长度
const header = JSON.parse(Buffer.alloc(jsonLen).toString()); // 从 offset 16 读
const base = 16 + jsonLen;                             // 内容起点（对齐到 4）
// 文件字节：base + parseInt(entry.offset, 10)，长度 entry.size
// 目录遍历：node = node.files[seg]（不是扁平 key）
```

**对设计的影响**：新插件必须**对 0.1.5/0.2.0 的错配免疫**。手段见 §3.2 的"零 `@deepseek-ai/*` 导入"原则。

### 1.2 四种扩展形态

| 形态 | 载体 | 能力 | 生效方式 |
|---|---|---|---|
| **Host 插件** | 一个 Cordis Loader 行（`lib/index.js`） | 注册工具、HTTP 路由、后台服务 | 改 patch 文件即热生效 |
| **Client 插件** | 同包的 `lib/client.js`（浏览器 bundle） | 注册 slot 组件、命令、快捷键、设置项 | 改 row 热生效；改代码经 SSE 热换【待验证：桌面壳是否走 SSE】 |
| **Agent Preset（= 界面里的"模式"）** | `${DSH_HOME}/.agent-presets/<id>/`：`preset.yml` + `agent.cordis.yml` + `skills/` | 定义 agent 的人设、工具集、prompt 段、技能根 | 新建会话时可选；**只有空会话能切** |
| **Bundle** | 带 `dsh.bundle.patch` 的包 | 一次性插入多行 + 自己的 patch 层 | 需列入 profile 的 `dsh.profile.bundles` |

**关键认知**：普通客户端插件 **= 一个 Loader 行，不是 bundle**，不需要进 `dsh.profile.bundles`。

### 1.3 Host 半边契约

**Loader 行**写入 profile 的 patch 层（`~/.dsh/profiles/desktop/cordis.patch.yml`），两种形状：

```yaml
# 形状一：顶层覆盖
- id: ui-theme
  name: "@deepseek-ai/dsh-client-ui-theme"
  config:
    preference: system

# 形状二：插入列表（可用 !!js 表达式与 disabled）
- insert:
    - id: my-panel
      name: "@my-scope/dsh-client-ui-my-panel"
      config: {}
      disabled: !!js "ctx.get('profileContext')?.name !== 'desktop'"
```

- `name` **可以是本地路径**：`"./plugins/xxx/index.js"`、`"file:..."`、绝对路径【已核实：`locatePkgJson()` 中 `pathLike = startsWith(".") || startsWith("file:") || isAbsolute()`，随后走 `nearestPackage(moduleUrl, undefined)` 向上找最近的、带 `name` 的 `package.json`】。
- ⚠️ **本地路径插件必须自带 `package.json` 且有 `name`**；否则会向上找到 `profiles/desktop/package.json`（`dsh-profile-desktop`，无 `dsh.client`）→ 订阅半边**静默消失**。
- `!!js` 表达式允许；**patch 会整体替换目标行的 `config`**，所以每行必须重述它拥有的全部键。

**可用服务（通过 `ctx` 注入，不需要 import）**：

| 服务 | 关键方法 | 用途 |
|---|---|---|
| `ctx.tools` | `register(defineTool({name, description, parameters, execute}))`、`restrict/get/schemas/guard` | 注册 `pptd_*` 工具 |
| `ctx.webServer` | `register({path, ...})` → disposer、`registerUpgrade(route)`、`registerFallback(handler)`、`port`、事件 `webserver/index-inject` | 挂 `/pptd/**` 路由 |
| `ctx.reflect` | `provide(name, impl)` | 给别的插件提供服务（如 `pluginNavigation`） |
| `ctx.get(name)` | — | 取其他插件提供的服务 |
| `ctx.fs` / 文件服务 | 见 `dsh-fs-local` | 读写项目文件、文件事件 |

**工具参数 DSL**（统一 schema）：`string / number / integer / boolean / null / array / object / json / oneOf`，形如：

```js
parameters: { path: { type: "string", required: true, description: "deck.pptd 路径" } }
```

**路由匹配顺序**：全表精确匹配 → 最长前缀 → fallback。同一张表里重复 path 会抛错。

### 1.4 Client 半边契约

**`package.json` 声明**【已核实：`parseDshClient()` 与 `clientExportOf()`】：

```json
{
  "name": "dsh-plugin-pptd",
  "type": "module",
  "exports": {
    ".":        { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": { "client": { "platform": "web" } }
}
```

| 字段 | 规则 |
|---|---|
| `dsh.client.platform` | **必需，字符串**，且扫描只接受 `"web"` |
| `dsh.client.inject` | 可选 `string[]`：**模块图行**（代码依赖，这些包的 bundle 必须先到） |
| `dsh.client.external` | 可选 `string[]`：**非基线**的模块请求；不得列自己 |
| `dsh.client.immediately` | 可选 boolean：第一阶段预取 |
| 致命规则 | **声明了 `dsh.client` 却没导出 `./client` → 报错** |

⚠️ **两个 `inject` 不是一回事**，极易混淆：

| 位置 | 含义 |
|---|---|
| `package.json` → `dsh.client.inject` | 模块**图行**（哪个包的浏览器 bundle 先到） |
| 插件体 → `export const inject` | **Cordis 服务名**（`"slots"`、`"layout"`…） |

**浏览器 bundle 格式**（可手写，**不需要打包器/JSX**）：

```js
window.__ModuleLoader__.load({
  id: "dsh-plugin-pptd",                     // = 包名
  factory: (require) => {
    var module = { exports: {} }, exports = module.exports;
    const React = require("react");           // 基线表，免声明
    const inject = ["slots", "layout"];       // Cordis 服务
    function apply(ctx) { /* 注册 slot */ }
    exports.apply = apply; exports.inject = inject;
    return module.exports;
  }
});
```

执行 bundle **只注册工厂**，副作用在 materialize 时才跑。

**冻结模块表：恰好 9 个**【已核实，从 `@/dsh-web-frontend/dist/assets/index-Dy0OhsZ5.js` 的 `QS()` 读出】：

```
react | react/jsx-runtime | react-dom | react-dom/client | @deepseek-ai/cordis
@deepseek-ai/dsh-client-store | @deepseek-ai/dsh-client-ui-slots
@deepseek-ai/dsh-client-ui-primitives | @deepseek-ai/dsh-client-ui-dockkit
```

→ 我们的 bundle 只需 `require("react")`，**`dsh.client.external` 留空、零依赖**。

### 1.5 槽位系统与能力边界

**四种 kind**：`single`（单占位）／`list`（有序条目）／`keyed`（按 key 分发）／`chain`（自荐选举）。

**铁律**：*"Declaring a slot is claiming it: the registering entry becomes the only entry allowed to render that key, and registering into an undeclared slot … throws at load."*
→ 往**已声明**的槽位注册是合法扩展；往**未声明**的槽位注册会在装载时抛错。

**根槽位由 `dsh-client-ui-layout` 声明**【已核实】：

```js
ctx.slots.register({
  name: "root", locale: "common",
  children: {
    "sidebar":       { kind: "single", scope: "root" },
    "main":          { kind: "keyed",  scope: "root" },
    "rightbar":      { kind: "single", scope: "root" },
    "shell.overlay": { kind: "list",   scope: "root" },
    "shell.leading": { kind: "single", scope: "root" }
  }, store
}, AppFrame);
```

**四个全屏级区域的所有权**：

| 区域 | 槽位 | 所有权 | 插件能否直达 |
|---|---|---|---|
| 中间整屏 | `main`（keyed） | 无人占用（只有保留 key `conversation`） | ✅ **可注册新 key** |
| 左栏 | `sidebar`（single） | `dsh-client-ui-sidebar` | ❌ 只能填子槽位（如 `sidebar.panellist`） |
| 右栏 | `rightbar`（single） | `dsh-client-ui-sidebar-right` | ❌ **只能注册"标签类型"** |
| 浮层 | `shell.overlay`（list） | — | ✅ |

**全屏工作台有官方先例，且就在本机运行**【已核实：`@/dsh-client-ui-plugin-manager/lib/client.js`】：

```js
ctx.slots.inject("main", function* () {
  const handle = createNavigationStore(), instance = handle.create();
  yield ctx.slots.register({
    name: "main", key: PANEL_ID, locale: NS, store, inject: () => face,
    children: { "plugins.item": { kind: "list", scope: "root" }, /* … */ }
  }, PluginManagerPage);
  yield ctx.layout.panelInfo.subscribe(() => {
    if (ctx.layout.panelInfo.getSnapshot().activePanelId !== "plugins") instance.actions.setView({ kind: "list" });
  });
});
ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
  name: "sidebar.panellist", id: PANEL_ID, order: 0, label: () => t("panel"), locale: NS
}, PluginsPanelIcon));
```

**`ctx.layout` 服务**（`LayoutController`）【已核实】：

| 方法 | 语义 |
|---|---|
| `selectPanel(id)` | 切到全局面板；`null` 回会话；**未注册的 id 抛错** |
| `panelInfo.getSnapshot().activePanelId` | 读当前面板 |
| `openRightbar(track, fullscreen)` / `closeRightbar()` | 打开/关闭右栏；`fullscreen` 覆盖视口但保留轨道 |
| `toggleSidebar()` | 折左侧栏 |
| `beginNavigation()` | 返回 `AbortSignal` |

**右栏进入方式**：`ctx.sidebarRightTabs`（标签类型注册表）+ `ctx.sidebarRight.openTab(kind, {params})`；标签 chrome 走 `sidebar.right.pane.tab` / `.title` / `sidebar.right.tab.*`。右栏是 **per-session** 的 docking 面。

**没有路由/屏幕/"模式" API**：`@/dsh-host-frontend-static/README.md` 明确 "Pathname routing is explicit — the current client … has no History API pathname routes"。所谓"模式切换"就是 `selectPanel` + 槽位状态。

### 1.6 主题令牌

- **设计令牌前缀是 `--dsw-`**（`dsh-client-ui-theme` 定义了 400 个），插件应使用 **`--dsw-alias-*`（约 110 个语义令牌）**。
- **`--dsh-*` 是"框架力学"变量，不是设计令牌**：`--dsh-frame-top-clearance`(48px)、`--dsh-windows-content-radius`、`--dsh-windows-sidebar-width`、`--dsh-content-font-size`、`--dsh-scrollbar-*`、`--dsh-boot-bg` 等。
- **暗色标记：`body[data-ds-dark-theme]`**；平台标记 `html[data-platform='darwin']`、`html[data-windows-titlebar]`。
- 可通过 `ctx.theme` 注册第三方主题 id（覆盖同名 alias 令牌，按注册顺序折叠）。
- 机制：令牌值由样式表切换（`system` 偏好靠 head CSS 的 `prefers-color-scheme`），插件"读令牌、不管主题状态"。

### 1.7 装载、生效与硬约束

**装载路径**（`dsh-client-modules`）：扫描已启用 Loader 行 → 只接受 `dsh.client.platform === "web"` → 组装 boot graph → 注入 `window.__ModuleLoader__` 与 combo 脚本 → bundle 经 **`/plugins`** 提供 → shell 等**所有** entry 就绪后 `ctx.uiRenderer.mount(container)`。

**安装**：`dsh plugin --profile <name> <pnpm args>`（转发到 profile 目录的 pnpm）；本地包用 `pnpm add <path|tarball>`。解析顺序：**先 dsh 安装内**（base/web-app/headless/sdk/acp），**再 profile 自己的 `node_modules`**（pnpm 把树外插件装在这）。

**生效**：`patchReload: live` 监视 patch 文件 → 增删普通插件行**无需重启**；`lib/client.js` 重建后经 SSE（`/plugins/events`，`pollIntervalMs` 默认 500）热换。
⚠️ HMR README 原文：**"Web transport only — Electron installation and backend restart handling do not use this SSE path."** → 桌面壳的客户端代码热更**需实测**【待验证】。

**硬约束清单**：

1. **首帧要等所有 client entry**，slot 渲染**无 Suspense、无按插件懒加载** → 我们的 `client.js` 必须极小（→ 重活放进 iframe 的额外理由）。
2. bundle 基表只有 9 个词，其余一律 throw（构建期 bundle purity gate 的运行时镜像）。
3. 同一 bundle 执行两次 → `duplicate factory registration`；替换 bootstrap 模块需刷新页面。
4. 无 History 路由；无版本选择器；安装源选择存在 `localStorage`。
5. `settings.plugins` 失败重试"即使 revision 未变"。
6. 应用 shell 的 `index.html` **没有 CSP**（只有 `/api/file` 的响应头与"预览文档"的 `<meta>` 有），所以插件自有 iframe/DOM 不受壳的 CSP 约束【已核实】。
7. 静态前端托管：`dsh-host-frontend-static` 用 `config.distIndex` 占据 **fallback 单一席位**；目录穿越 403、dist 内缺文件 404、非 GET/HEAD 405、**index 需 token/cookie 静态资源公开**（故裸请求 `http://127.0.0.1:19387/` 返回 **401**）。
8. 桌面渲染进程命令行含 `--disable-features=…LocalNetworkAccessChecks…` → **Chromium 私有网络访问检查已关**，iframe→loopback HTTP 不被 PNA 拦【已核实】。
9. `dsh-client-ui-sidebar-browser` 已证明"**在右栏用 iframe 浏览 loopback 服务**"是官方形态（Web 用 iframe、默认 sandbox `allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox`；**明确拒绝把 DSH 自己的源作为目标**）。
10. ✅ **已实测（§1.8.5）**：主窗口确实 `webviewTag: true`，但 DSH 主进程对**每一次** `will-attach-webview` 都做 lease 校验，无 lease 一律 `preventDefault()`，且 lease 的导航白名单**明确排除 `dsh-app:` 与 DSH 应用主机** → **`<webview>` 对第三方插件实质关闭，统一按 `<iframe>` 设计**。
11. ✅ **已实测（§1.8.2–1.8.3）**：桌面壳主窗口的 document origin 是 **`dsh-app://app/`**（不是 `http://127.0.0.1:19387`）；`dsh-app://app/<dist 特例之外的路径>` 会**带 cookie 转发**到本机 HTTP host → **`/pptd/**` 在桌面壳里与壳同源**。
12. ✅ **已实测（§1.8.4）**：client 插件 HMR 在桌面壳里**可用**——`dsh-client-hmr` 在活跃 graph 中（`immediately: true`），`/plugins/events` 是真实 chunked SSE，`dsh-app` 协议声明了 `stream: true`，转发函数用 `response.body` 流式透传。

### 1.8 桌面壳运行环境（实测）

> 本节全部结论来自对 `resources/app.asar` 的只读解析与对运行中进程/端口的活体探测，**未修改任何代码**。

#### 1.8.1 进程与入口

- Electron 二进制名是 **`DeepSeek Harness.exe`**（不是 `dsh-desktop.exe`），位于 `D:\dsh-desktop\`。
- 主进程入口 = `resources/app.asar/lib/main.js`（468 KB）；启动参数把 DSH 实现树与 profile 交给它：
  `--expose-internals …/dsh-desktop-host/lib/index.js <dshRoot> <profile> <runtime> <pnpm> <binDir>`
- 实测 6 个进程：主 + GPU + network utility + 主渲染进程（另按需派生 webview/子进程）。
- GUI 端口 **19387**；裸 `GET /` → **401**（需 token/cookie，与既有结论一致）。

#### 1.8.2 主窗口的 origin 是 `dsh-app://app`

```js
const SCHEME = "dsh-app";                        // main.js:6221
const applicationUrl = `${SCHEME}://app/`;       // main.js:10777
const window = createWindow(appPreload, false, true);  // main.js:11521  primary=true
await navigateMain(applicationUrl);              // main.js:10931 / 10955 / 11572 / 11677
```

旁证（多处断言主框架 URL 前缀）：
- `ws://127.0.0.1/*` 的请求头校验要求 `headers.origin === "dsh-app://app"`（`main.js:11098`）
- IPC 发送者校验 `event.senderFrame.url.startsWith("dsh-app://app/")`（`11111`、`11503`、`9916`）
- `applicationFrame(origin)` ＝ `protocol === "dsh-app:" && hostname === "app"`（`6264`）

**这条修正了此前"GUI 在 `http://127.0.0.1:19387`"的隐含假设**：那个 URL 是**浏览器**访问用的入口；桌面壳窗口本身跑在 `dsh-app://` 源上。

#### 1.8.3 `dsh-app://` 协议：权限与转发链路

```js
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: {
  standard: true, secure: true, supportFetchAPI: true,
  corsEnabled: true, stream: true, codeCache: true } }]);          // main.js:10545
```

```js
protocol.handle(SCHEME, (request) => {
  const url = new URL(request.url);
  if (url.hostname === "shell") return serveWebDocument(request, join(appPath, "renderer"));
  if (url.hostname === "app") {
    if (url.pathname === "/" || url.pathname === "/index.html" ||
        url.pathname.startsWith("/assets/") ||
        ["/favicon.svg", "/manifest.webmanifest"].includes(url.pathname))
      return serveWebDocument(request, join(dsh, "node_modules/@deepseek-ai/dsh-web-frontend/dist"));
    if (backend.host === void 0 || hostUrl === void 0 || hostCookie === void 0)
      return new Response(null, { status: 503 });
    return forwardWebRequest(request, hostUrl, hostCookie);        // ← 其余全部转发
  }
  return new Response(null, { status: 404 });
});                                                                // main.js:11046
```

`forwardWebRequest` 把 `origin`/`cookie` 换成 host 的（`headers.set("cookie", hostCookie)`），并**直接透传响应体**：

```js
const response = await fetch(target, init);
return new Response(response.body, { status: response.status, headers: outgoing }); // main.js:7208
```

**三条设计结论**：

| # | 结论 | 对方案的影响 |
|---|---|---|
| 1 | `/pptd/**` 不在 dist 特例名单里 → 被**转发到 DSH host** | 适配仓只需把 `/pptd/**` 注册在 Host 上，桌面壳自动可达，**不用为桌面壳写第二套服务** |
| 2 | 桌面壳里 `dsh-app://app/pptd/**` 与壳**同源** | **D1 同源挂载在浏览器与桌面壳两种环境下都成立**；`contentWindow` 可直接控制，且**不需要额外 token**（转发器已注入 cookie） |
| 3 | **`/assets/**` 被 dist 抢占** | **绝不能**把 open-pptd 的资源注册在 `/assets/**`，必须用 `/pptd/assets/**`。open-pptd 的 `ROOT` 是 `import.meta.url` 相对的，天然落在 `/pptd/` 下 ✅ |

**URL 必须"文档相对"**：`dsh-client-hmr` 的浏览器半侧用 `new EventSource("plugins/events")`（`lib/client.js:45`，注释指向 `.agents/notes/implemented/architecture/2026-09-14-web-document-relative-app-routes.md`）。适配仓构造编辑器 URL **也必须文档相对**（`"pptd/editor/"`），不能用根绝对路径，否则在 `dsh-app://` 下会解析到错源。

#### 1.8.4 client 插件 HMR：在桌面壳里可用 ✅

三条同时成立才成立，**实测三条全成立**：

1. `stream: true` 出现在 scheme privileges 里（`10552`）
2. `forwardWebRequest` 用 `response.body` 透传，**没有 `arrayBuffer()` 缓冲**（`7208`）
3. `/plugins/events` 是真实长连接 SSE——活体探测（无 Origin 请求，`origin === null` 放行）：

```
HTTP/1.1 200 OK
content-type: text/event-stream
cache-control: no-cache
connection: keep-alive
Transfer-Encoding: chunked

: connected

data: {"type":"graph","graph":{"rev":"d30f8954a30b","entries":[… 57 条 …]}}
```

（curl 因流不结束而超时退出 28；graph 内含 `@deepseek-ai/dsh-client-hmr`，`immediately: true`，`inject: ["@deepseek-ai/dsh-client-modules"]`）

**README 那句 caveat 的正确读法**——`dsh-client-hmr/README.md:118` 位于 **"Known Limitations and Deferred Work"**：

> **Web transport only** — Electron installation and backend restart handling do not use this SSE path. Entry reconciliation itself is transport-independent.

说的是「**安装插件**」与「**后端重启**」这两个事件不产生 SSE 帧（改为每个新连接重收完整 graph），**不是**说中继在 Electron 下不可用。

**因此 `--dev` 期望（原 Q7）确定**：

| 操作 | 桌面壳里的表现 |
|---|---|
| 改**已有**插件的 `lib/client.js` | ✅ **热替换生效，无需刷新** |
| **新增/移除**插件行 | ⚠️ SSE 不推帧 → **需刷新页面**（Host 侧 `patchReload: live` 属 Host 生命周期，与此无关） |
| 取插件 bundle | 命中 `PLUGIN_BUNDLE_PATH` 时被强制 `cache-control: no-store`（`7207`）→ 不会拿到旧 bundle |

#### 1.8.5 `<webview>`：Electron 层可用，但被 DSH 策略实质关闭

- 主窗口 **`webviewTag: true`**：`createWindow(preload, show = false, primary = false)` 里 `webviewTag: primary`（`10631`），调用点为 `createWindow(appPreload, false, true)`（`11521`）；辅助窗口（welcome `7610` / login `8951`）另建 `BrowserWindow` 且 `webviewTag: false`。
- **而且 `<webview>` 是在产用例**：`var DesktopBrowserGuests = class`（`9146`）就是「浏览器」侧栏的实现，`owner.on("did-attach-webview", (_event, guest) => {…})`（`9234`）管理 guest 生命周期。
- **但** `will-attach-webview` 把无 lease 的 webview 全部挡下（`9208`）：

```js
owner.on("will-attach-webview", (event, preferences, params) => {
  const id = typeof params.src === "string" && params.src.startsWith("about:blank#") ? params.src.slice(12) : "";
  const lease = this.leases.get(id);
  if (lease === void 0 || lease.owner !== owner || lease.attached || params.partition !== lease.partition) {
    event.preventDefault();          // ← 无 lease 一律拒绝
    return;
  }
  // 并把 webPreferences 重置为：nodeIntegration:false / contextIsolation:true /
  // sandbox:true / webSecurity:true / webviewTag:false（禁嵌套）/ plugins:false / …
});
```

- lease 只能由 `window.dshDesktop.…acquire(workspace)` 取得（preload `716`，主进程 `11079`），且 `assertProductSender` 要求**主框架**。
- 拿到 lease 之后还有导航白名单，**明确排除 DSH 自身**（`9314`）：

```js
allowedNavigation(value) {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol)
      && url.username === "" && url.password === "" && !this.isApplicationHost(url);
}
isApplicationHost(url) {   // 同端口且 hostname ∈ {hostname, localhost, 127.0.0.1, [::1]}
```

→ **既不能加载 `dsh-app:`，也不能加载 DSH 应用主机本身**（与 `dsh-client-ui-sidebar-browser` 的行为一致）。

**结论**：`<webview>` 对第三方插件**实质关闭**，iframe 是唯一正确路径。原方案里"后续可用 `<webview>` 优化"这一项**应当删除**——这条不确定性已被设计与实测共同消除。

---

## 2. 现状：open-pptd 可嵌入性评估

### 2.1 分层、体积与既有纪律

open-pptd 是**零依赖、无构建步骤**的原始 ESM + 原始 CSS 项目（`package.json` 无 `dependencies`，`bin.open-pptd` 指向 `bin/open-pptd.js`）。分层与体积【已核实】：

| 目录 | 体积 | 内容 | 能否在浏览器跑 |
|---|---|---|---|
| `packages/model/` | 含在 2,553 KB 内 | 解析/序列化/校验/主题/13 类图表 option/字体子集/图标 | ✅ 双端 |
| `packages/renderer/` | 同上 | 逐元素预览渲染 + `page.js` 装配 + `headless/` 截图管线 | ✅ / headless 仅 Node |
| `packages/writer/` | 同上 | OOXML 生成、`buildPptx`、字体嵌入、zip | ✅ 双端 |
| `packages/server/` | 小 | `createServer` / `startServer` / SSE / 静态 | ❌ 仅 Node |
| `packages/cli/` | 小 | `serve/export/export-project/check/render/gallery/fonts/icons` | ❌ 仅 Node |
| `editor/` | **466 KB**（73 文件：54 JS ≈363 KB + 18 CSS ≈93 KB） | 原生 DOM 编辑器 | ❌ 仅浏览器 |
| `assets/icons/` | 2,337 KB（2,164 SVG） | Font Awesome Free | 静态 |
| `assets/fonts/` | **~100,907 KB**（17 TTF） | 可嵌入字体库 | 静态 |
| 第三方 vendor | `js-yaml.mjs` 111 KB、`katex.mjs` 617 KB、`echarts.mjs` 1,031 KB | 已 vendored | — |

**工作树全量 vs 发布产物**（决定"瘦身"这件事该往哪使劲）：

| | 体积 |
|---|---|
| **工作树全量** | **142.9 MB** —— `assets` 100.8 · `tests` 21.5 · `examples` 11.7 · `docs` 3.5 · `packages` 2.5 · `dist` 2.1 · `editor` 0.5 · `references` 0.2 |
| **`scripts/pack-release.mjs` 白名单产物** | **1.07 MB / 167 项**（实测 `dist/open-pptd-v1.4.7.zip`：packages 75 · editor 73 · references 11 · assets 2 · bin 1 · 根 4） |

也就是说：**"瘦身"这件事项目早就做完了**（142.9 MB → 1.07 MB，-99.3%），白名单里已经排除 `tests/`、`docs/`、`examples/`、`.github/`、`scripts/`，并且**字体本体不入包**（注释明写"约 155MB，装好后经 CLI 按需下载"）。本方案要补的不是瘦身，而是**分发与安装**（§3.6），以及把运行时与知识面拆成两个仓（§3.1）。

**既有的 CI 纪律**（`tests/regression/dep-graph.mjs`）——这是本次改造的"护栏"，必须继续满足：

- `packages/{model,writer}` **不得**出现 `window.` / `document.` / `require(` / `fs` / `node:`
- `packages/renderer` **可以**用 DOM
- `editor/` **不得**导入 `packages/server` 或 `packages/cli`
- `packages/` **不得**导入 `editor/`

### 2.2 可以直接复用的层（这是深度集成可行的根本原因）

| 组件 | 签名 | 复用价值 |
|---|---|---|
| `packages/model/pptd-io.js` | `parseDeck(manifestYaml, pageFiles: Map, options)` / `serializeDeck(deck, options)` | **PPTD 文档的唯一 I/O 真相**；内存对象进出的天然接缝 |
| `packages/model/registry.js` | `registerType(def)` / `getType(type)` / `allTypes()` | **扩展性核心**：按字段分片合并注册（`render`/`toXml`/`label`/`menu`/`create`/`props`/`quickbar`），下游可注册新元素类型 |
| `packages/model/theme.js` | `resolveTheme(deck)`、`resolveColor`、`THEME_PALETTES`、`mergePaletteColors` | 主题令牌与配色预设的解析入口 |
| `packages/renderer/page.js` | `renderPage(container, page, deck, theme, opts)`、`autoGrowTexts`、`disposeChartInstances` | **预览只有一个入口**，且自带 `dispose`（这是编辑器里罕见的、已有清理语义的地方） |
| `packages/writer/pptx.js` | `buildPptx(deck, options)`（async）、`downloadBlob`、`downloadPptx` | **纯函数**，Node 与浏览器都能跑 → 可直接吃内存 deck，不落盘 |
| `packages/model/validate.js` | `validateDeck(deck, opts)`、`registerRule(fn)` | 结构自查，可挂到 `pptd_check` 工具 |
| `packages/server/index.js` | `createServer(options)` / `startServer(options)` / `PROJECT_ROOT` | 已有 HTTP 层可原样搬进宿主进程 |
| `packages/server/events.js` | `dirFingerprint(root)` / `createSseHub(projectRoot)` | 可复用的变更广播 |
| `packages/server/static.js` | `resolveFile(base, pathname)` / `sendFile(res, path)` | 已含路径穿越防护 |
| `editor/app/project/handle-io.js` | `pickProjectFolder` / `ensurePermission` / `hasDeck` / `readProject` / `readImageAsDataUrl` / `writeFiles` / `fingerprint` | **鸭子类型 DirectoryHandle 接缝**：只依赖 `getFileHandle`/`getDirectoryHandle`/`getFile`/`createWritable`/`queryPermission` → 合成句柄即可读写 + 自动刷新，**零改动**。已有回归测试 `tests/regression/handle-io.mjs` |
| `editor/app/state.js` + `interaction/history.js` | — | 状态与撤销栈，可原样保留 |

### 2.3 阻碍嵌入的 7 个硬点

| # | 硬点 | 证据 | 后果 | 修法归属 |
|---|---|---|---|---|
| **H1** | **编辑器自启动且不导出**：`main.js` 顶层直接 `boot()`（第 240 行），只读 `location.search`，`export` 为空 | `editor/main.js` | 无法在任意 `rootEl` 里挂载第二个/可销毁的编辑器实例 | 引擎仓（增 `createEditor`） |
| **H2** | **`dom.js` 是 document 级单例**：模块级 `cache = new Map()` + `byId()` 永久缓存 + 26 个硬编码 id | `editor/dom.js`（53 行） | 全页只能有一个编辑器；重复挂载互相串台 | 引擎仓（实例化） |
| **H3** | **全链路无 `destroy()`/`dispose()`**：`api`/`io`/`view`/各 controller 都没有 teardown | 全 `editor/` | 反复挂卸必然泄漏（事件监听、`EventSource`、图表实例） | 引擎仓（补 teardown） |
| **H4** | **传输是字面量**：`fetch("/api/save")` 与 `new EventSource("/events")` 是根绝对路径，项目来源只有"fetch manifest"或"File System Access 句柄"二选一 | `saver.js:198`、`live-reload.js:93` | 无法把读写换成宿主 IPC；无法嵌入非同源路径 | 引擎仓（`ProjectSource`） |
| **H5** | **只有一套浅色主题**：`editor/styles/tokens.css` 是全项目唯一的 `:root`（约 45 个令牌），**零处** `prefers-color-scheme` / `color-scheme` / `[data-theme]` / `.dark` | `editor/styles/tokens.css`（79 行） | 无法跟随 DSH 的 `body[data-ds-dark-theme]` | 引擎仓（补暗色 + 令牌注入 API） |
| **H6** | **没有包级入口**：`packages/{model,renderer,writer,cli,vendor}` 下**均无 `index.js`**（只有 `packages/server/index.js`），`editor/` 以 **43 处 `../../packages/...` 深路径**消费 | `glob packages/*/index.js` → 仅 server | 下游任何依赖都是"依赖内部实现"，上游随便挪一个文件就碎 | 引擎仓（补 `exports` map） |
| **H7** | **资源位置写死**：字体/图标路径由 `SKILL_ROOT` 推导（`cli/export.js:23-25`），浏览器端由 `ROOT` 推导（`model/font-registry.js:20,66`、`model/icon-fa.js:100`）；字体库 17 个 TTF 共 **98.5 MB** 在仓库内 | 见 §4.5 | ① 包体积不可分发；② CLI/SKILL/插件各自下载同一批字体；③ 浏览器端资源与"站点根"强绑定，无法指向用户目录 | 引擎仓（`paths` 契约 + 静态多根） |

### 2.4 现状下"最小可用挂载"的真实代价

如果不做 §3 的接口化，直接把编辑器嵌进 DSH，唯一可行的是**同源 iframe + 让引擎自己起 HTTP 服务**。这条路能跑，但会带来三个长期问题：

1. **编辑器的读写要经过 HTTP 落盘**（`/api/save` + SSE 轮询 800ms），而 DSH 里模型本来就通过文件工具写盘 → **两条写路径并存，必然出现竞态与"脏"判断混乱**。
2. **主题永远无法统一**（跨源拿不到令牌），"融合"目标落空。
3. **下游依赖 300+ 深路径**，上游每次重构都要同步改下游 → 正是用户担心的"两边各自修改"。

所以结论是：**先接口化，再集成**。这是 §3 的全部理由。

---

## 3. 目标架构：三仓库 + 一层契约

### 3.1 仓库划分

三个仓，各有单一职责——**仓 1 有代码、仓 2 只有文本、仓 3 是宿主适配**：

```
                    ┌────────────────────────────────────────┐
                    │ 仓 1：open-pptd（引擎 + CLI）           │
                    │  · packages/{model,renderer,writer,…}   │
                    │  · editor/  · bin/                      │
                    │  · contract.json（机器可读契约清单）     │
                    │  · scripts/install/{install.ps1,.sh}    │
                    │  · assets/{fonts,icons}/registry.json   │
                    │  发布：运行时 zip + 图标/字体资产包      │
                    │        + 安装脚本 + SHA256SUMS          │
                    └────────────────────────────────────────┘
                       ▲                                  ▲
     命令面 + 资源约定  │                                  │ 5 组契约 + contract.json
     doctor/serve/…     │                                  │
        ┌──────────────┴──────────────┐  ┌────────────────┴──────────────┐
        │ 仓 2：open-pptd-skill        │  │ 仓 3：dsh-plugin-pptd          │
        │  · SKILL.md                  │  │  · lib/index.js  Host 半边     │
        │  · references/（唯一副本）    │  │  · lib/client.js Client 半边   │
        │  · README.md                 │  │  · preset/「演示模式」         │
        │  纯 markdown，零可执行文件    │  │  · 零 @deepseek-ai/* 导入      │
        │  ~270 KB                     │  │  几十 KB                       │
        └──────────────────────────────┘  └───────────────────────────────┘
                    ✗ 仓 2 与仓 3 之间零依赖 ✗
```

| | 仓 1 `open-pptd` | 仓 2 `open-pptd-skill` | 仓 3 `dsh-plugin-pptd` |
|---|---|---|---|
| 角色 | 引擎 + CLI（**运行时**） | 内容面（**知识**） | DSH 适配 |
| 装到哪 | `~/.open-pptd/cli/versions/<ver>` | 各 agent 的 skills 目录 | DSH profile |
| 体积 | 发布 zip ~1.07 MB | ~270 KB | 几十 KB |
| 依赖方向 | 不依赖任何一方 | → 仓 1 的**命令面** | → 仓 1 的 **5 组契约** |
| 含可执行内容 | 有 | **无（纯 markdown）** | 有 |

**仓库边界的三条理由：**

1. **`editor/` 与 `packages/` 不能拆**：耦合是语义级的（元素类型注册表 `registerType` 的字段由 `model` 定义、由 `renderer` 与 `writer` 分片填充、由 `editor` 消费），拆开得再造一层同构注册协议，收益不抵成本。
2. **内容面必须整体属于仓 2**：`SKILL.md` 与 `references/` 同目录是 Agent Skills 的规范形态。实测引擎代码对 `references/` **只有注释引用、零读取**（唯一功能依赖是 `pack-release.mjs:33,39` 两行白名单），所以整体搬迁是零代码成本，并顺带让"漂移"物理上不可能（§3.8）。
3. **仓 2 与仓 3 必须互不认识**：两者都只依赖仓 1 的不同侧面（命令面 vs 代码契约），是"一个枢纽、两个互不相干的叶子"，任一方升级都不强迫另一方动。

### 3.2 依赖方向与同步原则（7 条铁律）

> 下文沿用简短记法：**A = 仓 1（引擎/CLI）**，**B = 仓 3（DSH 适配）**，**S = 仓 2（技能）**。

| 规则 | 内容 | 违反的后果 |
|---|---|---|
| **R1 单向** | 只允许 S → A 与 B → A。A 里**永不**出现 `dsh`/`harness`/`@deepseek-ai` 字样；**S 与 B 互不依赖、互不 import** | 双向耦合，三仓无法各自独立发布 |
| **R2 零 DSH 包导入** | B 的 Host 半边**不 import 任何 `@deepseek-ai/*`**，一切通过 `ctx` 服务 + `node:*`；工具用**纯对象**定义而不依赖 `defineTool` 类型辅助 | 绕开 §1.1 的 0.1.5/0.2.0 版本错配（profile 的 `node_modules` 是旧的，运行态在 asar 里） |
| **R3 契约化** | B 只 import A 的 **5 组**契约（§3.3）。入口是包根的 **`contract.json`**（npm 暂不发布，故这是必需手段）与 `exports` map；**B 不得出现任何 `packages/*` 深路径** | 上游重构即碎下游 |
| **R4 契约自检** | A 导出 `CONTRACT_VERSION`（整数）；B 启动时 `assertContract()` 比对，不符则**明确报错并提示升级**，而不是诡异失败 | 静默半坏 |
| **R5 内容面归属** | `SKILL.md` + `references/` 的**唯一副本在 S**（规范要求二者同目录、自包含），且 **S 不含任何可执行文件**；A 与 B 不持有、不复制、不转述方法论 | 内容双份必然漂移；技能仓含可执行内容会扩大审计面与信任面 |
| **R6 资源路径归属** | **只有 A 知道 `~/.open-pptd` 怎么解析**（`OPEN_PPTD_HOME` → `~/.open-pptd` → 包内回退）。B **绝不自己拼资源路径**，只调 `open-pptd/paths` 并把 `resourceRoots` 接到静态层 | 布局一变两边都要改；且 B 会绕过只读回退逻辑 |
| **R7 版本治理归属** | **装哪个 CLI 版本、兼容矩阵，由运维/部署方决定**，不进应用层。应用层只保留两件事：安装脚本暴露 `--version` 供运维锁定；仓 3 用 `CONTRACT_VERSION` 做 **fail-fast 诊断**（不匹配就立刻明确报错），**不做自动降级、不做静默兜底** | 把部署约束写死进应用代码；以及静默半坏难排查 |
| **R8 技能零依赖** | S **不声明依赖、不捆绑脚本、不调网络**。它对 CLI 的唯一假设是"命令面可用"，且**自检失败必须明确报告**，不得假装能继续 | 技能在但 CLI 不在 → 模型产出幻觉性结果 |

**"零 DSH 包导入"是 R2 的核心，值得展开。** 本地插件如果 `import "@deepseek-ai/dsh-tools"`，Node 解析会沿 `profiles/desktop/plugins/<x>/node_modules` → `profiles/desktop/node_modules` → `profiles/node_modules` 向上找，**命中 0.1.5 的旧树**，而宿主运行的是 asar 里的 0.2.0 → 两套 `Context`/Symbol 不一致，症状是工具注册静默失效或抛莫名的类型错。规避方式不是去对齐版本（那要求把 0.2.0 整树装进 profile，脆弱且臃肿），而是**根本不导入**：Cordis 的 `apply(ctx)` 是加载器调用、不是 import；工具用纯对象；配置用普通对象（schema 是可选的校验）；HTTP 用 `node:http`/`node:fs`；需要引擎能力时按 §3.6 的解析顺序定位 CLI 根，再读 `contract.json` 用 `pathToFileURL` 动态 import（**不声明 `peerDependencies`**，因为 npm 暂不发布；版本不匹配由 `contractVersion` fail-fast 诊断）。

### 3.3 契约面（Contract Surface）——本方案的技术核心

引擎仓需要把下面 **5 组**能力**官方化、冻结、写进文档、加契约测试**。这是"留出合适的接口"的具体内容。

#### 契约 1：可挂载编辑器 `createEditor`

```js
// open-pptd/editor
export function createEditor(rootEl, options) → EditorInstance
```

| 参数 | 说明 |
|---|---|
| `rootEl` | `HTMLElement`，编辑器挂载点（取代现在的 document 全局） |
| `options.deck` | 可选：`{ manifestText, pageFiles: Map<string,string> }` 初始文档；省略则由 `source.read()` 加载 |
| `options.source` | **`ProjectSource`（契约 2）**，必填 |
| `options.theme` | 可选：`{ tokens?: Record<string,string>, mode?: "light"\|"dark" }`（契约 3） |
| `options.chrome` | 可选：结构裁剪 `{ topbar?, brand?, github?, thumbbar?, quickbar?, zoom?, inspector? }` 或 `"full"`/`"embedded"` 预设 |
| `options.locale` | 可选：`"zh-CN"`（默认） |
| `options.on` | 可选事件回调：`ready / dirty / saved / error / deckChange / selectionChange` |

| 返回值 | 说明 |
|---|---|
| `ready: Promise<void>` | 首帧就绪 |
| `destroy(): void` | **幂等**；移除 DOM、解绑监听、关闭 `EventSource`、`disposeChartInstances`、清空 `dom` 缓存 |
| `api` | 现有 `EditorApi`（`select`/`updateSelected`/`deleteSelected`/`moveLayer`/`getPage`…） |
| `io` | 现有 io 面（`save`/`reload`…） |
| `state` / `view` / `controller` | 供深度控制；**标注为"不稳定"**，不属冻结契约 |

**这是 H1 + H2 + H3 的统一解法**：`boot()` 变成 `createEditor()` 的内部实现；`dom.js` 的 `byId()` 改成闭包级的 `byId(rootEl)`；`destroy()` 成为一等公民。

#### 契约 2：传输接缝 `ProjectSource`

```js
/**
 * open-pptd 只依赖这个鸭子类型接口（与现有 handle-io 的思路一致）。
 * 所有实现都必须通过 tests/regression/ 的同一套用例。
 */
interface ProjectSource {
  capabilities: {
    writable: boolean;      // 能否写回
    liveWatch: boolean;     // 是否支持订阅变更（否则回退轮询）
    binary: boolean;        // 是否支持二进制（图片/字体）
  };
  read(): Promise<{
    manifestText: string;
    pageFiles: Map<string, string>;          // "pages/01.page" -> 文本
    media?: Map<string, Uint8Array>;         // 可选：按需
  }>;
  write(files: Array<{ path: string, text?: string, bytes?: Uint8Array }>): Promise<void>;
  readMedia?(path: string): Promise<Uint8Array | null>;
  watch?(cb: (evt: { kind: "deck" | "page" | "media", path: string }) => void): () => void;
}
```

引擎仓提供 4 个实现（**全部在引擎仓，因为前三个与 DSH 无关**）：

| 实现 | 用途 | 现在对应 |
|---|---|---|
| `httpSource({ base = "", deckUrl })` | 现有 `serve` 的 fetch/SSE 模式；`base` 参数化解决 H4 | `loader.js` + `live-reload.js` |
| `directoryHandleSource(handle)` | 浏览器 File System Access | `handle-io.js` |
| `memorySource({ files })` | 测试与嵌入 | 新增 |
| *(适配仓自行实现 `dshSource`)* | 走宿主文件服务 + 宿主变更事件 | 新增，**在 B 里** |

**这解决了什么**：写路径归一。`saver.js` 不再知道 `/api/save`，只调 `source.write()`；`live-reload.js` 不再知道 `/events`，只在 `capabilities.liveWatch === false` 时回退轮询。

#### 契约 3：主题注入

```js
// open-pptd/editor
export function applyThemeTokens(rootEl, { tokens, mode }) → () => void   // 返回还原函数
export const TOKENS: string[]            // 引擎支持的令牌名（对标 tokens.css）
export function defaultTokens(mode)      // 内置 light / dark 两套
```

引擎仓必须**自己补齐一套 dark 值**（H5）——因为"合适的接口"不能是"把暗色留给下游猜"。

#### 契约 4：包级入口（`exports` map）

现在 300+ 深路径 → 收敛为 **8 个稳定入口**，其余标 `./internal/*`（明确"不保证稳定"）：

```json
{
  "name": "open-pptd",
  "type": "module",
  "exports": {
    ".":              { "default": "./packages/index.js" },
    "./model":        { "default": "./packages/model/index.js" },
    "./renderer":     { "default": "./packages/renderer/index.js" },
    "./writer":       { "default": "./packages/writer/index.js" },
    "./server":       { "default": "./packages/server/index.js" },
    "./editor":       { "default": "./editor/index.js" },
    "./paths":        { "default": "./packages/paths.js" },
    "./config":       { "default": "./packages/config.js" },
    "./cli":          "./packages/cli/index.js",
    "./editor/index.html": "./editor/index.html",
    "./package.json": "./package.json",
    "./internal/*":   "./*"
  },
  "bin": { "open-pptd": "./bin/open-pptd.js" },
  "files": [
    "bin", "packages", "editor", "contract.json", "index.html", "README.md", "LICENSE",
    "assets/icons/registry.json", "assets/fonts/registry.json"
  ]
}
```

> **一处重要事实修正**：open-pptd **暂不发布 npm**（实测 `npm view open-pptd` → 404），所以上面这个 `exports` map 目前只对"将来发 npm"和包内自引用有效。**当前真正的发布产物由 `scripts/pack-release.mjs` 的 `WHITELIST` 决定**（`git ls-files` 白名单 → `dist/open-pptd-v<ver>.zip`），`package.json` 的 `files` 字段此刻不参与。
>
> 两者的口径必须一致，否则将来一发 npm 就会漏文件。建议把 `WHITELIST` 与 `files` 抽成同一份数据的两个消费者。

**契约 4 的第二个入口：`contract.json`（npm 不发时的必需品）**

因为 CLI 是"解压到 `~/.open-pptd/cli/versions/<ver>` 的普通目录"，没有 `node_modules` 条目，仓 3 无法写 `import "open-pptd/model"`——而改成拼 `join(root,"packages","model","index.js")` 就**直接违反 R3**（依赖内部布局，一重构就碎）。

解法：包根放一份**机器可读的契约清单**，由 A 自己声明入口，B 只读它：

```json
{
  "name": "open-pptd",
  "contractVersion": 2,
  "entries": {
    "model":    "packages/model/index.js",
    "renderer": "packages/renderer/index.js",
    "writer":   "packages/writer/index.js",
    "server":   "packages/server/index.js",
    "editor":   "editor/index.js",
    "paths":    "packages/paths.js",
    "config":   "packages/config.js",
    "cli":      "packages/cli/index.js"
  },
  "bin": "./bin/open-pptd.js"
}
```

于是 B 的解析变成三步，且**内部布局始终是实现细节**：

```js
const root = resolveCliRoot();                                    // §3.6 的解析顺序
const c = JSON.parse(readFileSync(join(root, "contract.json"), "utf8"));
if (c.contractVersion !== EXPECTED) throw new Error(/* fail-fast，R7 */);
const { parseDeck } = await import(pathToFileURL(join(root, c.entries.model)).href);
```

**这件事能成立的前提是 A 零依赖**——它只 import `node:*` 与自己 vendored 的库，所以从任意路径 import 都不会触发依赖解析。零依赖在这里从"体积优点"变成了**架构资产**。

> `exports` map 保留（将来发 npm 时直接生效），与 `contract.json` 并存；两者的条目必须一一对应，由契约测试断言。

**`files` 要点**：**保留 `assets/icons/registry.json` 与 `assets/fonts/registry.json`（注册表与代码版本耦合）**，排除字体大件（17 个 TTF / 98.5 MB）。图标 SVG 不再随主包走——见 §3.6 的资产包方案（主 zip 保持 ~1.07 MB，同时离线可用）。

**深路径 → 目标入口的映射表**（下游只允许用右列）：

| 现有深路径（`editor/` 里的 43 处之一） | 目标入口 |
|---|---|
| `../../packages/model/registry.js` → `registerType/getType/allTypes` | `open-pptd/model` |
| `../../packages/model/model.js` → `nextElementId/deckSize/PAGE_WIDTH/SUPPORTED_SHAPES` | `open-pptd/model` |
| `../../packages/model/pptd-io.js` → `parseDeck/serializeDeck` | `open-pptd/model` |
| `../../packages/model/theme.js` → `resolveColor/THEME_PALETTES` | `open-pptd/model` |
| `../../packages/model/preset-geometry.js` + `.data.js` | `open-pptd/model` |
| `../../packages/model/icon-fa.js`、`font-registry.js`、`bytes.js` | `open-pptd/model` |
| `../../packages/renderer/page.js` → `renderPage/autoGrowTexts` | `open-pptd/renderer` |
| `../../packages/renderer/icon.js` → `iconThumb` | `open-pptd/renderer` |
| `../../packages/writer/pptx.js` → `buildPptx/downloadBlob` | `open-pptd/writer` |
| `../../packages/writer/zip.js`、`util.js` | `open-pptd/writer` |
| `../../packages/server/*` | `open-pptd/server` |
| `../../packages/cli/*` | `open-pptd/cli` |

#### 契约 5：资源与配置解析（`paths` / `config`）

资源外置是本方案里唯一"顺手解决多条风险"的动作，它的契约必须由引擎仓独占。

**目录布局**（`~/.open-pptd`，按职责分 6 类，不可混用；完整说明见 §3.6）：

```
%USERPROFILE%\.open-pptd\        ← os.homedir()/.open-pptd（Node 不展开 ~）；OPEN_PPTD_HOME 可覆盖
├─ assets\                       资源文件全部集中在此，根目录保持干净
│  ├─ fonts\                     17 个 TTF / 98.5 MB   ← 唯一的大件，可删可重下
│  └─ icons\                     {solid,regular,brands}/*.svg，2164 个 / 2.3 MB（可删可重下）
├─ cli\                          运行时：versions/<ver> + current 指针 + bin/ 启动器
├─ config.json                   用户级配置（带 version 字段，允许手改）
├─ state\
│  ├─ recent.json                最近项目（取代浏览器 IndexedDB → 解掉 R-10）
│  └─ serve.json                 serve --detach 的 pid/port（供 serve --stop）
├─ cache\                        可整目录安全删除
│  └─ render\                    渲染中间产物
└─ tmp\                          下载 / 解压临时区（原子 rename 的源地）
```

`assets/` 的结构**刻意与包内同名**（`assets/fonts/`、`assets/icons/`），所以解析链就是"同名目录按序叠加"，不需要任何映射表。

**明确不放进去的两样**：

| 不放 | 原因 |
|---|---|
| 用户项目（`.pptd` / `pages/` / `media/`） | 那是用户数据，应留在工作区；`~/.open-pptd` 只放"共享资源 + 用户级配置 + 状态" |
| `registry.json`（字体与图标注册表） | **与代码版本耦合**（含 `version`、`faVersion`、字段 schema 对齐 `model/validate.js`）。若随资源进 home，用户会在升级代码后留下旧注册表 → 诡异不匹配。**永远读包内** |

**读三级 / 写一级**（这条规则决定了以后不会出乱子）：

| 动作 | 规则 |
|---|---|
| **读** | `$OPEN_PPTD_HOME` → `~/.open-pptd` → `<包根>/assets`（首个命中即用） |
| **写** | **永远写 `~/.open-pptd`**，绝不写进包内 |

写策略必须单向的理由：npm 安装目录可能只读；pnpm store 是内容寻址的，往里写会污染校验。所以"下载"只能落用户目录，包内资源永久只读。

**关键实现决策：解析链落在静态服务层，浏览器 0 行改动。**

现状是浏览器按"站点根相对"请求资源（`model/font-registry.js:66` 的 `fontFileUrl()`、`model/icon-fa.js:100` 的 `localUrl`），若资源搬走就会 404。因此**不修改浏览器代码**，而是让静态解析按序尝试：

```
浏览器仍请求            assets/fonts/AlimamaDaoLiTi.ttf
静态解析（Node）按序尝试  ① $OPEN_PPTD_HOME/fonts/AlimamaDaoLiTi.ttf    ← 下载落点
                        ② <包根>/assets/fonts/AlimamaDaoLiTi.ttf        ← 只读回退（现有安装零迁移）
                        ③ （浏览器端已有的远端回源兜底，GitHub Pages 走这条）
```

由此三方白拿：独立 `serve` 无需改浏览器；DSH 适配仓走同一条链、行为一致；无 Node 的 GitHub Pages 继续走远端回退，**无回归**。

**常量必须拆成"注册表目录"与"字节目录"两个**（现有的 3 个常量在 `packages/cli/export.js:23-25` 单点）：

| 常量 | 指向 | 内容 | 消费方 |
|---|---|---|---|
| `FONT_REGISTRY_DIR` | **包内** `assets/fonts` | 只 `registry.json` | `loadFontRegistry({ fontDir })` |
| `ICON_REGISTRY_DIR` | **包内** `assets/icons` | 只 `registry.json` | `icon-fa.js` 的 Node 分支 |
| `FONT_BYTES_DIR` | `~/.open-pptd/assets/fonts` | 17 个 TTF | `writer/font.js` 的 `options.fontDir` |
| `ICON_BYTES_DIR` | `~/.open-pptd/assets/icons` | SVG（回退包内预置） | `icon-fa.js` / `cli/assets.js` |

**契约签名**：见附录 D.8。

**零迁移**：仓库内现有 17 个 TTF（98.5 MB）**不需要搬**——②作为只读回退继续生效，新下载自动落到①。需要收拢时提供 `open-pptd home migrate` 作一次性搬运，但非必需。

**并发原子性（本契约引入的新问题，必须一并解决）**：CLI 与适配仓 Host 半边**可能同时下载同一字体**；现有 `cli/fonts.js` 用 `writeFileSync` 直写，会产生半截文件，而"✓/✗"判断只看 `existsSync` → **半截 TTF 会被当成已安装，导出时才炸**。修法：

1. 下载到 `tmp/<random>.part` → 完成后 `rename()` 到目标（同盘 rename 原子）；
2. 可选 `tmp/fonts.lock` 抑制重复下载；
3. `✓/✗` 判定改为"存在 **且** size 与注册表声明一致"。

**配置**：`config.json` 带 `version`，`readConfig()` 负责默认值合并与逐版本迁移；`writeConfig(patch)` 做浅合并写回。适配仓在设置页展示 `home` 的实际路径——用户得知道东西存在哪。

**为什么 `~/.open-pptd` 而不是平台分叉**（`%LOCALAPPDATA%` / XDG）：open-pptd 是跨平台零依赖项目，单一点目录最可预测、文档与 SKILL 最好写；平台差异用 `OPEN_PPTD_HOME` 兜底即可。**不做平台分叉，避免"三种路径三套文档"。**

### 3.4 适配仓结构

```
dsh-plugin-pptd/
├── package.json          # exports "." 与 "./client"；dsh.client = { platform: "web" }（无 inject/external）
├── lib/
│   ├── index.js          # Host 半边：零 @deepseek-ai/* 导入
│   ├── client.js         # Client 半边：手写 __ModuleLoader__ bundle，仅 require("react")
│   ├── engine.js         # 按 §3.6 解析 CLI 根 + 读 contract.json + fail-fast 自检
│   ├── routes.js         # 注册 /pptd/**（静态 + api + events）
│   ├── resources.js      # 把 /pptd/assets/** 接到 open-pptd/paths 的 resourceRoots（不自己拼路径）
│   ├── source.js         # dshSource：ProjectSource 的宿主实现
│   ├── tools.js          # pptd_check / pptd_export / pptd_render / pptd_fonts / pptd_preview
│   └── theme.js          # --dsw-alias-* → open-pptd TOKENS 映射（含 dark）
├── preset/               # 「演示模式」
│   ├── preset.yml
│   └── agent.cordis.yml  # customSkillDirs 指向已安装的技能目录（仓 2），不用仓 1 的包目录
└── test/
    ├── contract.test.js  # 与引擎仓 CONTRACT_VERSION 对齐
    └── smoke.test.js     # 真机冒烟：路由可达、bundle 可载、工具可调
```

### 3.5 为什么"接口优先"而不是"两边各自改"

| 做法 | 上游重构一个文件 | 下游想加个面板 | 版本组合 | 结论 |
|---|---|---|---|---|
| 两边各自改（现状惯性） | 下游必碎，需同步改 | 可能被迫改上游 | 只能同版本 | ❌ |
| 深路径直连 | 下游必碎 | 可以 | 只能同版本 | ❌ |
| **5 组契约** | 下游不受影响（契约未变） | 完全在下游做 | A 大版本内自由组合 | ✅ |

一句话：**接口的价值不是"现在省事"，而是"以后两个仓可以各自往前走"。**

### 3.6 分发、安装与三仓解耦

**安装边界：脚本只装 CLI，不装技能。** 技能由各 agent 自己放进 skills 目录（DSH 的 preset 还可直接指过去），这样三仓才真正互不牵制。

**`~/.open-pptd` 布局**（`OPEN_PPTD_HOME` 可覆盖）：

```
~/.open-pptd/
├── assets/                    ← 资源文件全部集中在此，根目录保持干净
│   ├── fonts/                 17 TTF / ~98.5 MB（可删可重下）
│   └── icons/                 {solid,regular,brands}/*.svg，2164 个 / 2.3 MB
├── cli/
│   ├── versions/<ver>/        解压的运行时（bin/ packages/ editor/ contract.json）
│   ├── current                → junction / symlink 指向 versions/<ver>
│   └── bin/open-pptd{,.cmd}   启动器
├── config.json
├── state/recent.json · state/serve.json
├── cache/render/
└── tmp/
```

`assets/` 的结构**刻意与包内同名**（`assets/fonts/`、`assets/icons/`），于是解析链就是"同名目录多根叠加"，不需要任何映射表：

```
请求 assets/fonts/X.ttf  →  ① ~/.open-pptd/assets/fonts/X.ttf
                            ② <cliRoot>/assets/fonts/X.ttf     ← 只读回退
registry.json            →  只查 ②（版本耦合，永不被 home 遮蔽）
```

**为什么用版本化子目录 + `current` 指针**：升级 = 解压新版本 + 切换指针，**原子且可回滚**；`~/.open-pptd` 成为唯一根，`rm -rf` 即彻底卸载；用户资源在 `assets/`，切换版本时**一行不动**。

**启动器不写死 Node**（Node 可能由 nvm/fnm/volta 管理，PATH 因 shell 而异，必须在**调用时**解析）：

```cmd
:: %USERPROFILE%\.open-pptd\cli\bin\open-pptd.cmd
@echo off
node "%~dp0..\current\bin\open-pptd.js" %*
```

```sh
#!/bin/sh
# ~/.open-pptd/cli/bin/open-pptd
exec node "$(dirname "$0")/../current/bin/open-pptd.js" "$@"
```

前置做一次 `node --version` 检查，缺失就明确报错，不要静默失败。

**PATH 策略（不需要管理员，不改系统变量）**

| 平台 | 做法 |
|---|---|
| **Windows** | 读 `HKCU:\Environment` 的 `Path`（用户级），不含 `%USERPROFILE%\.open-pptd\cli\bin` 则追加，用 `[Environment]::SetEnvironmentVariable("Path", $v, "User")` 写回，再广播 `WM_SETTINGCHANGE`；同时把该目录加进当前会话 `$env:Path`，让本次立即可用。**不要用 `setx`**（1024 字符截断风险 + 会展开变量） |
| **Linux / macOS** | 优先写 `~/.local/bin/open-pptd`（若该目录已在 PATH）；否则在 `~/.profile` 与 `~/.zshrc` 写入**带标记的幂等块**（`# >>> open-pptd >>>` … `# <<< open-pptd <<<`），重复安装不会写两遍 |

> ⚠️ **PATH 变更对已经运行的进程无效。** DSH 桌面进程若在安装前启动，它派生的 shell **看不到**新 PATH。
> 因此：**PATH 是给人和终端用的；仓 3 绝不依赖 PATH**，而是按固定位置读文件（见下）。安装完成的输出必须写清"需新开终端 / DSH 需重启"。

**仓 3 的引擎解析顺序（读文件，不查 PATH）**

```js
1) process.env.OPEN_PPTD_CLI
2) join(os.homedir(), ".open-pptd", "cli", "current")     // 安装脚本写的指针
3) 从 PATH 找 open-pptd 反推包根                            // 兜底，非依赖
4) 都失败 → 明确报错"请先运行安装脚本 <命令>"，并可选提供需显式确认的 pptd_install 工具
```

**安装脚本骨架**（`install.ps1` 与 `install.sh` 同构，10 步）

```
1) 幂等探测   已装且版本满足 → 打印版本与路径后直接退出（不写任何东西）
2) 前置检查   node 存在？目标目录可写？
3) 下载       releases/<tag>/open-pptd-v<ver>.zip      ← 固定 tag，不用滚动分支
4) 校验       SHA256SUMS 比对，不符即中止并清理临时文件
5) 解压       tmp/ → cli/versions/<ver>（解压完再 rename，避免半截安装）
6) 切换指针   current → versions/<ver>
7) 启动器     cli/bin/open-pptd{,.cmd}
8) PATH       按上表幂等追加
9) 可选       assets sync icons（默认）／fonts（询问）
10) 收尾      打印版本 / 路径 / 是否需新开终端 / 下一步
```

`--version <ver>` / `-Version <ver>` 留给运维锁定版本（R7）；脚本内部**必须做校验和验证**，不因为图方便省掉。

**发布资产清单**——`release.yml` 目前只上传 zip，必须补齐，否则文档里的安装 URL 会 404：

```
dist/open-pptd-v<ver>.zip          运行时（~1.07 MB / 167 项）
dist/open-pptd-icons-v<ver>.zip    图标全量（~1 MB，保持 solid/regular/brands 结构）
dist/open-pptd-fonts-v<ver>.zip    字体全量（~95 MB，17 TTF）
dist/install.ps1  dist/install.sh  安装脚本
dist/SHA256SUMS                    校验和
```

让 `pack-release.mjs` 顺手把安装脚本与校验和复制进 `dist/`，然后 `gh release create "$TAG" dist/*` 一行全带走。

**资源改为"资产包"，不再逐文件下载**

现状 `cli/icons.js` 是**逐个 SVG 下载**（2164 次请求），`cli/fonts.js` 是 17 个文件 6 并发 + 两段式超时——两者都在自造下载器。改为一条统一命令：

```
open-pptd assets list                                   状态（装了哪些、版本、体积）
open-pptd assets sync [icons|fonts|all] [--from <zip>]  下载 → 校验 → 解压到 assets/
open-pptd assets clean                                  清缓存
```

- **一次请求代替 N 次**：图标 2164 次 → 1 次，字体 17 次 → 1 次，且可带重试；
- `--from <zip>` 是**离线路径**（用别人拷来的 zip 装）；
- **注册表永不进 `assets/`**，永远随 CLI 包（版本耦合）；
- 旧的 `fonts download <名称>` / `icons download` 保留为兼容别名，内部转发到 `assets sync`；
- 安装脚本**默认装图标**（1 MB 很便宜且离线可用），字体询问或按需——这同时化解了此前"图标预置随包"与白名单"图标不进包"的矛盾：**不塞进主 zip，而是作为独立资产由安装脚本默认装上。**

**迁移路径（breaking change，必须写进 release notes）**

改造后仓 1 **不再是一个"能直接丢进 skills 目录"的仓库**。现有用户（含本机那个 junction）里 `<skills>/open-pptd/` 是一整个引擎仓：

```
1) 装 CLI     运行 install.ps1 / install.sh
2) 装技能     把仓 2 放到 <skills>/open-pptd/（替换旧的引擎仓目录）
3) 资源       可选 open-pptd assets sync
4) 验证       open-pptd doctor
```

**安全默认**：SKILL.md 引导模型**先告知用户将要发生什么**（下载并执行安装脚本、写入 `~/.open-pptd`、改用户级 PATH），再执行。

#### 导出前置资源体检（按需补齐）

**要解决的静默降级**：导出时若字体没下载，`writer/font.js:96-100` 只 `console.warn` 后返回 `null` → **该字体静默跳过嵌入**，PPTX 回退系统字体，用户不一定察觉。而且 `loadFontBytes` 里 `if (spec.file)` 先命中，**`spec.url` 分支永远不会为注册表字体执行**，所以即使注册表带着远程地址，Node 导出也不会去取。

实测本机 **27 个注册字体里 11 个缺失**——这正是本功能要消灭的场景。

**设计：把"取资源"从 writer 里拿出来，做成导出前的一个阶段。**

| 为什么不在 `writer` 里补下载 | 说明 |
|---|---|
| **破坏纯函数** | `buildPptx` 目前零 IO（只接受注入的 `fs.readFileSync`）。塞进下载 = 它偷偷联网，可测试性归零 |
| **字体是整体性资源** | 缺一个就整个跳过。体检能给出**完整清单**；writer 内补是"跑到哪个算哪个"，错误时机晚 |
| **不落盘** | writer 内 `fetch` 不会写进 `assets/`，每次导出都要重下 |
| **职责** | 资源获取属于 CLI 的资源面，不属于 OOXML 生成器 |

**五步流程**（`export` 默认前置；也可单独跑 `open-pptd ensure <manifest>`）：

```
① 收集引用   解析 deck → findFont 收集字体名 / icon-fa 收集图标 / 扫 media/*
② 三级比对   ~/.open-pptd/assets → <cliRoot>/assets → 判定 will-cdn | system | missing
③ 按需补齐   只下"缺失的、且注册表带 url/mirrors 的"，复用既有下载器
             （magic 前 4 字节校验 + size 与注册表比对 + 镜像回退 + 源健康降级 + 并发 6）
④ 再校验     重跑 ②；仍缺的列出原因
⑤ 导出       把"实际嵌入 / 跳过"的清单带进结果
```

```
$ open-pptd export deck.pptd
▸ 资源体检（deck.pptd 引用：字体 3 · 图标 42 · 媒体 6）
    得意黑     ✗ 缺失（~/.open-pptd/assets 与包内均无）
    思源黑体    ✓     站酷快乐体 ✓
    图标 42 ✓      媒体 6 ✓
▸ 按需补齐（1 个，约 2.5 MB；--offline 可跳过）
    ⠋ 得意黑  SmileySans-Oblique.ttf   主源 → 2.6 MB
    ✓ 已落盘 ~/.open-pptd/assets/fonts/SmileySans-Oblique.ttf（size 校验通过）
▸ 导出
    ✓ out/deck.pptx  1.8 MB
      嵌入字体 3（得意黑 子集 12 KB · 思源黑体 子集 88 KB · 站酷快乐体 全量 1.2 MB）
      跳过 0
```

| flag | 语义 |
|---|---|
| （默认） | 体检 + **自动补齐** |
| `--offline` / `--no-auto-fetch` | 只体检、不下载；缺的降级为跳过嵌入 |
| `--strict` | 有任何缺失即**非零退出**（CI / 交付场景用，保证 PPTX 一定嵌了字体） |
| `--json` | stdout 一行结构化结果：`{checked, fetched[], embedded[], skipped[], missing[]}` |

**失败必须软降级**：网络断 / 源不可达 → 警告 + 跳过嵌入 + **仍然导出成功**，保持既有的"不下载不影响导出"承诺。绝不因为下不了字体就导不出。

**覆盖范围**（"不管是字体也好，其他资源也好"）：

| 资源 | 缺了怎么办 | 阻塞导出 |
|---|---|---|
| 字体（注册表命中） | **自动下载**（`url` → `mirrors`） | 否，降级为跳过嵌入 |
| 字体（`registry.systemFonts`） | 无需下载，仅声明不嵌入 | 否 |
| 字体（未注册名） | 无法获得 → 提示"视为系统字体声明" | 否，但**文案要改**（现在指 `references/design.md §4`，那份文档已迁到仓 2，见 §3.8） |
| 图标 SVG | 有 CDN 兜底（`faCdnUrls`） | 否 |
| deck 引用的媒体（`media/*`） | **项目内文件，缺了必须报错** | **是**（这是真错误，不是"资源没下"） |
| vendor 库（echarts / katex / js-yaml） | 随包，不查 | — |
| Node 版本 / render 用浏览器 | 由 `doctor` 覆盖 | 仅 `render` 时 |

**"只下用到的"是本设计最省体积的一点**：27 个注册字体里一份 deck 通常只用 2–4 个；全量缺失约 30–50 MB，按需通常只有几 MB。**因此不必再 `fonts download all`**——这也顺带把之前担心的 98.5 MB 问题从"必须全量"降为"用多少下多少"。

**归属**：纯仓 1 能力（`cli/export.js` + `cli/assets.js` + `cli/fonts.js`），归入 P0-12。**DSH 侧自动继承**——`pptd_export` 工具走同一实现，所以模型在 DSH 里导出也会自动补齐。

### 3.7 版本治理归属

**原则（R7）：应用层不做版本管理。**

| 层 | 做什么 | 不做什么 |
|---|---|---|
| **运维 / 部署方** | 决定装哪个 CLI 版本（`--version`）、维护兼容矩阵、决定是否随包分发资产 | — |
| **安装脚本** | 暴露 `--version`；默认取 `latest`；打印实际装到的版本 | 不做兼容范围校验、不做多版本共存管理 |
| **SKILL.md（仓 2）** | 只做**存在性自检**：`open-pptd doctor` 有输出就继续，缺就给安装命令 | **不声明 `requires-cli`、不校验版本区间**——那是部署策略，不是技能的事 |
| **仓 3** | `CONTRACT_VERSION` **fail-fast**：不匹配立刻明确报错并列出双方版本 | 不自动降级、不静默兜底、不做版本区间协商 |

**为什么仓 3 保留检查而 SKILL.md 不保留**——两者性质不同：

- 技能与 CLI 之间是**命令面**耦合（`doctor` / `serve` / `assets`）。命令不存在会直接失败报错，**本身已是 fail-fast**，再加版本守门只是把部署策略写进技能。
- 仓 3 与 CLI 之间是**代码 API**耦合（5 组契约）。不匹配时的症状是"注册成功但不生效""渲染结果不对"这类**静默半坏**，必须在启动时炸掉。这是**诊断**，不是版本管理。

### 3.8 内容面归属与漂移守卫

**归属**：`SKILL.md` + `references/` 的**唯一副本在仓 2**，与技能同目录（Agent Skills 规范形态）；仓 1 与仓 3 都不持有、不转述。

**搬迁成本为零**——实测引擎对 `references/` 的引用**全是注释**：

| 出现处 | 性质 |
|---|---|
| `style-spec.js:13,26,78`、`svg-gradient.js:4`、`theme-presets.js:4`、`theme.js:4,24`、`validate.js:107`、`gradient.js:4`、`meta.js:4`、`font-manager.js:13`、`gen-preset-geometry.mjs:24` | 注释（"对齐 references/pptd.md §3 Theme"之类） |
| `pack-release.mjs:33,39` | 白名单两行——唯一功能依赖，**删掉即可** |
| `packages/writer/font.js:144` | 一句提示文案，需改指 `open-pptd assets list`（原文指 `references/design.md §4`） |

`references/` 共 11 个文件、约 270 KB：`design.md` 41.7 KB、`pptd.md` 79.6 KB、`shapes.md` 15.3 KB、`slides_categories/*` 8 个共 ~113 KB。

**漂移守卫**：`references/` 是手写文本，但它描述的是引擎实现的契约，所以下面四项声明**全部可机器核对**：

| references 的声明 | 引擎的事实来源 | 核对方式 |
|---|---|---|
| `pptd.md §5` 类型专属必填字段 | `packages/model/validate.js` 的 schema 表 | 键名集合比对 |
| `pptd.md §3 Theme` 结构 | `packages/model/theme.js`、`theme-presets.js` | 键名集合比对 |
| `shapes.md` 的 177 种形状 + 10 种连接线 | `scripts/gen-preset-geometry.mjs` 的几何数据 | 计数比对 |
| `design.md §4` 字体注册名 | `assets/fonts/registry.json` | family / alias 集合比对 |

守卫实现：仓 2 的 CI（或仓 1 的一次性任务）拉 `open-pptd-v<ver>.zip` 解到临时目录，跑上述四项比对，任一不符即报错"references 需随引擎更新"。**这是纯只读比对，不需要两个仓互相依赖**（符合 R1）。

**同 tag 约定（建议而非强制）**：仓 1 与仓 2 用同一版本号打 tag（`v2.0.0` ↔ `v2.0.0`），让"哪份 references 对应哪个引擎"在 tag 层面自明。这属于运维便利，不构成代码耦合。

**白名单调整**：`pack-release.mjs` 的 `WHITELIST` 删掉 `"SKILL.md"` 与 `"references"`（167 项 → ~155 项），并加上 `"contract.json"`。

---

## 4. 引擎仓（open-pptd）改造设计

### 4.1 改造分级

| 级别 | 内容 | 破坏性 | 工期 | 谁需要 |
|---|---|---|---|---|
| **L0** | `exports` map + 包级 barrel（契约 4） | 无（纯新增） | 1–2 天 | B（定位与导入） |
| **L1** | `ProjectSource`（契约 2）+ 主题注入（契约 3）+ 暗色令牌 | 内部重构，**外部行为不变** | 2–3 天 | B（传输与主题） |
| **L2** | `createEditor(rootEl, options)` + `destroy()` + 去 `dom.js` 单例（契约 1） | 内部重构，`main.js` 行为不变 | 2–3 天 | B（同源挂载与深控） |
| **L3** | **UI 体系重构（减法优先）**：选择模型多选化 + 令牌体系重建 + 组件原语层 + 信息架构精简（详见 §6.4–6.13） | 大（**行为有变化**：新增多选/框选/右键菜单） | 2–3 周（分两刀） | A + 所有使用者；**是"融合"与"简洁锐利"体验的主要来源** |
| **L4** | 组件化（可选）：属性面板/工具栏/缩略条 React 化；画布与图表表格编辑器保留 | 大 | 1–2 周 | 可选，P4 |

**L0–L2 必做**（P0，功能零变化）；**L3 强烈建议**——它是"操作方式 PowerPoint 化 + 深浅色 + 简洁锐利"的落地处，且与 L2 天然衔接（`createEditor` 闭包化正是重写选择状态的最佳时机）；L4 列为可选。

### 4.2 文件级任务清单

#### L0：包级入口（纯新增，零风险）

| 文件 | 动作 | 说明 |
|---|---|---|
| `packages/model/index.js` | **新增** | 导出 `parseDeck/serializeDeck/createDeck/createPage/nextElementId/deckSize/PAGE_WIDTH/PAGE_HEIGHT/PAGE_TYPES/SUPPORTED_SHAPES/registerType/getType/allTypes/resolveTheme/resolveColor/THEME_PALETTES/mergePaletteColors/DEFAULT_THEME/resolveFont/DEFAULT_FONT/validateDeck/registerRule/walkElements/collectImageSrcs/ELEMENT_TYPES/shapePaths/shapeMenuIcon/PRESET_SHAPES`，并以命名空间导出 `chart`（`CHART_META`/`buildChartOption`/`resolveChartSpec`…）、`icons`（`loadIconRegistry`/`resolveIconName`/`fetchIconSvg`）、`fonts`（`loadFontRegistry`/`findFont`/`fetchFontBytes`）、`bytes`（`bytesToBase64`/`base64ToBytes`） |
| `packages/renderer/index.js` | **新增** | 导出 `renderPage/autoGrowTexts/disposeChartInstances/iconThumb`，命名空间 `renderers`（`renderText/renderShape/renderLine/renderImage/renderIcon/renderTable/renderChart/pageBackground`） |
| `packages/writer/index.js` | **新增** | 导出 `buildPptx/downloadPptx/downloadBlob/magicMatches/ZipWriter`，命名空间 `xml`/`parts`/`text`（供高级用法） |
| `packages/cli/index.js` | **新增** | 导出 `runCheck/exportDeck/exportProject/runRender/runFonts/runIcons/runGallery`（把 `bin.js` 的编排变成可编程 API） |
| `packages/index.js` | **新增** | `export const CONTRACT_VERSION = 2;` + 再导出五个子入口（含 `paths`/`config`） |
| `package.json` | 修改 | 加 `exports`（§3.3 契约 4）、`files`（**排除 `assets/fonts` 的 TTF**，保留 `registry.json` 与预置图标）、`version: 2.0.0` |
| `docs/embedding.md` | **新增** | 面向下游的契约文档：5 组接口、不变量、弃用策略、示例 |

**护栏同步加固**（同 PR 内）：

| 文件 | 动作 |
|---|---|
| `tests/regression/dep-graph.mjs` | 扩展规则：① `packages/*/index.js` barrel **不得**导入 `editor/`；② `editor/` **不得**出现 `../../packages/*/` 深路径（必须走 `open-pptd/model` 等入口，用相对入口 `../packages/model/index.js` 表达）；③ 保留既有四条 |
| `tests/contract/public-api.mjs` | **新增**：断言 barrel 导出名齐全、`CONTRACT_VERSION` 存在、`createEditor` 生命周期、4 个 `ProjectSource` 实现跑同一套用例 |

#### L1：传输接缝与主题（内部重构）

| 文件 | 动作 | 要点 |
|---|---|---|
| `editor/app/project/source.js` | **新增** | 定义 `ProjectSource` 契约 + `httpSource({base,deckUrl})` / `directoryHandleSource(handle)` / `memorySource({files})`。把 `loader.js` 的 `applyDeck` 抽为**导出的** `applyDeck(source, {state,view,images,fontManager})` |
| `editor/app/project/loader.js` | 重写为薄适配 | 内部改用 `source.read()`，保留对 `saver/live-reload` 的既有对外行为 |
| `editor/app/project/saver.js` | 修改 `saveProject()` | 删除字面量 `fetch("/api/save")`；改为 `source.write()`；`source.capabilities.writable === false` 时回退现有 zip 下载 |
| `editor/app/project/live-reload.js` | 修改 | 删除字面量 `new EventSource("/events")`；`capabilities.liveWatch` 为真则订阅 `source.watch()`，否则回退 `POLL_INTERVAL_MS = 800` 指纹轮询（保留 1500ms 保存抑制窗口） |
| `editor/app/project/handle-io.js` | 保留，改由 `directoryHandleSource` 包装 | 该文件的鸭子类型设计**已经是对的**，无需重写；`tests/regression/handle-io.mjs` 继续生效 |
| `editor/theme.js` | **新增** | `TOKENS`（令牌名清单）、`defaultTokens("light"\|"dark")`、`applyThemeTokens(rootEl, {tokens, mode})` → 返回还原函数 |
| `editor/styles/tokens.css` | 修改 | 保留现有 `:root`（light 默认），**新增 `[data-pptd-theme="dark"]` 块** |
| `editor/interaction/*.css` 硬编码色 | 修改 | 见 §4.2.1 的暗色工作清单 |
| `editor/index.html` | 修改 | 增加挂载点 `<div id="pptd-root">`；顶栏品牌链接 `a.brand-home[href="../"]`（会导航去画廊）在 embedded 模式下改为禁用；GitHub `target="_blank"` 同理 |

##### 4.2.1 暗色主题的工作清单（已核查，非估算）

`tokens.css` 是全项目唯一的 `:root`，需要新增一套 dark 值。**此外有 8 处硬编码颜色绕过了令牌**（dark 下会露馅）：

| 文件:行 | 硬编码 | 处置 |
|---|---|---|
| `styles/responsive.css:42` | `rgba(28,37,50,.16)` 阴影 | 改用 `--shadow-*` |
| `styles/thumbbar.css:74,75,92,93` | `rgba(28,37,50,.65)` / `#fff` / `rgba(28,37,50,.6)` / `rgba(255,255,255,.85)` | 改用令牌（缩略条上的悬浮标签） |
| `styles/inspector.css:34` | `rgba(28,37,50,.42)` 遮罩 | 新增 `--mask` 令牌 |
| `styles/inspector.css:179` | `rgba(0,0,0,.12)` 色块描边 | 新增 `--chip-border` |
| `styles/dialogs.css:9` | `rgba(28,37,50,.45)` 遮罩 | 同 `--mask` |
| `styles/excel-grid.css:12,15` | 浅蓝 inset 选中态 | 改用 `--primary-soft`/`--primary-tint` |
| `styles/present.css`（12 处） | 黑/白 | **保持不动**：放映面是投影表面，本就该中性 |
| `styles/{gallery,fab,controls}.css` | `#fff` 文字 | 按钮前景，随 `--primary` 走，dark 下通常仍成立；逐个目视核对 |

#### L1.5：资源与配置外置（契约 5）

| 文件 | 动作 | 要点 |
|---|---|---|
| `packages/paths.js` | **新增** | `openPptdHome()`（`OPEN_PPTD_HOME` → `os.homedir()/.open-pptd`）、`ensureHome()`、`paths{home,config,fonts,icons,state,cache,tmp}`、`resourceRoots{fonts:[home,包内],icons:[home,包内]}` |
| `packages/config.js` | **新增** | `readConfig()`（默认值合并 + 逐版本迁移）、`writeConfig(patch)` |
| `packages/cli/export.js:23-25` | 修改 | **拆常量**：`FONT_REGISTRY_DIR`/`ICON_REGISTRY_DIR`（包内，注册表）/ `FONT_BYTES_DIR`/`ICON_BYTES_DIR`（home，大件）；保留 `FONT_LIB_DIR`/`ICON_LIB_DIR` 作兼容别名 |
| `packages/server/static.js` | 修改 | `resolveFile()` 支持**多根按序尝试**；`registry.json` 永远只查包内 |
| `packages/server/index.js` | 修改 | `createServer({ resourceRoots })`，默认取 `paths.resourceRoots` |
| `packages/cli/fonts.js`、`packages/cli/icons.js` | 修改 | 写盘目标改 home；下载改 `tmp/*.part` → `rename()` **原子落地**；`✓/✗` 判定加 size 校验 |
| `packages/model/font-registry.js`、`packages/model/icon-fa.js` | 修改 | **仅 Node 分支**：`fontDir` 由调用方传入注册表目录。**浏览器分支一行不动** |
| `editor/app/project/font-manager.js`、`editor/interaction/font-panel.js` | 检查 | 确认它们只走"站点根相对"URL，不自行拼绝对路径 |
| `tests/regression/resource-paths.mjs` | **新增** | 断言：三级解析顺序、`registry.json` 不被 home 遮蔽、并发下载不产生半截文件、旧仓库布局零迁移可用 |
| `tests/regression/package-integrity.mjs` | 修改 | 断言 `npm pack` 不含 TTF、包含 `assets/icons` 与两个 `registry.json` |

**"浏览器 0 行改动"是本设计的核心取舍，必须由 `resource-paths.mjs` 长期守住。**

#### L1.6：CLI 作为独立产品的打磨（与 DSH 适配无关，可独立发布）

这一组改动的动机不是 DSH，而是**"其他 agent 与人类用户"的体验**——仓 1 解耦后必须自己站得住。

| 命令 / 文件 | 动作 | 要点与理由 |
|---|---|---|
| `open-pptd doctor [--json]` | **新增** | 一次输出 `cli` / `node` / `home`（含可写性）/ `assets`（字体与图标就绪数）/ `path` 五项事实。一个命令同时服务三方：**模型自检、安装脚本收尾验证、用户排障**；能判别三种高频失败态——缺 CLI、装了但 PATH 没配、有 CLI 但资源没下 |
| `open-pptd paths [--json]` | **新增** | 输出 `home` 与各资源目录，是 `contract.json` 的"运行时对应物"，供模型与脚本定位 |
| `open-pptd assets list\|sync\|clean` | **新增** | 替代逐文件下载：图标 2164 次请求 → 1 次，字体 17 次 → 1 次；`--from <zip>` 提供离线路径。注册表**仍随包** |
| `open-pptd ensure <manifest>` | **新增** | **导出前置资源体检 + 按需补齐**（§3.6）。收集 deck 引用的字体/图标/媒体 → 三级比对 → 只下缺失的 → 再校验。可单独跑（CI / 预检） |
| `open-pptd export` 的前置阶段 | 修改 | `export` / `export-project` 默认先跑上面的体检（`--offline` 关闭、`--strict` 硬失败、`--json` 结构化输出）。**软降级**：补不齐则跳过嵌入并明确告警，仍导出成功 |
| `packages/writer/font.js:88` | 可选兜底 | `catch` 里若 `spec.url` 存在则尝试一次 `fetch`（约 5 行），作为"未走 CLI 前置"的临时补丁；**主路径仍是 preflight**（writer 内 fetch 不落盘、破坏纯函数） |
| `open-pptd serve --detach` | 修改 | 派生 detached 子进程（`detached:true` + `unref()` + `stdio:"ignore"`），父进程打印结果后**立即退出**。否则前台阻塞会让 agent 的 bash 工具挂死或被超时强杀——**进程一死端口即释放，用户点开链接直接连不上** |
| `open-pptd serve --json` | 修改 | **stdout 只输出一行机器可读 JSON**（`{url,port,pid}`），人类文案全部走 **stderr**。否则 agent 只能去正则扒 `server/index.js:101` 那行中文，且端口可能因顺延（`55173~55182`）而变 |
| `open-pptd serve --stop` | 修改 | 读 `state/serve.json` → 校验 pid 存活**且确为本程序启动** → 终止并删状态文件（**陈旧 pid 不误杀**）。现状无任何停止方式，只能杀进程、残留占端口 |
| `open-pptd serve --open` | 修改 | 可选：唤起默认浏览器（非 DSH 场景很实用） |
| `open-pptd fonts download` / `icons download` | 保留 | 兼容别名，内部转发到 `assets sync`，不让已有文档与用户肌肉记忆失效 |
| `packages/cli/bin.js` | 修改 | 命令表与 `usage()` 同步 |

> **已有的好行为不要动**：`server.listen(port, "127.0.0.1")`、`EADDRINUSE` 最多顺延 10 个端口、`port: 0` 取随机端口、`/editor/?deck=<相对路径>` 作为编辑器入口（根路径留给画廊）。这些已实现且正确。

#### L2：可挂载编辑器

| 文件 | 动作 | 要点 |
|---|---|---|
| `editor/editor.js` | **新增** | `export function createEditor(rootEl, options)`：把现在 `main.js` 顶层的 `boot()` 逻辑整体搬入，闭包化 |
| `editor/main.js` | 重写为薄入口 | 保持零行为变化：`createEditor(document.getElementById("pptd-root") ?? document.body, { source: httpSource({ deckUrl: new URLSearchParams(location.search).get("deck") }), deck: … , chrome: "full" })`；继续暴露 `window.__pptdEditor/__pptdIo/__pptdShot` 以兼容现有测试（`tests/tools/ui-shots.mjs`、`shot.js` 依赖它们） |
| `editor/dom.js` | 重构 | 从模块级 `cache`/`byId` 改为 `createDom(rootEl)` 工厂；**过渡期内保留默认实例导出**，让未迁移的调用点继续工作，再逐个改到实例 |
| `editor/app/{api,view}.js`、`interaction/*`、`app/*controller*.js` | 修改 | 补 `destroy()`；对 `EventSource`、`window`/`document` 监听、`ResizeObserver`、图表实例统一在 `destroy()` 里释放 |
| `editor/dialogs.js` | **新增** | `dialogs` 接口：`alert(msg)`、`confirm(msg) → Promise<boolean>`。默认实现包裹原生 `window.alert/confirm`；宿主可覆盖 |

**`dialogs` 是实测出来的必要接口**——`editor/` 里有 **12 处宿主敌意调用**：

| 文件 | 行 | 调用 |
|---|---|---|
| `types/image.js` | 26 | `alert("仅支持 PNG / JPG / GIF 图片…")` |
| `interaction/excel-grid.js` | 90, 97, 105, 113 | `alert(err)` |
| `interaction/dialogs/table-editor.js` | 142, 152, 204, 224 | `alert(...)`（合并单元格冲突提示） |
| `app/project/io.js` | 85 | `window.confirm("编辑器有未保存的修改，新建将放弃…")` |
| `app/project/loader.js` | 168 | `window.confirm("…重新加载将放弃…")` |
| `app/toolbar.js` | 45 | `window.confirm("…切换项目将放弃…")` |

在 DSH 的 iframe/webview 里，原生 `alert` 需要 `allow-modals`，且观感与宿主完全脱节 → 必须可注入。

### 4.3 不破坏独立形态的约束（回归红线）

改造必须让下列**现有能力继续 100% 工作**，任何一条坏掉都算回归：

| 能力 | 验收 |
|---|---|
| CLI 全命令 | `node bin/open-pptd.js serve\|export\|export-project\|check\|render\|gallery\|fonts\|icons` 行为与输出不变 |
| 浏览器编辑器 | `serve` 后打开 `/?deck=project/deck.pptd` 与 `?deck=<项目>` 均正常；无 `?deck` 时进画廊 |
| 截图管线 | `?shot=1`（`__pptdShot`）与 `tests/tools/ui-shots.mjs` 输出不变 |
| 分层纪律 | `tests/regression/dep-graph.mjs` 全绿（含新增规则） |
| 全量回归 | `tests/run-all.mjs` 全绿；`tests/e2e/{incremental-load,render}.mjs` 通过 |
| 包完整性 | `tests/regression/package-integrity.mjs` 全绿（`files` 改动后必跑） |
| GitHub Pages 画廊 | `index.html` + `gallery` 仍静态可用；`.nojekyll` 保留 |
| **资源解析** | 在**未创建** `~/.open-pptd` 的全新环境里，`fonts list` / `icons list` / `serve` / `export` 全部照常工作（只读回退生效）；创建后新下载落 home 且立即可见 |
| **注册表一致性** | `~/.open-pptd` 里**手放**一个过期 `registry.json` **不得**影响行为（注册表永远读包内） |
| **并发安全** | 两个进程同时 `fonts download all`，结束后无半截文件、`fonts list` 全 ✓ |
| **package-integrity** | `npm pack` 产物不含任何 `*.ttf`，含 `assets/icons/**` 与两个 `registry.json` |

### 4.4 版本与兼容策略

> **总原则（R7，见 §3.7）：应用层不做版本管理。** 装哪个版本、兼容矩阵由运维/部署方决定；应用层只提供"运维可锁定"的旋钮与"不匹配即报错"的诊断。

- 引擎仓：`1.5.0` → **`2.0.0`**（含 `createEditor`、`contract.json` 与 `exports` 收敛；深路径从"事实接口"降级为 `./internal/*` 不保证稳定）。
- **仓 3 不声明 `peerDependencies`**（npm 暂不发布，声明了也无法解析）。取而代之：**运行时从 `contract.json` 读 `contractVersion` 并 fail-fast**，解析顺序见 §3.6。
- **弃用节奏**：`2.x` 期间保留旧深路径（`./internal/*` 仍然可达），`3.0` 移除。
- **`CONTRACT_VERSION = 2`**：相对初稿的 `1` 递增，因为新增了契约 5（`paths`/`config`）与"资源解析链"语义。**整数、只增不减**；语义不兼容的调整才递增，纯新增导出不递增。
- **资源布局版本**：`config.json` 内的 `version` 用于迁移，与 `CONTRACT_VERSION` **独立**——前者是数据格式，后者是代码接口。
- **`--version` 的另一半**：安装脚本暴露 `--version`，运维可锁定具体版本；脚本默认取 `latest`，并在收尾打印实际装到的版本。**应用层不校验"是否符合某个区间"**——那是部署策略。
- **契约自检**（仓 3 在 `apply()` 时执行，属于**诊断**而非版本管理）：

```js
const root = resolveCliRoot();                                   // §3.6 的解析顺序
const c = JSON.parse(readFileSync(join(root, "contract.json"), "utf8"));
if (c.contractVersion !== EXPECTED) {
  throw new Error(
    `dsh-plugin-pptd 需要 open-pptd 契约 v${EXPECTED}，实测 v${c.contractVersion}（${root}）。` +
    `请把 CLI 升级/降级到匹配版本：install.ps1 -Version <ver>`
  );
}
```

宁可启动即明确报错，也不要半坏——因为这类不匹配的症状是"注册成功但不生效""渲染结果不对"，属于最难排查的静默失败。

---

## 5. 技能仓与适配仓设计

### 5.1 包声明

```json
{
  "name": "dsh-plugin-pptd",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".":              { "default": "./lib/index.js" },
    "./client":       { "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": { "client": { "platform": "web" } },
  "dependencies": {}
}
```

要点：
- **零依赖**：npm 暂不发布 `open-pptd`，所以既不写 `dependencies` 也不写 `peerDependencies`；引擎由**运行时按 §3.6 的解析顺序**从 `~/.open-pptd/cli/current` 定位，并用 `contract.json` 的 `contractVersion` 做 fail-fast 诊断。
- **`dsh.client` 只声明 `platform`**：不写 `inject`（不依赖任何 DSH 客户端包）、不写 `external`（只用基线 `react`）→ **零构建、零打包器**。
- **无 `@deepseek-ai/*` 依赖**（R2）。
- `private: true` 仅表示"不发布 npm"，不影响 DSH 装载（Loader 行按路径/名字解析）。

### 5.2 Host 半边（`lib/index.js` + `lib/routes.js` + `lib/tools.js`）

#### 5.2.1 引擎定位与自检（`lib/engine.js`）

```js
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// §3.6 的解析顺序：读文件，不查 PATH（PATH 变更对已运行进程无效）
function resolveCliRoot() {
  const cands = [
    process.env.OPEN_PPTD_CLI,
    join(homedir(), ".open-pptd", "cli", "current"),
  ].filter(Boolean);
  for (const c of cands) {
    if (existsSync(join(c, "contract.json"))) return c;
  }
  throw new Error("未找到 open-pptd CLI。请先运行安装脚本（见 SKILL.md / README）。");
}

const EXPECTED_CONTRACT = 2;

export async function loadEngine() {
  const root = resolveCliRoot();
  const c = JSON.parse(readFileSync(join(root, "contract.json"), "utf8"));
  if (c.contractVersion !== EXPECTED_CONTRACT) {
    throw new Error(
      `dsh-plugin-pptd 需要 open-pptd 契约 v${EXPECTED_CONTRACT}，实测 v${c.contractVersion}（${root}）。` +
      `请把 CLI 升级/降级到匹配版本：install.ps1 -Version <ver>`
    );
  }
  const at = (name) => pathToFileURL(join(root, c.entries[name])).href;
  const [model, writer, server, paths] = await Promise.all([
    import(at("model")), import(at("writer")), import(at("server")), import(at("paths")),
  ]);
  return { root, contract: c, model, writer, server, paths };
}
```

> **为什么不用 `createRequire().resolve("open-pptd/model")`**：那要求引擎在 `node_modules` 里。仓 1 **暂不发布 npm**，CLI 是"解压到 `~/.open-pptd/cli/versions/<ver>` 的普通目录"，所以必须靠 `contract.json` 自描述入口（契约 4 的第二个入口）。这样一来**内部布局对 B 仍然不可见**，符合 R3。
>
> 这个方案能成立的前提是**引擎零依赖**（只 import `node:*` 与自己 vendored 的库），所以从任意绝对路径 import 都不会触发依赖解析。

#### 5.2.2 路由（`lib/routes.js`）

**全部收进 `/pptd/**` 前缀**，绝不占用 DSH 的 `/`、`/api/*`、`/plugins/*`。

| 路由 | 实现 | 说明 |
|---|---|---|
| `GET /pptd/**` | 引擎 `resolveFile(root, pathname.slice("/pptd".length))` + `sendFile` | 静态：`/pptd/editor/index.html`、`/pptd/packages/...`、`/pptd/assets/...`。**复用引擎已有的穿越防护与 `MIME` 表** |
| `GET /pptd/api/ping` | 引擎 `handlePing` | 就绪探针 |
| `POST /pptd/api/save` | **适配层自己的实现**：解析 `{files}` → 归一化到 `dshSource` → 写盘 | 复用引擎的路径校验语义，但写盘走宿主 |
| `GET /pptd/events` | 引擎 `createSseHub(projectRoot)` | 变更广播（见 5.6） |
| 前缀重写 | `ROOT = new URL("../", import.meta.url)` 在引擎里是 `import.meta.url` 相对的 → `/pptd/editor/main.js` 的 `ROOT` = `/pptd/` → `?deck=project/deck.pptd` → `/pptd/project/deck.pptd` **天然前缀安全**【已核实】 |

> 由于全部是**已声明**路由，且 `/pptd` 不与任何现有前缀重叠，不会触碰 §1.3 的"同表重复 path 抛错"。

#### 5.2.3 工具（`lib/tools.js`）——SKILL 的执行面

**用纯对象定义**（不 import `defineTool`，见 R2）：

```js
export function registerTools(ctx, engine) {
  ctx.tools.register({
    name: "pptd_check",
    description: "结构自查一个 PPTD 项目（schema/令牌/资源/字体/几何/对比度）",
    parameters: { path: { type: "string", required: true, description: "deck.pptd 路径" } },
    async execute({ path }) {
      const r = engine.cli.runCheck(path);      // 直接复用引擎实现，不起进程
      return { ok: r?.ok !== false, report: r };
    }
  });

  ctx.tools.register({
    name: "pptd_export",
    description: "导出 PPTX（默认子集化嵌入字体）",
    parameters: {
      path:        { type: "string",  required: true,  description: "deck.pptd 路径" },
      out:         { type: "string",  required: false, description: "输出 .pptx 路径" },
      theme:       { type: "string",  required: false, description: "配色预设 key" },
      embedFonts:  { type: "boolean", required: false, description: "默认 true" },
      fullFonts:   { type: "boolean", required: false, description: "嵌入完整字体，默认 false（子集化）" }
    },
    async execute(a) { /* engine.cli.exportDeck(...) */ }
  });

  ctx.tools.register({ name: "pptd_render", /* 逐页 PNG，走引擎 headless 管线 */ });
  ctx.tools.register({ name: "pptd_fonts",  /* list / download / check */ });
  ctx.tools.register({ name: "pptd_preview",/* { projectRoot } → 打开面板并切换项目源 */ });
}
```

**为什么用工具而不是让模型敲 CLI**：
1. 不依赖 PATH，不受安装位置影响；
2. 结构化返回（模型不需要解析 stdout）；
3. 可挂超时、权限与前置校验；
4. **可 in-process 直调**（比 spawn 子进程快一个数量级，且能直接吃内存 deck）。

CLI 仍然保留给人和脚本（`open-pptd export …`），两者共用引擎同一份实现。

#### 5.2.4 `dshSource`（`lib/source.js`，实现契约 2）

```js
export function createDshSource({ projectRoot, fs, events }) {
  return {
    capabilities: { writable: true, liveWatch: true, binary: true },
    async read() { /* fs 读 deck.pptd + pages/*.page */ },
    async write(files) { /* fs 写盘；写后触发事件 */ },
    async readMedia(p) { /* fs 读二进制 */ },
    watch(cb) { return events.subscribe(projectRoot, cb); }   // 见 5.6
  };
}
```

### 5.3 Client 半边（`lib/client.js`）

手写 bundle，**只 `require("react")`**（基线表第 1 个词），零构建：

```js
window.__ModuleLoader__.load({
  id: "dsh-plugin-pptd",
  factory: (require) => {
    var module = { exports: {} }, exports = module.exports;
    const React = require("react");
    const h = React.createElement;

    const inject = ["slots", "layout", "sidebarRight", "sidebarRightTabs"];
    const PANEL_ID = "pptd";

    // 1) 编辑器视图 = 同源 iframe（CSS/DOM 隔离，但完全可控）
    //    ⚠️ src 必须【文档相对】：桌面壳文档是 dsh-app://app/，浏览器是 http://127.0.0.1:<port>/
    //       两种环境下 "pptd/editor/" 都解析到同源；写成 "/pptd/editor/" 或拼 location.origin 会在
    //       某一环境下解析错源（DSH 自己在 dsh-client-hmr/lib/client.js:45 也是文档相对写法）。
    const EDITOR_URL = "pptd/editor/";
    function PptdView({ src, onMessage }) {
      const ref = React.useRef(null);
      React.useEffect(() => {
        const el = ref.current; if (!el) return;
        const on = (e) => { if (e.origin === location.origin) onMessage?.(e.data); };
        window.addEventListener("message", on);
        return () => window.removeEventListener("message", on);   // ← 必须有清理
      }, [onMessage]);
      return h("iframe", {
        ref, src, title: "PPTD",
        style: { width: "100%", height: "100%", border: "0", display: "block" },
        // 同源，无需 sandbox：既隔离样式，又保留 contentWindow 直控
        // 注意：宿主对 iframe 的 sandbox 若设为不含 allow-same-origin，会变成"不透明源"而丢失直控能力
      });
    }

    // 2) 图标（侧栏入口）
    function PptdIcon() {
      return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor" },
        h("path", { d: "M4 4h16v11H4z M4 17h9v3H4z" }));
    }

    function apply(ctx) {
      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register(
        { name: "sidebar.panellist", id: PANEL_ID, order: 20, label: () => "演示文稿", locale: "pptd" },
        PptdIcon));

      // 右栏：注册标签类型 + 打开（右栏列归 sidebar-right 独占，插件只能进类型注册表）
      ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register(
        { name: "sidebar.right.pane.tab", key: PANEL_ID, label: () => "PPT", locale: "pptd" },
        () => h(PptdView, { src: "/pptd/editor/?embed=1" })));

      // 整屏工作台（素材/模板/批量/放映）
      ctx.slots.inject("main", () => ctx.slots.register(
        { name: "main", key: PANEL_ID + "-workbench", locale: "pptd" },
        WorkbenchPage));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
```

**入口三件套**（全部是"往已声明槽位注册"，合法）：

| 入口 | API | 备注 |
|---|---|---|
| 侧栏图标 | `sidebar.panellist` | 已验证的两条属性：`id`、`order`、`label`、`locale`【已核实于 plugin-manager】 |
| 右栏标签页 | `ctx.sidebarRightTabs` 注册类型 + `ctx.sidebarRight.openTab(kind, {params})` | 【文档来源，待实测】服务名以 0.2.0 实测为准 |
| 整屏工作台 | `ctx.slots.register({name:"main", key:"pptd-workbench"}, …)` + `ctx.layout.selectPanel("pptd-workbench")` | 【已核实】有官方先例 |
| 命令 | `ctx.commandUi.register(contribution)`（`/pptd`） | 【文档来源，待实测】 |
| 快捷键 | `ctx.shortcuts.register({id, label, aliases, defaults, regions, modals, resolve})` | 【文档来源，待实测】 |
| 设置项 | `settings.section` 或 `settings.plugin.item` | 用于配"字体库下载""默认导出主题" |

**首帧成本纪律**：`client.js` 目标 **< 12 KB**（无依赖、无打包器产物膨胀）。所有重活（echarts 1MB、katex 617KB）都在 iframe 内的引擎文档里，**不进入 DSH 首帧**。

### 5.4 「演示模式」preset

```
~/.dsh/.agent-presets/pptd/
├── preset.yml           # name: 演示模式 / description / order
├── agent.cordis.yml     # persona + 工具 + prompt 段 + 技能根
└── skills/              # 可选：本模式专属的轻量技能（放"怎么用这套工具"的短指南）
```

`agent.cordis.yml` 关键行：`skill-filesystem` 的 `customSkillDirs` 指向**已安装的技能目录（仓 2）**。注意**不要**指向仓 1 的包目录——内容面（`SKILL.md` + `references/`）已按 R5 全部搬到仓 2：

```yaml
- id: skill-filesystem
  name: "@deepseek-ai/dsh-skill-filesystem"
  config:
    customSkillDirs:
      - !!js "require('node:path').join(require('node:os').homedir(), '.dsh', 'skills', 'open-pptd')"
```

> 这个 preset 的作用是**规避当前"技能看不见"的问题**：DSH 的常规技能目录扫描目前加载不到这个技能（根因未定论），用 `customSkillDirs` 显式指定即可绕开。若将来扫到两个副本，删掉这一项、只留常规目录即可。
>
> `!!js` 表达式在该配置里是被允许的（DSH 自身 patch 就用它做平台判断）。若表达式环境受限，退化为在 preset 里直接写绝对路径。

**注意**：**不要改 shipped preset**（`presets/{standard,ptc,cordis,minimal}`）——它们属部署所有，升级会被覆盖。而「演示模式」这一项也**不需要**改 shipped：

- 走 `${DSH_HOME}/.agent-presets/<id>/` 用户目录即可（`includeUserRoot: true`）；
- 或由适配仓作为 bundle 随插件一起提供。

### 5.5 主题桥（`lib/theme.js` + client 侧中继）

**方向**：DSH 令牌（页面 CSS 变量）→ 读取 → `postMessage` → iframe 内 `applyThemeTokens()`。

| DSH（`--dsw-alias-*`） | open-pptd 令牌 | 备注 |
|---|---|---|
| `--dsw-alias-bg-base` | `--bg` | |
| `--dsw-alias-bg-layer-1` | `--panel` | |
| `--dsw-alias-bg-layer-2` | `--bg`（层级差） | 需目视校准 |
| `--dsw-alias-bg-overlay` | `浮层底` | 需新增令牌 |
| `--dsw-alias-border-l1` | `--line` | |
| `--dsw-alias-border-l2` | `--line-strong` | |
| `--dsw-alias-brand-primary` | `--primary` | |
| `--dsw-alias-label-primary` | `--ink` | |
| `--dsw-alias-label-secondary` | `--sub` | |
| `--dsw-alias-state-idle-primary` | `--faint` | |
| `--dsw-alias-state-error-primary` | `--danger` | |
| `--dsw-alias-state-success-primary` | `--success` | |
| `--dsw-alias-state-warn-primary` | `--warning` | |
| `--dsw-alias-scrollbar-bg-l1` / `-hover-l1` | `--scrollbar` | |
| `body[data-ds-dark-theme]` 是否存在 | `mode: "light" \| "dark"` | 这是**唯一的模式信号**（DSH 用属性而非媒体查询） |

**没有直接对应关系的 7 个引擎令牌**（`--primary-strong`、`--primary-soft`、`--primary-tint`、`--danger-soft`、`--success-soft`、`--warning-soft`、`--mask`）→ 由桥用 `color-mix(in oklab, var(--primary) 12%, var(--panel))` 之类派生，**或**直接使用引擎仓 `defaultTokens(mode)` 的对应值。**必须补一套 dark 值**（H5），否则 dark 下必然是"亮底暗字"。

### 5.6 数据与同步协议

#### 5.6.1 写路径归一（本方案最重要的正确性收益）

**现状（两条写路径，必然竞态）**：

```
编辑器 ──fetch("/api/save")──▶ handleSave ──▶ 磁盘
模型   ──文件工具──────────────▶           ──▶ 磁盘
```

**目标（一份磁盘真相 + 单向事件）**：

```
编辑器 ──source.write()──▶ dshSource ──▶ 磁盘 ──▶ watch ──▶ 广播 ──▶ 编辑器 reload()
模型   ──文件工具────────▶       ──▶ 磁盘 ──▶ watch ──▶ 广播 ──▶ 编辑器 reload()
```

要点：
- 编辑器**不再自己写 HTTP**，写盘统一在适配仓（`node:fs`，与模型的写路径落在一起）。
- 变更**不再靠 800ms 轮询**：用事件推送（`fs.watch` 递归或 DSH 的文件事件），延迟从 ≤800ms 降到近似实时。
- **冲突处理**：编辑器保存前比对指纹；若磁盘已被模型改动，走 `dialogs.confirm`（可选加"以编辑器为准 / 以磁盘为准"）→ P3 实现。

#### 5.6.2 刷新链路

| 环节 | 谁做 | 说明 |
|---|---|---|
| 模型改文件 | DSH 工具 | 落盘 |
| 感知 | 适配仓 Host 半边 | `fs.watch(projectRoot, {recursive:true})` 或 DSH 文件事件 |
| 广播 | `/pptd/events`（引擎 `createSseHub`）**或** 宿主→client 的 `postMessage` | 二选一；SSE 复用引擎实现，postMessage 少一跳 |
| 应用 | 引擎 `source.watch` 回调 → 重载受影响的 page | 保留现有增量加载（`tests/e2e/incremental-load.mjs` 覆盖） |

#### 5.6.3 宿主 → 编辑器的控制通道（同源红利）

```js
// client 侧（同源，可直取 contentWindow）
iframeRef.current.contentWindow.__pptdEditor      // 直接拿到引擎 API
iframeRef.current.contentWindow.postMessage({ type: "pptd:theme", tokens, mode }, location.origin)
```

| 命令 | 效果 |
|---|---|
| `pptd:theme` | 注入令牌（§5.5） |
| `pptd:open` | 切到指定 deck/page（如模型刚写完第 3 页 → 直接跳过去） |
| `pptd:present` | 进放映 |
| `pptd:dirty` → 宿主 | 编辑器回报脏状态，用于会话提示 |

### 5.7 技能仓（仓 2）：分层、瘦身与安装引导

**现状问题**：`SKILL.md`（178 行）把"内容方法论"和"执行步骤"混在一起；整份技能就是整个引擎仓（142.9 MB），运行时与知识纠缠不清。

**目标：仓 2 是纯知识包，约 270 KB，零可执行文件。**

| 层 | 位置 | 内容 | 变化 |
|---|---|---|---|
| 内容面 | **仓 2** `SKILL.md` + `references/`（`design.md` 41.7 KB、`pptd.md` 79.6 KB、`shapes.md` 15.3 KB、`slides_categories/*` 8 篇 ~113 KB） | 场景判断、版式、配色、图表选型、验证基线 | **唯一副本在此**（R5）；`node bin/...` 示例改为 `open-pptd ...` |
| 执行面 | 仓 3 `lib/tools.js` → `pptd_check/export/render/fonts/preview` | 校验、导出、渲染、字体、预览 | **新增**（取代 CLI 手工调用） |
| 呈现面 | 仓 3 Host/Client 半边 | 常驻编辑器 + 实时刷新 | **新增** |
| 安装面 | **不在技能仓**。SKILL.md 用"自检 → 缺则给命令"引导 | CLI 由 `install.ps1` / `install.sh` 安装（仓 1 发布资产） | 技能仓不捆绑脚本 |

**关键判断：CLI 不能取代 SKILL。** 已核实 `packages/cli/bin.js` 的全部命令是 `serve | export | export-project | check | render | gallery | fonts | icons`——**没有任何"创作"命令**。写 PPTD YAML 本身就是 `SKILL.md` + `references/` 的方法论产物。所以正确的动作是**分层**，不是替换。

#### SKILL.md 的开头必须有的两段

**① 自检与安装引导**（一句话原则，但失败态必须写清）：

```markdown
## 前置：确认 CLI 可用

先运行 `open-pptd doctor`（三平台通用），一次拿到全部环境事实。
- 有输出 → 已安装，继续。
- 提示 command not found → CLI 未安装。**先告知用户**，再按当前系统执行其一，
  然后重新运行 `open-pptd doctor`：

  Windows（PowerShell）
  irm https://github.com/Shingwha/open-pptd/releases/latest/download/install.ps1 | iex

  Linux / macOS
  curl -fsSL https://github.com/Shingwha/open-pptd/releases/latest/download/install.sh | sh

  它会装到 ~/.open-pptd 并把 open-pptd 加入**用户级** PATH（不需要管理员）。
  装完当前终端可能需新开一个；DSH 要重启才会读到新 PATH。
- 装不上（无网络 / 无 Node）→ **明确告知用户，不要假装能继续。**
```

「先告知用户」这半句是我的默认（安装涉及下载并执行脚本、写用户目录、改 PATH）；若你希望模型直接装、不问，删掉即可。

**不写 `requires-cli`、不校验版本区间**——那是运维的部署策略（R7 / §3.7）。

**② 预览分支**（`serve` 保留，不是删除，而是按环境分流）：

```markdown
### 预览
先判定运行环境：

1) 若 ppdd_* 工具可用（= 运行在 DeepSeek Harness 内）
   → **不要**启 serve。调 pptd_preview { projectRoot }，编辑器面板就是预览。

2) 否则（Claude Code / pi / Cursor / 终端等）
   → open-pptd serve --project <dir> --detach --json
   → 把返回的 url 原样给用户，并说明：
       · 编辑器在 /editor/?deck=…；根路径 / 是画廊
       · 改动 deck.pptd 后自动热更新（SSE），无需刷新
       · 看完用 open-pptd serve --stop 关闭
```

判定用**工具是否存在**作为信号（自描述，不需要额外环境变量）；若想更保险，仓 3 也可在会话环境注入 `OPEN_PPTD_HOST=dsh`。

> **`open-pptd serve` 是独立预览的唯一通道，CLI 里必须保留。** 它"在 DSH 里没必要"不等于可以删除——其他 agent 与人类用户全靠它。参见 §5.9。

**③ 导出（不要让模型去手动下全量字体）**：

```markdown
### 导出
直接 `open-pptd export <manifest>`（或调 pptd_export 工具）。
导出前会**自动体检并补齐** deck 真正用到的字体/图标（§3.6），所以：
- **不要**先跑 `fonts download all`（那是 98.5 MB 全量，绝大多数用不上）
- 导出结果的 `embedded / skipped` 清单要**如实转述给用户**
- 若出现 `skipped`（字体未嵌入、PPTX 会回退系统字体），必须明确告知，不要含糊过去
```

- **仓 2**：`SKILL.md` 只讲方法论 + 命令面 + 自检；**不复制任何执行细节**。
- **仓 3**：提供 `pptd_*` 工具承载执行面；**不复制任何方法论内容**（R5）。
- **仓 1**：`docs/embedding.md` 记录契约与 `contract.json`；`references/` 与 `SKILL.md` 从仓 1 移除。

### 5.8 资源与配置接入（适配仓侧）

适配仓**不自己拼任何资源路径**（R6），只做三件事：

**1）静态映射**——把 `/pptd/assets/**` 接到引擎的 `resourceRoots`：

```js
import { paths, resourceRoots, ensureHome } from "open-pptd/paths";
// GET /pptd/assets/fonts/X.ttf → 依次尝试 resourceRoots.fonts
// registry.json 永远只查最后一根（包内），防止被 home 里的旧注册表遮蔽
```

注意 `/pptd/assets/...` 是浏览器请求 `assets/...` 相对 `/pptd/` 的**自然结果**，**不需要改浏览器**——这正是契约 5 把解析链放在静态层的目的。

**2）状态归位**——"最近项目"读写 `paths.state/recent.json`，取代浏览器 IndexedDB → 解掉 R-10（DSH 端口变化不再丢列表）。

**3）可观测**——在设置页（`settings.section`）展示 `paths.home` 的实际路径、字体/图标占用体积，并提供"打开目录"入口。用户得知道东西存在哪。

**首启体验**：`~/.open-pptd` 不存在时，Host 半边在启动阶段调 `ensureHome()` 建目录；**字体缺失不阻塞**——编辑器里显示"✗ 未加载"，并给一个"下载全部字体"的入口（走 `pptd_fonts` 工具）。

**越界写盘的必要说明**：适配仓会写用户 home（即工作区之外）。当前 DSH 策略为 `danger-full-access`，可行；但对受限沙箱必须优雅降级：

- 捕获 `EACCES`/`EPERM` → **降级为只读模式**（只用包内回退资源），`console.warn` 一次，不抛错、不崩溃；
- 目录路径在设置页可见，避免"偷偷写盘"。

### 5.9 预览语义：两种环境统一

**问题**：`serve` 在 DSH 里没必要（编辑器由宿主常驻），但在其他 agent 里是**唯一**预览通道。如果工具集里没有"预览"这个动作，模型在 DSH 内就会"知道该预览却无从下手"。

**统一语义：一次工具调用 → 把结果告诉用户。**

| 环境 | 动作 | 返回 | 用户看到 |
|---|---|---|---|
| DSH | `pptd_preview { projectRoot }` | `{ panelId, projectRoot }` | 编辑器面板打开并切到该项目 |
| 其他 agent | `open-pptd serve --project <dir> --detach --json` | `{"url":…,"port":…,"pid":…}` | 浏览器打开该 URL |

`pptd_preview` 的 Host 侧做三件事：**①** 把项目源切到 `projectRoot`（`dshSource`）；**②** 通过事件下发让 Client 打开面板（`ctx.layout.selectPanel(id)` 或 `ctx.sidebarRight.openTab(kind, { params })`）；**③** 返回句柄。

**工具清单（更新）**：`pptd_check` / `pptd_export` / `pptd_render` / `pptd_fonts` / **`pptd_preview`** /（可选，需显式确认）`pptd_install`。

**为什么 L1.6 那三个 flag 是必需的**：`--detach`（否则 agent 的 bash 工具挂死或被超时强杀）、`--json`（否则只能正则扒中文句子）、`--stop`（否则残留进程占端口）。三者缺一，非 DSH 的预览路径就不可靠——而那条路径正是"其他 agent"的主路径。

---

## 6. 交互形态方案

### 6.1 四种候选形态对比

| 形态 | 实现手段 | 聊天是否可见 | 编辑器可用宽度 | 融合度 | 评价 |
|---|---|---|---|---|---|
| **A 右栏标签页** | `ctx.sidebarRightTabs` + `openTab('pptd')`；`ctx.layout.openRightbar(track, fullscreen)` | ✅ 可见（左） | 45% 起，可拖至 70%；一键全屏 | 高 | ✅ **主形态** |
| **B `main` 整屏工作台** | `ctx.slots.register({name:"main", key})` + `selectPanel()` | ❌ 隐藏 | 100% | 最高 | ✅ 辅助（素材/模板/批量/放映） |
| **C 右栏文档预览标签** | `sidebar.right.tab.document*` + `deliverables.*` | ✅ 可见 | 45% | 中 | ⭕ 用于"模型产出的 .pptx 预览"，非编辑 |
| **D 会话内嵌卡片** | `conversation.chat.node` / `tool.call.toolview` | ✅ 可见 | 窄 | 中低 | ⭕ 用于工具调用结果里回显缩略图 |

### 6.2 推荐组合（并说明为什么不用"整屏为主"）

**主形态用 A（右栏），关键理由（全部有 API 依据）**：

1. **`rightbar` 是 DSH 唯一的官方分栏列**，默认 45%、可拖、`push` 模式；它由 `sidebar-right` 独占，插件通过注册**标签类型**进入 —— 这正是"左对话 / 右编辑器"的原生实现。
2. **右栏自带"独立模式"**：`openRightbar(track, fullscreen)` 的 `fullscreen` 会覆盖视口、同时保留底下轨道。**一套实现同时给出"分栏"与"沉浸"**，不需要做两遍 UI。
3. **右栏是 per-session 的 docking 面**（`rightbar.session`）→ 天然对应"这个会话正在做的这份 PPT"；切会话自动切项目。
4. **宽度自适应已经做好了**：>1024px 展开；为保护中间区 400px，先压右栏到 300px，空间不足则通知占用方自行关闭。这些边界不用我们写。

**为什么"整屏为主"不可取**：`selectPanel('pptd')` 会**隐藏整个对话区**。用户的诉求是"一边对话一边改"；把主要交互放在整屏面板里，等于每次改完都要切回去看模型说了什么，反复打断。所以 B 的正确用途是**不需要对话的场景**：模板库、素材库、字体管理、批量导出、放映。

**"模式"语义交给 preset，不交给 UI**：`preset.yml` 里 `name: 演示模式` 会出现在会话的模式选择器里（shipped 的 `cordis` preset 显示为「创造模式」可证），带 `pptd_*` 工具与技能根。**UI 形态（在哪看）与语义形态（在做什么）正交**，两者都要，但不混做。

### 6.3 最终形态

```
┌───────────┬─────────────────────────────┬──────────────────┐
│ 侧栏       │  DSH 原生对话（main）        │  右栏：PPT 标签页 │
│  ▣ 会话     │  「把第 3 页改成漏斗图」      │  ┌────────────┐  │
│  ▢ 演示文稿 │                             │  │ PPTD 编辑器 │  │
│    ↑ 新图标 │  Agent 流式输出…             │  │（同源 iframe）│  │
│           │                             │  └────────────┘  │
└───────────┴─────────────────────────────┴──────────────────┘
        ↑ sidebar.panellist            ↑ openRightbar(track=true)
        点击可切到 main 工作台（模板/批量/放映）
```

### 6.4 编辑器 UI 现状量化（实测）

规模：`editor/` = **18 CSS / 86.5 KB** + **54 JS / 369.8 KB**（`app/` 24 个 137.6 KB、`interaction/` 14 个 152.1 KB、`types/` 9 个 33.9 KB）。

| 维度 | 现状 | 目标 | 症状 |
|---|---|---|---|
| 颜色字面量 | **43 个不同值 / 55 次**（`#fff` 出现 **11 次**） | 0（全走令牌） | 令牌集太粗，找不到对的就写死 |
| 圆角 | **15 种**：`2/3/4/5/6/8/12/14px`、`16px 16px 0 0`、`50%`、`99px`、`999px` | 3 种 | 无栅格纪律 |
| 阴影 | 9 种（含 2 处 `inset 0 0 0 999px` 颜色 hack、1 处硬编码 `0 -8px 32px`） | 2 种 | 浮层与内嵌混用同一机制 |
| transition 形态 | **24 种**（含硬编码 `0.08s / 0.22s / 0.3s`） | ~4 种 | 动效不系统 |
| z-index | 9 种（5 个已令牌化 + 裸值 `1/3/6/40`） | 5 种 | 半途而废 |
| 字号 | 7 种（5 个令牌 + 硬编码 `9px`/`10px`×3） | 5–6 种 | ✅ 还好 |
| 软辉光 `0 0 0 3px` | **36 处** | 0 | 选中态不可辨、观感"发虚" |
| CSS 类名 | **268 个**（JS 侧 202，孤儿 7） | ~110 | 无原语层，同类控件多文件各写一遍 |
| CSS 文件 | **18 个平铺**，靠 `index.html` link 顺序级联 | 8 个 | `responsive.css` 必须最后加载才生效 |
| `var(--` 用量 | **973 次**，仅 **1 处** fallback | — | **"想用令牌的意愿在"**，是令牌集不够用 |
| `@media` / `@keyframes` / `!important` | 6 / 2 / 3 | — | ✅ 很克制，无历史脏债 |

> `tokens.css`（79 行，~45 个令牌）**本身设计不差**：语义灰阶、4px 基网 6 阶、3 档圆角、5 档 z、2 档时长、3 档阴影。问题是**它没被遵守**——缺的令牌（11 阶中性色、hover/active/disabled 层、选中环）逼着组件写死。

### 6.5 诊断：两个根因 + 一个表症

**根因 1（地基）：选择模型是单值的。**

```js
selectedId: null,                                                  // state.js:16   标量
const selected = () => (page().elements || []).find(               // state.js:30
  (el) => el.elementId === state.selectedId) || null;
```

全仓唯一的 `Set` 在 `saver.js:243`——那是导出对话框的**页面**选择器，与元素选择无关。而且 `Shift` 已被占用：

| 位置 | 现有含义 |
|---|---|
| `canvas.js:195` | 方向键微调：`shiftKey ? 15 : 1` px |
| `canvas.js:232` | 拖手柄缩放：等比 |
| `canvas.js:292` | 拖动：`shiftKey ? 10 : 1` |
| `keyboard.js` | 仅 `Ctrl+Z / Y / S / D` |

→ 多选、框选、Ctrl 点选、组合、批量改属性、**对齐到选区**——全部无从谈起。

**而属性面板里"对齐 6 种 + 上移/下移一层 + 旋转 + 透明度 + 翻转"这些按钮已经存在**（`interaction/properties.js`，240 行），单选下只能对齐页面。多选一到位，它们立刻从"半个功能"变成真功能——**这是最高性价比的改造**。

**根因 2（信息架构）：画布上浮着 4 个簇。**

`.quickbar` / `.fab-stack` / `.zoom-ctl` / `.add-menu` 被 `stage.js:33` 显式排除出画布命中测试——说明它们就是四块抢画布注意力的浮层；顶栏再叠 **5 个平铺按钮**（文件 / 字体 / 配色 / 放映 / …），**没有层级**。这就是"杂乱"的视觉来源。

**表症：令牌集太粗**（见 §6.4 的表）。

**要保护的资产（重构不许动）**

| 资产 | 评价 |
|---|---|
| `interaction/fields.js`（117 行）**5 种表单原语** `num/color/select/checks/text` | 干净可复用 → **保留** |
| `interaction/dialogs/base.js`（101 行）对话框壳 | 极小 → **保留骨架** |
| `types/*.js` 的 `props()/quickbar()/create()` 分片 + `types/index.js` 注册表 | 7 种元素自动接入属性面板与添加菜单 → **架构对，别动** |
| `chart-editor.js` / `table-editor.js` 的 schema 字段表（几十项 `kind:`） | 是**数据**不是样式，换外观不影响 |
| `ui.js`（widget 工厂） | 可升格为原语层的起点 |
| `packages/` 渲染器与 writer | dep-graph 红线禁止 `packages/` import `editor/` → 本次改造天然不越界 |

### 6.6 简化原则：「保留基本编辑」的取舍清单

**① 保留（核心，不动）**

7 种元素（文本 / 形状 / 图片 / 图标 / 线条 / 表格 / 图表）· 位置 · 尺寸 · 旋转 · 透明度 · 层级 · 对齐 · 删除 · 复制 · 撤销/重做 · 页面增删 + 页面背景（无 / 纯色 / 渐变 / 角度）· 导出 PPTX · 放映 · 字体管理 · 配色预设。

**② 下沉（还在，但不占常驻位置）**

| 原位置 | 新位置 |
|---|---|
| 画布 `.add-menu` + `.fab-stack` | 顶栏 **插入** 下拉（唯一入口） |
| 画布 `.zoom-ctl`（5 控件） | 底部状态条右侧；嵌入 DSH 时可隐藏（用宿主缩放） |
| 画布 `.quickbar`（每类型任意多项） | **收敛为 4 项 + 「更多 ⋮」**；或取消，改走右键 |
| 顶栏 `配色` / `字体` 按钮 | **设计** 下拉（不是每次都用） |
| 属性面板"全部属性一次铺开" | **分区折叠 + 按类型只显示相关项**（渐进披露） |
| chart / table 的几十个字段 | 保留在模态里，但加 **「常用 / 高级」** 两级 |

**③ 删除（不再存在）**

| 删除项 | 理由 |
|---|---|
| `.fab-stack`（`fab.css` 1.7 KB，2 个圆钮） | 与顶栏职责重复；面板开合改用 `chrome` 档位 + 拖边缘 |
| 编辑器内的品牌链接 / GitHub 链接 | 嵌入 DSH 时由宿主提供导航；独立运行保留 |
| 8 个圆点手柄 → **4 个角点** | "锐利"；4 角已够（边中点手柄是移动端习惯） |
| `box-shadow: 0 0 0 3px` 软辉光（**36 处**） | 换 `1px` 实线选中环 |
| `inset 0 0 0 999px` 颜色 hack（`excel-grid.css:12/15`） | 用真正的 `background` 令牌 |
| 硬编码 `9px/10px` 字号、`0.08s/0.22s/0.3s` 时长、裸 `z-index 1/3/6/40` | 全走令牌 |
| `zoom.css` / `fab.css` / `layout.css`（合计 3.5 KB） | 内容并入原语与 layout |

### 6.7 信息架构：B2「减法版」（已定）

```
【现状】4 个浮层簇 + 顶栏 5 按钮，全部抢同一块注意力
┌──────────────────────────────────────────────────────────────┐
│ OPEN PPTD  ◄文件 ◄字体 ◄配色 ◄放映    ↶ ↷          GitHub    │
├──────────────────────────────────┬───────────────────────────┤
│  ┌ .quickbar（选中时，任意多项）┐ │  属性面板                  │
│  │ [B][I][色][字号][对齐…]       │ │  ┌ 位置与尺寸 ┐           │
│  └───────────────────────────────┘ │  ┌ 对齐 6 钮 ┐           │
│         ╔═══════════════╗          │  ┌ 层级 ┐                 │
│         ║  8 个圆点手柄  ║          │  ┌ 变换 ┐                 │
│         ╚═══════════════╝          │  ┌ 翻转 ┐                 │
│                    [＋] ← .add-menu │                           │
│  [−][150%][+] ← .zoom-ctl（常驻）  │  ← .fab-stack 2 圆钮常驻   │
├──────────────────────────────────┴───────────────────────────┤
│ [缩略图…] [＋]                                     12 页      │
└──────────────────────────────────────────────────────────────┘

【目标】单行三入口 + 画布零常驻浮层 + 右键承载动作
┌──────────────────────────────────────────────────────────────┐
│ ◄插入 ▾   ◄设计 ▾   ◄放映        ↶ ↷        [⌗ 适配 ▾] [⛶] │
├──────────────────────────────────┬───────────────────────────┤
│                                  │  属性                       │
│         ╔═══════════════╗         │  ▸ 位置与尺寸               │
│         ║   4 个角点     ║         │  ▸ 对齐    ← 单选=对页面     │
│         ╚═══════════════╝         │  ▸ 层级      多选=对选区     │
│                                  │  ▸ 变换     （按类型过滤）    │
│       画布零常驻浮层               │  ▸ 翻转                     │
├──────────────────────────────────┴───────────────────────────┤
│ [缩略图…][＋]  拖排序 · 右键菜单 · 页面多选      12 页 [−100%+]│
└──────────────────────────────────────────────────────────────┘
```

**右键上下文菜单是本次简化的最大杠杆**：对齐 / 层级 / 组合 / 翻转 / 复制 / 删除全部移到右键，画布常驻 UI 因此可以降到接近零。

**`chrome` 档位**（复用契约 1 已规划的 `options.chrome`）：

| 档位 | 用于 | 保留什么 |
|---|---|---|
| `"full"` | 独立 `serve` / GitHub Pages | 品牌 + 文件 + 插入 + 设计 + 放映 + 撤销/重做 + 缩放 + 缩略条 |
| `"minimal"` | **嵌进 DSH 右栏 iframe** | **插入 + 撤销/重做 + 缩放**（文件与主题由宿主提供）；隐藏品牌与外链 |
| `"shot"` | `?shot=1` 截图 | 零 chrome、无过渡动画、纯背景 |

### 6.8 设计语言：锐利令牌体系

四条可执行约束：

1. **小圆角**：`2px`（内嵌控件）/ `4px`（按钮、输入）/ `6px`（面板、对话框）
2. **1px 实线表达层级**，不用阴影；阴影只留给真正浮起的（菜单、对话框）**2 档**
3. **选中态用环不用辉光**：`outline: 1px solid var(--sel-ring)` + **四角控制点**
4. **等宽数字**：`font-variant-numeric: tabular-nums` 用于坐标/尺寸/缩放，观感立刻专业

| 组 | 现状 | 目标 |
|---|---|---|
| 中性色 | 8 个语义名 | **11 阶** `--n-0 … --n-1000` + 语义别名（`--bg/--panel/--ink/--sub/--faint/--line` 保留指向） |
| 强调 | `--primary` 4 档 | 保留 + 新增 `--sel-ring` / `--focus-ring` |
| 语义 | danger/success/warning 各 2 档 | 保留 |
| 圆角 | 3 档但泄漏成 15 种 | `--r-1: 2px` / `--r-2: 4px` / `--r-3: 6px`（消灭 14/16/99/999/50%） |
| 阴影 | 3 档 | 2 档：`--sh-pop`（菜单/浮层）/ `--sh-modal`（对话框） |
| 时长 | 2 档 | 3 档：`--t-fast: 80ms` / `--t-med: 140ms` / `--t-slow: 200ms` |
| 缓动 | 1 条 `--ease` | 保留 |
| 层级 | 5 档 | 保留 + **消灭裸值** `1/3/6/40` |
| 字号 | 6 档 | **保留**（现状是好的）+ 消灭 `9px/10px` |
| 控件尺寸 | 2 档 | 3 档：`--h-sm: 24px` / `--h: 28px` / `--h-lg: 32px` |
| 交互态 | **缺** | 新增 `--hover` / `--active` / `--disabled` / `--sel-bg` / `--sel-ring` |

### 6.9 选择模型与键位（已定重映射）

`state.selection: Set<string>`；`selectedId` 保留为 getter 兼容。

- **调用面**：6 个文件 / 30+ 处（`state.js`、`api.js`、`view.js`、`canvas.js`、`toolbar.js`、`thumbnails.js`）——可控
- **新交互**：框选（marquee）、`Shift` 加选、`Ctrl/Cmd` 切换、`Esc` 分层退出、`Ctrl+A` 全选、`Ctrl+拖动` 复制
- **选择框渲染**：`.sel-overlay` 从"单盒 + 8 圆点 + 旋转柄"改为 **N 个 1px 细边框 + 多选时 1 个虚线包围盒 + 四角手柄**
- **对齐语义二义化**（PowerPoint 行为）：单选 → 对齐页面；多选 → 对齐**选区包围盒**；新增**分布**
- **属性面板多选时**显示 **「混合」** 占位，只有可批量设置的属性才可编辑
- 新增 `group` 元素类型（组合 / 取消组合）

| 键 | 现在 | 改为 | 理由 |
|---|---|---|---|
| `Shift` + 点击/拖动 | 大步微调 / 等比 | **加选** | PowerPoint 映射 |
| `Alt` | （空闲） | **微调 / 等比缩放 / 复制拖动** | 承接 `Shift` 让出的语义 |
| `Ctrl/Cmd` + 点击 | — | **切换选中** | PowerPoint |
| `Ctrl+A` | — | **全选**（当前页） | 新增 |
| `Esc` | 取消选中 | **先退框选 → 再取消选中** | 分层 |
| `Ctrl+G` / `Ctrl+Shift+G` | — | **组合 / 取消组合** | 新增 |
| 方向键 | `1px` / `Shift 15px` | **`1px` / `Alt 10px` / `Shift` 网格吸附** | 对齐 PowerPoint 手感 |
| `Ctrl+D` | 复制元素 | 保留 | — |

### 6.10 组件原语层与文件收敛

新增 `editor/components/`：

| 原语 | 取代 | 变体 |
|---|---|---|
| `Button` | `.btn` / `.icon-btn` / `.status-btn` / `.thumb-add` 各处重复定义 | 3 尺寸 × 4 变体（默认 / 主 / 幽灵 / 危险） |
| `Field` | `interaction/fields.js` 的 5 种 kind | **沿用** `num/color/select/checks/text`，只换令牌 |
| `Section` | `.prop-*` 分组 | 可折叠 + 标题 + 重置 |
| `Panel` | `aside.inspector` | 侧栏容器 |
| `Dialog` | `dialogs/base.js` | **沿用骨架** |
| `Menu` | `.add-menu` + 新增右键菜单 | 子菜单、快捷键提示、图标位 |
| `Popover` | `popovers.css`（16 KB，最大文件） | 4 个锚点方向 |
| `Tooltip` | 原生 `title=` | 延迟 400ms |
| `DataGrid` | `excel-grid.js` | 键盘导航 + 范围选择 |
| `Toolbar` | `.topbar` + `.quickbar` | 分组、溢出折叠 |

CSS 收敛（18 → 8，**去掉加载顺序依赖**）：

| 目标文件 | 吸收 |
|---|---|
| `tokens.css` | 扩展令牌（§6.8） |
| `primitives.css` | `base` + `controls` + `fab` + `zoom` + `popovers` + `dialogs` 的原语部分 |
| `layout.css` | `layout` + `topbar` + `thumbbar` + `responsive` |
| `canvas.css` | `canvas` + `quickbar` |
| `inspector.css` | `inspector` |
| `panels.css` | `gallery` + `excel-grid` |
| `present.css` | `present` + `shot` |
| `responsive.css` | 仅断点覆盖（900px，`BP_NARROW`） |

### 6.11 深浅色

- `:root` 只放语义令牌 → `[data-theme="dark"]` 覆盖；**组件永远不知道 light/dark**
- **先修 7 处绕过令牌的硬编码**：`responsive.css:42`、`thumbbar.css:74/75/92/93`、`inspector.css:34/179`、`dialogs.css:9`、`excel-grid.css:12/15`
- 补齐三态：浅 / 深 / **跟随系统**（`prefers-color-scheme`）
- **两层主题**（与 DSH 的接法）：
  1. **自带默认板**——独立 `serve` / GitHub Pages 下自足可看
  2. **DSH 覆盖**——嵌入时由 `applyThemeTokens(rootEl, { tokens, mode })`（契约 3）用 `--dsw-*` 映射覆盖（§5.5）
- `?shot=1` 单列一套：纯背景、无 chrome、无过渡

### 6.12 两刀里程碑与回归保障

| 刀 | 内容 | 为何这样切 | 验收 |
|---|---|---|---|
| **U1** | 选择模型多选化 + 令牌体系 + 原语层 + 修 7 处硬编码 | **地基**，且能被自动化视觉回归覆盖 | `?shot=1` 逐页截图与基线一致；多选 / 框选 / 对齐到选区 / 分布 手动用例全绿 |
| **U2** | 信息架构（B2）+ 配色重做 + 缩略条升级（右键·拖排序·页面多选）+ 深浅色切换 UI + 右键菜单 | 依赖 U1 的令牌与原语；视觉决策多，适合单独打磨 | 浅/深两套截图；`chrome: "full"` 与 `"minimal"` 各过一遍 |

**回归保障（全是现成资产）**

| 手段 | 用途 |
|---|---|
| `tests/tools/ui-shots.mjs` | 已有的截图通道 |
| `?shot=1` + `shot.css` | 确定性渲染（无 chrome、无动画） |
| `tests/run-all.mjs` + `tests/regression/dep-graph.mjs` | 红线：`packages/` 不得 import `editor/`；本次改造只在 `editor/` + 新增 `components/` 内 → **天然不越界** |
| `editor/gallery.js` | 画廊与编辑器共用令牌，U1 后需同步复验 |

### 6.13 本轮决策记录

| # | 岔路 | 结论 |
|---|---|---|
| **R1** | 信息架构 | **B2 减法版**：单行顶栏（插入 / 设计 / 放映）+ 画布零常驻浮层 + 右键上下文菜单 + 底部状态条收纳缩放 |
| **R2** | 圆角气质 | **锐利 `2/4/6px`**；选中态改 `1px` 实线环 + 4 角点（取消 8 圆点与软辉光） |
| **R3** | 深浅色 | **两层**：自带完整默认板 + 嵌 DSH 时用 `--dsw-*` 覆盖；补 `prefers-color-scheme` |
| **R4** | 组件技术 | **原生 DOM + 原语函数**；不引入 React、不引入打包器（保住零依赖 / 零构建纪律）；L4 的 React 化保留可选 |
| **R5** | 切法 | **两刀**：U1 地基 → U2 信息架构与视觉 |
| **R6** | 键位重映射 | **同意**：`Shift`→多选、`Alt`→微调/等比/复制拖动、新增 `Ctrl+A / G / Shift+G`、`Esc` 分层 |
| **R7** | 文档产出 | 本节即产出；另附**静态设计参考稿**（桌面独立 HTML，非仓库文件、不引入构建） |

---

## 7. 实施计划

### 7.1 P0：引擎仓接口化（**功能零变化**）

| # | 任务 | 写入范围（引擎仓） | 验收标准 |
|---|---|---|---|
| P0-1 | 包级 barrel（含 `paths`/`config`）+ `packages/index.js` + `CONTRACT_VERSION = 2` + `exports` map | `packages/*/index.js`、`packages/paths.js`、`packages/config.js`、`package.json` | `import { parseDeck } from "open-pptd/model"`、`import { paths } from "open-pptd/paths"` 等全部可用；`tests/regression/package-integrity.mjs` 绿 |
| P0-2 | `ProjectSource` 契约 + 3 个实现 | `editor/app/project/source.js`（新） | 4 种来源（含 mock 句柄）跑同一套用例；`tests/regression/handle-io.mjs` 绿 |
| P0-3 | `saver.js`/`live-reload.js` 去掉字面量路径，改走 source | 同 2 个文件 | `serve` 模式行为不变；`tests/e2e/incremental-load.mjs` 绿 |
| P0-4 | 主题注入 API + `defaultTokens(light/dark)` + dark 令牌 | `editor/theme.js`（新）、`editor/styles/tokens.css` | 切换 mode 时编辑器无硬编码色残留（§4.2.1 清单清零） |
| P0-5 | `createEditor(rootEl, options)` + `destroy()` + `dom.js` 工厂化 | `editor/editor.js`（新）、`editor/main.js`、`editor/dom.js` | `main.js` 行为零变化；外部脚本可 `create → destroy → create` 两次无泄漏；`tests/tools/ui-shots.mjs` 输出不变 |
| P0-6 | `dialogs` 接口 + 12 处调用点改造 | `editor/dialogs.js`（新）+ 6 个文件 | 覆盖 `alert`/`confirm` 全部 12 处 |
| P0-7 | 契约测试 + dep-graph 加固 + `docs/embedding.md` | `tests/contract/`、`tests/regression/dep-graph.mjs`、`docs/` | 新增规则绿；文档覆盖 **5 组**契约 |
| P0-8 | 版本 2.0.0 + `files` 收口（排除 TTF、保留图标与注册表） | `package.json` | `npm pack` 不含任何 `*.ttf`；含 `assets/icons/**` 与两个 `registry.json`；CLI 与画廊仍工作 |
| P0-9 | `packages/paths.js` + `packages/config.js`（契约 5） | `packages/paths.js`、`packages/config.js` | `OPEN_PPTD_HOME` 覆盖生效；三级解析顺序正确；`ensureHome()` 可重入 |
| P0-10 | 静态多根 + 常量拆分 + 原子下载 | `packages/server/{static,index}.js`、`packages/cli/{export,fonts,icons}.js`、`packages/model/{font-registry,icon-fa}.js` | `resource-paths.mjs` 全绿；**浏览器端 diff 为 0 行**；两个进程并发下载无半截文件 |
| P0-11 | 零迁移验收 | `tests/regression/resource-paths.mjs` | 删除 `~/.open-pptd` 后 CLI 四命令 + `serve` + `export` 全部照常（只读回退生效） |
| P0-12 | **CLI 打磨**：`doctor` / `paths` / `assets list\|sync\|clean` / `ensure` / `serve --detach\|--json\|--stop\|--open` / 导出前置体检 | `packages/cli/bin.js`、`packages/cli/{assets,doctor,ensure}.js`、`packages/cli/export.js`、`packages/server/index.js` | `serve --detach --json` 输出单行 JSON 且父进程立即退出；`--stop` 正确清理且不误杀陈旧 pid；`assets sync icons` 一次请求装完；**在缺 11 个字体的本机上导出引用其中之一的 deck，自动补齐后 `skipped` 为空**；`--offline` 时跳过嵌入但仍导出成功；`--strict` 时非零退出 |
| P0-13 | **三仓拆分落地**：`SKILL.md` + `references/` 迁出；`contract.json` 生成 | 仓 1 删除 `SKILL.md`/`references/`、新增 `contract.json`；新建仓 2 | 仓 1 的 `grep references` 只剩注释与 `font.js:144` 文案；`contract.json` 的条目与 `exports` map 一一对应（契约测试断言） |
| P0-14 | **发布基础设施**：安装脚本 + 资产包 + 校验和 | `scripts/install/{install.ps1,install.sh}`、`pack-release.mjs`、`.github/workflows/release.yml` | `gh release create` 带上 5 类资产；`releases/latest/download/install.ps1` 可下载；脚本内部校验 SHA256；重复执行幂等 |
| P0-15 | **内容面漂移守卫** | 仓 2 `.github/workflows/`（拉仓 1 release zip 做只读比对） | 四项比对（§3.8）全绿；人为改坏一项能报错 |

**P0 出口条件**：`tests/run-all.mjs` 全绿 + CLI 八命令手工抽验 + 浏览器三种入口（`?deck=` / 无 `?deck` / `?shot=1`）全部正常 + **删除 `~/.open-pptd` 后一切照常、创建后新下载立即可见** + **`open-pptd doctor` 五项事实全部正确** + **在干净环境跑一次 `install.ps1`/`install.sh`，`doctor` 与 `serve --detach --json` 均可用**。

### 7.2 P1：适配仓骨架 + 右栏挂载

| # | 任务 | 写入范围（适配仓） | 验收标准 |
|---|---|---|---|
| P1-1 | 包声明 + `lib/engine.js`（解析与自检） | `package.json`、`lib/engine.js` | 解析到引擎根；契约不符时明确报错 |
| P1-2 | `/pptd/**` 路由（静态 + ping） | `lib/routes.js`、`lib/index.js` | 宿主进程内 `GET /pptd/editor/index.html` 200；`/pptd/packages/model/model.js` 200；穿越请求 403 |
| P1-3 | 手写 `lib/client.js`：侧栏图标 + 右栏标签 + 同源 iframe | `lib/client.js` | DSH 里出现侧栏图标；点击后右栏出现可用的编辑器；刷新页面后自恢复 |
| P1-4 | patch 行 + 安装脚本 | 适配仓 `README.md`；profile 的 `cordis.patch.yml`（**由用户确认后**写入） | 重启 DSH 后插件被装载，无报错 |
| P1-5 | 冒烟测试 | `test/smoke.test.js` | 一条命令跑完 1–4 |

**P1 出口条件**：在真机 DSH 里能"点图标 → 右栏编辑 → 改动落盘 → 页面刷新后仍在"。

### 7.3 P2：融合能力

| # | 任务 | 验收标准 |
|---|---|---|
| P2-1 | 主题桥 + 暗色（`lib/theme.js` + client 中继） | 切换 DSH 深浅色，编辑器同步；无残留浅色块 |
| P2-2 | `pptd_check/export/render/fonts` 四工具 | 模型直接调用成功；导出产物可被 PowerPoint 打开 |
| P2-3 | `/pptd` 命令 + 快捷键 + 设置项 | 命令面板可搜到；快捷键可自定义 |
| P2-4 | SKILL 瘦身 + 内容面挂载 | `SKILL.md` 不再要求起 serve；preset 能列出 open-pptd 技能 |

### 7.4 P3：模式与实时

| # | 任务 | 验收标准 |
|---|---|---|
| P3-1 | 「演示模式」preset | 新会话模式选择器出现「演示模式」，自带 `pptd_*` 工具 |
| P3-2 | 文件事件推送取代轮询 | 模型写盘后编辑器 <200ms 刷新；`tests/e2e/incremental-load.mjs` 仍绿 |
| P3-3 | 冲突处理（脏 + 指纹比对 + 对话框） | 模型与编辑器并发改同一页时给出明确选择 |
| P3-4 | `main` 工作台（模板/批量/放映） | 从侧栏可切；素材与批量导出可用 |

### 7.5 分工与写入范围隔离（若用 Agent Teams 并行）

| 阶段 | 可并行的工作流 | 写入范围（互不重叠） |
|---|---|---|
| P0 | ①barrel+exports+`contract.json` ②source 契约 ③theme+dark ④createEditor+dom ⑤dialogs ⑥资源外置（paths/config/静态多根/原子下载） ⑦CLI 打磨（doctor/paths/assets/serve flags） ⑧安装脚本+资产包+发布 ⑨三仓拆分与漂移守卫 ⑩tests+docs | `packages/*/index.js`+`contract.json` ／ `editor/app/project/*` ／ `editor/theme.js`+`styles/*` ／ `editor/editor.js`+`main.js`+`dom.js` ／ `editor/dialogs.js`+6 调用点 ／ `packages/{paths,config}.js`+`packages/server/*`+`packages/cli/{export,fonts,icons}.js`+`packages/model/{font-registry,icon-fa}.js` ／ `packages/cli/bin.js`+`packages/cli/{assets,doctor}.js`+`packages/server/index.js` ／ `scripts/install/*`+`scripts/pack-release.mjs`+`.github/workflows/*` ／ 仓 2 全仓 + 仓 1 删除 `SKILL.md`/`references/` ／ `tests/*`+`docs/*` |
| P1–P3 | 适配仓 Host ／ Client ／ preset ／ 测试 | `lib/*.js` ／ `lib/client.js` ／ `preset/*` ／ `test/*` |
| U1–U2 | ①选择模型 ②令牌 ③原语层+CSS 收敛 ④信息架构+右键菜单 ⑤深浅色切换 UI ⑥缩略条升级 | `editor/app/state.js`+`api.js`+`view.js` ／ `editor/styles/tokens.css` ／ `editor/components/*`+`editor/styles/{primitives,layout}.css` ／ `editor/index.html`+`editor/ui.js`+`editor/interaction/{contextmenu,stage}.js` ／ `editor/theme.js` ／ `editor/app/view/thumbnails.js` |

⚠️ ②③④⑤ 都改 `editor/`，但文件不重叠；**①⑥⑦⑧ 都动 `package.json` / `packages/cli/bin.js`**（`exports`、`files`、命令表）→ **必须串行**或由一人统一改；⑦ 与 ⑥ 在 `packages/cli/` 下有文件名重叠风险（`export.js`/`fonts.js`/`icons.js` vs `assets.js`/`doctor.js`）→ 约定"⑥ 改既有文件、⑦ 只新增文件"即可并行；⑧ 在 `scripts/` 与 `.github/` 下独立，⑨ 跨仓（仓 1 侧只删文件、仓 2 是全新仓），均不与前六条冲突。

**U1–U2 的额外串行约束**：U1 的 ②（`tokens.css`）是 ③（`primitives.css`）与 ⑤（`theme.js`）的**前置**，必须先落；U2 的 ④ 依赖 ③ 的原语与 ① 的选择模型；`editor/index.html` 同时被 ④ 与 ⑥ 触碰 → **由一人统一改**。U1 全程**不得**改 `packages/`（dep-graph 红线）。

### 7.6 UI 重构双刀（与 P0–P3 并行，详见 §6.4–6.13）

| # | 任务 | 写入范围（引擎仓） | 验收标准 |
|---|---|---|---|
| U1-1 | 选择模型改集合：`state.selection: Set<string>`、`selectedId` getter 兼容、框选 marquee、`Shift` 加选、`Ctrl` 切换、`Ctrl+A`、`Esc` 分层、`Ctrl+拖动` 复制 | `editor/app/state.js`、`editor/app/api.js`、`editor/interaction/canvas.js`、`editor/interaction/stage.js`、`editor/app/view/view.js`、`editor/app/toolbar.js`、`editor/app/keyboard.js` | 多选/框选/加选/切换/全选/分层 Esc 六项手动用例全绿；单选行为与改造前一致；`selectedId` 所有旧调用点零改动 |
| U1-2 | 键位重映射（§6.9）：`Shift`→多选、`Alt`→微调/等比/复制拖动 | `editor/interaction/canvas.js`、`editor/app/keyboard.js` | `Alt` 微调 10px、`Alt` 等比缩放、`Alt` 拖动复制可用；`Shift` 不再触发现有的 15px/10px 行为 |
| U1-3 | 对齐语义二义化 + 分布 + 组合（新增 `group` 类型） | `editor/interaction/properties.js`、`editor/types/group.js`（新）、`editor/types/index.js` | 单选对齐页面、多选对齐选区包围盒；6 种对齐 + 2 种分布；组合/取消组合往返幂等 |
| U1-4 | 令牌体系重建（§6.8）：11 阶中性色、交互态、`--r-1/2/3`、`--sh-pop/modal`、`--t-fast/med/slow`、`--h-sm/h/h-lg`；**修 7 处硬编码** | `editor/styles/tokens.css`、`editor/styles/{responsive,thumbbar,inspector,dialogs,excel-grid}.css` | 全仓 `#hex`/`rgba()` 字面量 = 0；圆角取值 ≤ 3 种；`transition` 形态 ≤ 4 种；裸 `z-index` = 0 |
| U1-5 | 组件原语层 + CSS 18→8 收敛 | `editor/components/*`（新）、`editor/styles/*`、`editor/index.html` 的 link 列表 | 类名 ≤ ~110；删除 18 文件级联顺序依赖（打乱 link 顺序仍正确） |
| U1-6 | 选中态视觉：`1px` 实线环 + 4 角点；消灭 36 处软辉光 | `editor/styles/canvas.css`、`editor/interaction/canvas.js` | `grep '0 0 0 3px'` = 0；单选/多选两种状态在浅深两色下都可辨 |
| **U1 出口** | — | — | `tests/tools/ui-shots.mjs` 输出与基线一致（除选中态外观）；`tests/run-all.mjs` 全绿；`packages/` 零改动 |
| U2-1 | 信息架构：单行顶栏（插入 / 设计 / 放映）+ 画布零常驻浮层 + 底部状态条收纳缩放 + `chrome` 三档 | `editor/index.html`、`editor/styles/{layout,topbar}.css`、`editor/app/toolbar.js`、`editor/editor.js` | 画布上常驻浮层 = 0；`chrome: "full"/"minimal"/"shot"` 三档各过一遍 |
| U2-2 | 右键上下文菜单（对齐/层级/组合/翻转/复制/删除）+ 快捷条收敛为 4 项 + ⋮ | `editor/interaction/contextmenu.js`（新）、`editor/ui.js`、各 `types/*.js` 的 `quickbar()` | 右键菜单覆盖全部 §6.6② 动作；快调条项数 ≤ 4 + ⋮ |
| U2-3 | 属性面板分区折叠 + 按类型过滤 + 多选「混合」占位 | `editor/interaction/properties.js`、`editor/app/view/view.js` | 单选显示相关属性；多选显示可批量设置项，其余为「混合」 |
| U2-4 | 缩略条升级：右键菜单、拖动排序、页面多选 | `editor/app/view/thumbnails.js`、`editor/styles/thumbbar.css` | 拖排序可撤销；页面多选后批量删除/复制/导出 |
| U2-5 | 深浅色切换 UI + `prefers-color-scheme` + 配色重做 | `editor/theme.js`、`editor/styles/tokens.css`、DSH 侧 `applyThemeTokens` | 浅/深/跟随系统三态；嵌入 DSH 后跟随 `mode`；两套截图 |
| **U2 出口** | — | — | 浅深两套截图 + 三档 `chrome` 复核；`editor/gallery.js` 共用令牌同步复验 |

> **与 P0 的关系**：U1-1（选择模型）与 P0-5（`createEditor` + `destroy()`）**同改 `editor/app/state.js` 与 `editor/main.js`** → 建议**先做 P0-5 再做 U1-1**（闭包化后重写选择状态最省事，且 `createEditor` 的 `destroy()` 需要一并清理多选监听器）。故 **U1 起点定在 P0 之后**，U2 可与之并行。

---

## 8. 风险登记册

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R-1 | ~~**桌面壳 HMR 不生效**~~ | — | — | ✅ **已实测排除（§1.8.4）**：`dsh-client-hmr` 在活跃 graph 中；`/plugins/events` 是真实 chunked SSE；`dsh-app` 声明 `stream: true`；`forwardWebRequest` 用 `response.body` 流式透传 → **改已有插件的 `client.js` 免刷新热替换**。README 的 "Web transport only" 只指**安装/后端重启**不推帧（新增/移除插件行需刷新） |
| R-2 | ~~**`webviewTag` 不可用**~~ | — | — | ✅ **已实测结论相反但更严格（§1.8.5）**：主窗口 `webviewTag: true`，且「浏览器」侧栏就是 `<webview>` 在产用例；**但** `will-attach-webview` 对无 lease 的 webview 一律 `preventDefault()`，lease 的白名单又**排除 `dsh-app:` 与 DSH 应用主机** → **对第三方实质关闭**。**统一按 iframe 设计，并删除原"后续用 webview 优化"一项** |
| R-3 | **右栏服务名与文档不一致**（`ctx.sidebarRightTabs`/`ctx.sidebarRight` 未第一手核实） | 中 | P1 阻塞 1 天 | P1-0 增加"实测服务名"前置任务；退路是用 `main` 面板 + `shell.overlay` |
| R-4 | **`createEditor` 改造引入编辑器回归** | 中 | 高 | 34 个回归 + 3 个 e2e + ui-shots 四项基线先行跑通；`main.js` 保持零行为变化 |
| R-5 | **dark 暴露大量硬编码色** | 高 | 低 | §4.2.1 已列出 8 处清单，逐项令牌化 |
| R-6 | **引擎仓私有 API 被下游误用** | 中 | 中 | `./internal/*` 明确标注不稳定；dep-graph 规则禁止深路径；契约测试 |
| R-7 | **字体库 98.5 MB 导致装包/分发困难** | 高 | 中 | ✅ **已由 D4/契约 5 解决**：字体大件外置到 `~/.open-pptd/assets/fonts`，以独立资产包分发（`assets sync fonts`）；主 zip 只含两个 `registry.json` |
| R-8 | **两条写路径竞态**（模型与编辑器同时写） | 中 | 高 | §5.6.1 写路径归一；P3-3 加指纹比对与对话框 |
| R-9 | **`render` 依赖外部 Chrome/Edge + CDP** | 中 | 中 | 短期保留外部浏览器；长期用宿主 Chromium 截图（P4，需同源） |
| R-10 | **同源挂载后 DSH 端口变化导致 IndexedDB/Cache 归属变化** | 低 | 中 | ✅ **已由 D4/契约 5 解决**："最近项目"读写 `~/.open-pptd/state/recent.json`，与浏览器源无关 |
| R-11 | **patch 行整体替换 `config` 语义**导致误改其他插件配置 | 低 | 高 | 只**追加**新行，不改既有行 |
| R-12 | **模型误用 `pptd_export` 覆盖用户文件** | 低 | 中 | 工具默认输出到项目 `out/`；覆盖需显式参数 |
| R-13 | **并发下载互相污染**：CLI 与插件可能同时下载同一字体，而 `cli/fonts.js` 用 `writeFileSync` 直写、无 `.part` + `rename` | 低 | 中 | 原子落地（`tmp/*.part` → `rename()`）+ 可选 lock。**注**：我此前把本条写成"半截文件会被当成已安装"，**实测有误**——`cli/fonts.js:83-93` 已做 magic 前 4 字节校验 **加** size 与注册表比对，size 不符会重下，所以"半截被误认完整"已被防住，剩下的仅是并发写得互相污染 |
| R-14 | **插件写用户 home（工作区之外）在受限沙箱下失败** | 中 | 中 | 捕获 `EACCES`/`EPERM` → 降级只读模式（只用包内回退）+ 警告一次；路径在设置页可见 |
| R-15 | **`~/.open-pptd` 里的过期 `registry.json` 遮蔽包内注册表** | 低 | 高 | 规则写死：`registry.json` **永远只查包内**，并由 `resource-paths.mjs` 断言 |
| R-16 | **技能在、但 CLI 未安装**（三仓解耦后 S 不再自带运行时；技能本身无法自愈，尤其离线时） | 中 | 高 | R8：SKILL.md 第一段就是 `open-pptd doctor` 自检，失败必须**明确报告并给出安装命令**，绝不假装能继续；仓 3 可选提供需显式确认的 `pptd_install` |
| R-17 | **PATH 变更对已运行进程无效** → 安装成功但 DSH 派生的 shell 仍找不到 `open-pptd` | 中 | 中 | 仓 3 **不依赖 PATH**，按固定位置读 `cli/current`（§3.6 解析顺序）；安装脚本明确提示"新开终端 / DSH 需重启" |
| R-18 | **`serve` 前台阻塞导致 agent 工具调用挂死**，进程被超时强杀后端口释放、用户点开链接连不上 | 中 | 中 | L1.6 的 `--detach` + `--json`；SKILL.md 的预览分支只给带 `--detach` 的命令 |
| R-19 | **`curl\|bash` / `irm\|iex` 供应链**（远程脚本直接交 shell 执行） | 低 | 高 | 只用**固定 tag** 的脚本 URL；脚本内部强制 SHA256 校验；技能侧不改用滚动分支；安装前先告知用户 |
| R-20 | **三仓拆分成为 breaking change**：老用户 `<skills>/open-pptd/` 是整个引擎仓，直接替换会丢运行时 | 高 | 中 | release notes 写清四步迁移（§3.6）；`doctor` 可用于迁移后验证；仓 1 的 zip 与旧目录形态**不能并存于同一路径**，故不做原地兼容 |
| R-21 | **`contract.json` 与 `exports` map 口径漂移**（两处各写一份） | 中 | 中 | 抽成同源数据 + 契约测试断言两者条目一一对应（P0-13 验收项） |
| R-22 | **字体静默降级导致交付物字体不符而无人察觉**（导出时缺字体只 `console.warn` 后跳过嵌入，PPTX 回退系统字体） | **高** | **高** | §3.6 的**导出前置资源体检 + 按需补齐**（默认开）；`--strict` 供 CI 硬失败；导出结果带 `embedded/skipped` 清单，`--json` 供 agent 如实转述 |
| R-23 | **远程字体源不可达**（`raw.githubusercontent.com` 在部分网络下不稳） | 中 | 中 | 复用既有回退链 `url` → `mirrors`（jsDelivr）+ 源健康降级；`assets sync fonts --from <zip>` 离线导入；补不齐时软降级不阻断导出 |
| R-24 | **编辑器无自动化视觉测试**，UI 重构回归面大（54 JS + 18 CSS 全在射程内） | 高 | 中 | 用现成资产兜住：`tests/tools/ui-shots.mjs` 基线截图 + `?shot=1` 确定性渲染；**U1/U2 各自出口都要求截图过一遍**；红线（`packages/` 不得 import `editor/`）保证不波及引擎 |
| R-25 | **键位重映射破坏既有肌肉记忆**（`Shift` 从"大步微调"改为"多选"） | 高 | 低 | 一次性切换不做双轨（双轨更乱）；在顶栏「帮助/快捷键」里给完整键位表；`Alt` 完整承接让出的语义（微调/等比/复制拖动） |
| R-26 | **多选引入后对齐语义二义化**：单选=对齐页面、多选=对齐选区，用户可能误判对齐基准 | 中 | 中 | 画布上用不同视觉区分基准（单选画页面参考线、多选画选区虚线框）；属性面板标题随选择数变化（「对齐」（页面）／「对齐（选区）」） |
| R-27 | **U1 与 P0 互相踩**：`U1-1` 与 `P0-5` 同改 `editor/app/state.js`、`editor/main.js` | 中 | 中 | 已定**顺序**：先 P0-5 完成 `createEditor` 闭包化与 `destroy()`，再做 U1-1（闭包化后重写选择状态最省事，且多选监听器需要被 `destroy()` 一并清理） |

---

## 9. 待决问题

请逐条给出选择，我据此把 §7 变成可执行工单。

| # | 问题 | 选项 | 我的建议 |
|---|---|---|---|
| Q1 | 交互主形态 | (a) 右栏标签为主 + `main` 为辅 (b) `main` 整屏为主 (c) 只要右栏 | **(a)** |
| Q2 | P0 是否接受"引擎仓先动" | (a) 先做 P0 再接 DSH (b) 跳过 P0 直接用 iframe 硬接 | **(a)**：否则长期就是"两边各自改" |
| Q3 | 引擎改动深度 | L0–L2（本方案）／只到 L1／还要 L3 | **L0–L2**；L3 放 P4 |
| Q4 | 仓库与发布 | (a) 两仓 + 发 npm (b) 两仓 + `file:` 本地依赖 (c) 不拆仓 (d) 三仓 + 不发 npm | ✅ **已定 (d)**：三仓拆分、暂不发 npm；安装脚本装 CLI，仓 3 走 `contract.json` 解析（§3.6） |
| Q5 | 仓的归属划分 | (a) 各建独立仓 (b) 放引擎仓的 `integrations/dsh/` 子目录（违背 R1 精神） | ✅ **已定 (a)**：仓 1 引擎+CLI / 仓 2 技能 / 仓 3 DSH 适配，三仓独立 |
| Q6 | 内容面与预览指令 | 是否"删掉起 serve 段 + 内容面留引擎仓"？ | ✅ **已定，但有修正**：内容面**全部迁到仓 2**（`SKILL.md` + `references/` 同目录，唯一副本）；**`serve` 不删**（是其他 agent 的唯一预览通道），SKILL.md 改为**按环境分支**（§5.7） |
| Q7 | `--dev` 期望 | (a) 接受"改代码后刷新页面" (b) 必须先摸清桌面 HMR 再定计划 | ✅ **已实测（§1.8.4）**：改**已有**插件的 `lib/client.js` → **免刷新热替换**；**新增/移除**插件行 → 需刷新页面 |
| Q8 | 预览面 | 是否需要"模型产出的 .pptx 在右栏文档标签里预览"（形态 C）？ | 建议 P3 之后再说 |
| Q9 | 主题 | 编辑器跟随 DSH 深浅色是**必须**还是**加分**？ | 必须（否则谈不上融合） |
| Q10 | 是否顺手修 `skill open-pptd` 当前不可见 | 修／不修／改由 preset 提供技能根规避 | 用 preset 规避（更干净） |
| Q11 | 资源目录环境变量名 | `OPEN_PPTD_HOME` ／ `PPTD_HOME` | ✅ **已定 `OPEN_PPTD_HOME`**（带项目名前缀，不易撞） |
| Q12 | 图标库（2.3 MB / 2164 SVG）怎么分发 | 预置进主 zip ／ 独立资产包 ／ 维持 CDN 兜底 | ✅ **已定：独立资产包 + 安装脚本默认装**（主 zip 保持 1.07 MB；`assets sync icons` 一次请求替代 2164 次。这修正了此前"预置随包"与白名单"图标不进包"的矛盾） |
| Q13 | 是否按平台分叉资源目录（`%LOCALAPPDATA%` / XDG） | 分叉 ／ 单一 `~/.open-pptd` + 环境变量覆盖 | ✅ **已定不分叉**：单一点目录最可预测、文档与 SKILL 最好写，平台差异由 `OPEN_PPTD_HOME` 兜底 |
| Q14 | 技能仓是否捆绑安装脚本 | 捆绑 `install.ps1`/`install.sh` ／ **不捆绑，SKILL.md 用一句话引导** | ✅ **已定不捆绑**：脚本只存在于仓 1 并作为 release 资产发布；技能仓保持纯 markdown |
| Q15 | 安装脚本的触发方式 | 固定 tag ／ 滚动分支 ／ `latest/download` | ✅ **已定 `latest/download` 稳定 URL**（运维可用 `--version` 锁定）；脚本内部强制 SHA256 校验 |
| Q16 | 版本区间由谁守 | 应用层声明 `requires-cli` 并校验 ／ 运维决定，应用层只做 fail-fast 诊断 | ✅ **已定后者**（R7 / §3.7）：SKILL.md 不做版本守门，仓 3 保留 `contractVersion` 诊断 |
| Q17 | `~/.open-pptd` 是否加 `assets/` 子目录 | 资源散在根目录 ／ 收进 `assets/` | ✅ **已定收进 `assets/{fonts,icons}`**，结构刻意与包内同名，解析链即"同名目录多根叠加" |
| Q18 | 导出时缺字体是否自动下载 | 手动 `fonts download` ／ 导出前置自动补齐 | ✅ **已定自动补齐**（§3.6 五步流程），默认开、`--offline` 可关 |
| Q19 | 补不齐时阻塞导出吗 | 硬失败 ／ 软降级 ／ 由 flag 决定 | ✅ **已定默认软降级**（跳过嵌入 + 明确告警，仍导出成功）；`--strict` 供 CI / 交付场景硬失败 |
| Q20 | 编辑器 UI 是否整体重构 | 只换皮 ／ **减法优先重构** ／ 完整 Ribbon | ✅ **已定：减法优先重构**，七条决策见 **§6.13**（R1 信息架构 B2 减法版 · R2 锐利 2/4/6px · R3 深浅色两层 · R4 原生原语不引 React · R5 两刀 · R6 键位重映射 · R7 另附静态设计稿） |

**Q20 补充**：本轮新增的 UI 重构工作被拆成 **U1 / U2 两刀**（§6.12、§7.6），**起点在 P0 之后**（因为 U1-1 与 P0-5 同改 `editor/app/state.js` 与 `main.js`，需先完成 `createEditor` 闭包化）。这是 §9 中最后一个尚未落地的事项。

---

## 附录 A：DSH 槽位目录

**框架级（`dsh-client-ui-layout` 声明，插件可注册的类型已标注）**

| key | kind | 说明 |
|---|---|---|
| `root` | 根 | AppFrame 本体（不可注册） |
| `sidebar` | single | 左栏整列（归 `ui-sidebar` 独占） |
| `main` | **keyed** | **中间整屏，按 key 分发；仅 `conversation` 被保留** ✅ 可注册 |
| `rightbar` | single | 右栏整列（归 `ui-sidebar-right` 独占） |
| `shell.overlay` | list | 全屏浮层 ✅ 可注册 |
| `shell.leading` | single | macOS 左上窗口留白位 |

**左栏** — `sidebar.brand.mark`、`sidebar.brand.name`、**`sidebar.panellist`**（list，✅ 图标入口）、`sidebar.workspaces{,.directoryFlow,.session.menu.item,.session.row.action}`、`sidebar.session.row.{leading,hover}`、`sidebar.chat.conversation`、`sidebar.settings`、`sidebar.footer.action`、`sidebar.toggle.badge`

**右栏** — `rightbar.session`、**`sidebar.right.pane.tab`**（keyed，✅ 标签 chrome）、`sidebar.right.pane.tab.title`、`sidebar.right.tab.document{,.action,.actions,.office.pdf,.unpreviewable}`、`sidebar.right.tab.guide.entry`、`sidebar.right.tab.menu.item`

**会话/聊天** — `main.conversation`、`conversation.session{,.header,.header.lineage,.header.actions,.header.utilities,.header.corner}`、`conversation.view`、`conversation.composer{,.bar,.dock}`、`conversation.input.{dock,left,right,overlay,activity,attachments,model,permission,plan}`、`conversation.message.images`、`conversation.trajectory.images`、`conversation.approval.detail`、`conversation.plan-review.actions`、`conversation.header{,.leading}`、`conversation.hero.{workspace,workspace.directoryFlow,brand.mark,agentPreset}`、`conversation.chat.node`（keyed，keys：`user/steering/context/turn-trigger/system-prompt/assistant-step/command/manual-compaction/compaction/model-retry/turn-error/turn-max-tokens/turn-process/turn-tail/unknown`）、`conversation.chat.{commandview,turnTail,assistant-actions}`

**设置** — `settings.{trigger,header,action,close,section,plugins.tab,general.item,launcher,onboarding}`、`settings.models.{provider-card,footer,sign-in}`、`settings.plugin.item`

**工具/交付物** — `tool.call.toolview`、`tool.call.images`、`tool.view.cordis`、`deliverables.file.actions`、`deliverables.review.file.actions`

**插件管理内部** — `plugins.{item,row.config,bundle.activation,bundle.config,detail.actions,detail.badge,detail.section}`

**其他** — `shell.quota-notice`

> 完整 88 键以 0.2.0 实测为准；本表为方案所需的高相关子集 + 关键分类。

---

## 附录 B：可 require 的 9 个模块与主题令牌

**冻结平台模块表（恰好 9 个）**：

```
react
react/jsx-runtime
react-dom
react-dom/client
@deepseek-ai/cordis
@deepseek-ai/dsh-client-store
@deepseek-ai/dsh-client-ui-slots
@deepseek-ai/dsh-client-ui-primitives
@deepseek-ai/dsh-client-ui-dockkit
```

**`--dsw-alias-*` 常用语义令牌**（全部需要 light + dark 两套值）：

`bg-base`、`bg-layer-1`、`bg-layer-2`、`bg-layer-3`、`bg-overlay`、`bg-mask-{1,2,3}`、`bg-skeleton`、`border-l{1,2,3,4}`、`brand-primary`、`brand-text`、`label-{primary,secondary,tertiary,caption,dimmed,inverted}`、`interactive-bg-{hover,active}`、`button-primary-fill`/`-hover`/`-dimmed`、`button-ghost-active-{fill,border}`、`state-{error,success,warn,business,idle}-primary`、`link`、`scrollbar-bg-l{1,2}`、`scrollbar-hover-l{1,2}`、`settings-card-{fill,stroke}`、`tooltip-bg`、`toast-bg`、`menu-icon`、`markdown-*`

**非 alias 但常用**：`--dsw-elevation-{panel,prominent,soft,stroke}`、`--dsw-corner-shape`、`--dsw-focus-ring-{color,width}`（属"几何/层级"族）、`--dsw-menu-surface-fill`（共享菜单契约，不得改值）、`--dsw-font-*`（排版比例）

**框架力学变量（`--dsh-*`，非设计令牌）**：`frame-top-clearance`(48px)、`frame-leading-clearance`、`windows-content-radius`、`windows-sidebar-width`、`content-font-size`、`content-font-size-secondary`、`scrollbar-{width,track-margin,thumb,thumb-border,thumb-hover}`、`boot-bg`

**模式信号**：`body[data-ds-dark-theme]`；平台：`html[data-platform='darwin']`、`html[data-windows-titlebar]`

---

## 附录 C：证据索引

### DSH（0.2.0-rc.1，asar）

| 主题 | 路径 |
|---|---|
| 插件管理（整屏 `main` 面板先例） | `@/dsh-client-ui-plugin-manager/lib/client.js` |
| 根槽位声明 / `LayoutController` | `@/dsh-client-ui-layout/lib/client.js`、`README.md` |
| 槽位契约与四种 kind | `@/dsh-client-ui-slots/README.md` |
| 冻结模块表 `QS()` | `@/dsh-web-frontend/dist/assets/index-Dy0OhsZ5.js` |
| 客户端插件声明与 hybrid 解析 | `@/dsh-client-modules/lib/index.js`（`parseDshClient` / `clientExportOf` / `locatePkgJson` / `nearestPackage`）、`README.md` |
| 工具契约 | `@/dsh-tools/README.md` |
| HTTP 路由/升级/fallback | `@/dsh-host-webserver/README.md` |
| 静态前端托管与 401 | `@/dsh-host-frontend-static/README.md` |
| HMR（含 "Web transport only"） | `@/dsh-client-hmr/README.md` |
| 主题令牌 | `@/dsh-client-ui-theme/README.md` |
| 设置扩展点 | `@/dsh-client-ui-settings/README.md`、`@/dsh-client-ui-settings-plugins/README.md` |
| 命令面板 | `@/dsh-client-ui-commands/README.md`、`lib/client.js` |
| 右栏与标签类型 | `@/dsh-client-ui-sidebar-right/README.md` |
| loopback iframe 先例与 sandbox | `@/dsh-client-ui-sidebar-browser/README.md` |
| bundle 模板 | `@/dsh-client-ui-brand-official/lib/client.js`、`package.json` |
| 无壳 CSP（取证） | 全 289 包 grep `Content-Security-Policy`/`X-Frame-Options`/`frame-ancestors` |

### 本机环境

| 主题 | 路径 |
|---|---|
| 宿主进程命令行 | PID 10964（`--expose-internals` + asar 的 `dsh-desktop-host/lib/index.js` + profile 路径） |
| 运行时版本 | `D:\dsh-desktop\resources\runtime\primary-runtime\runtime.json`（`desktopVersion 0.2.0-rc.1`、node 24.21.0、pnpm 11.7.0） |
| 捆绑 Node | `D:\dsh-desktop\resources\runtime\primary-runtime\dependencies\node\bin\node.exe` |
| profile | `C:\Users\法法\.dsh\profiles\desktop\{package.json,cordis.patch.yml,cordis.yml}` |
| 旧树（0.1.5，仅供对照） | `C:\Users\法法\.dsh\profiles\node_modules\@deepseek-ai\`（6 个断链 junction） |
| 用户技能根 | `C:\Users\法法\.dsh\skills\open-pptd`（junction → `C:\Users\法法\.pi\agent\skills\open-pptd`） |
| 实时槽位树转储 | `%TEMP%\dsh-spill-HHAetb\session-d55ac7c256cd\dfb2a8013911-cordis_inspect_query.txt`（1549 行） |

### open-pptd（1.5.0）

| 主题 | 路径 |
|---|---|
| 技能清单 | `SKILL.md`（178 行） |
| 包声明 | `package.json`（无 dependencies，`bin.open-pptd`） |
| 编辑器入口 | `editor/main.js`（240 行，顶层 `boot()`；`ROOT` 第 34 行） |
| DOM 单例 | `editor/dom.js`（53 行，永久 `cache`） |
| 令牌 | `editor/styles/tokens.css`（79 行，唯一 `:root`，无 dark） |
| 根绝对路径 ×2 | `editor/app/project/saver.js:198`、`editor/app/project/live-reload.js:93` |
| 句柄接缝 | `editor/app/project/handle-io.js`（+ `tests/regression/handle-io.mjs`） |
| 元素类型注册表 | `packages/model/registry.js`（50 行，分片合并语义） |
| 文档 I/O | `packages/model/pptd-io.js`（`parseDeck`/`serializeDeck`） |
| 预览接缝 | `packages/renderer/page.js`（`renderPage`/`autoGrowTexts`/`disposeChartInstances`） |
| 导出纯函数 | `packages/writer/pptx.js`（`buildPptx`/`downloadPptx`） |
| HTTP 层 | `packages/server/{index,api,events,static}.js` |
| CLI 命令表 | `packages/cli/bin.js`（180 行） |
| 分层纪律 | `tests/regression/dep-graph.mjs` |
| 内容面 | `references/{design.md 42KB, pptd.md 81KB, shapes.md 15KB, slides_categories/*×8}` |
| 宿主敌意调用 ×12 | `editor/types/image.js:26`、`editor/interaction/excel-grid.js:90/97/105/113`、`editor/interaction/dialogs/table-editor.js:142/152/204/224`、`editor/app/project/io.js:85`、`editor/app/project/loader.js:168`、`editor/app/toolbar.js:45` |
| 硬编码色 ×8 处 | `styles/responsive.css:42`、`styles/thumbbar.css:74/75/92/93`、`styles/inspector.css:34/179`、`styles/dialogs.css:9`、`styles/excel-grid.css:12/15`（`styles/present.css` 保持中性） |
| **资源路径单点常量** | `packages/cli/export.js:23-25`（`SKILL_ROOT` / `FONT_LIB_DIR` / `ICON_LIB_DIR`） |
| **浏览器端资源 URL** | `packages/model/font-registry.js:17（REGISTRY_PATH）、:20（ROOT）、:40、:66（fontFileUrl）`；`packages/model/icon-fa.js:17（REGISTRY_REL）、:100（localUrl）` |
| **注册表加载的 Node 分支** | `packages/model/font-registry.js:31-47`（`loadFontRegistry({fontDir, fs})`） |
| **字体下载与写盘** | `packages/cli/fonts.js:17-24（loadRegistry/fontStatus）`、`:50-56（超时与并发常量）`、`:58+（fontsDownload）` |
| **图标下载与写盘** | `packages/cli/icons.js:41,73,118` |
| **静态解析与穿越防护** | `packages/server/static.js`（`MIME`/`resolveFile`/`sendFile`） |
| **资源现状实测** | `assets/fonts` = 17 个 TTF / **98.5 MB**；`assets/icons` = 2164 个 SVG / **2,337 KB** |
| **DirectoryHandle 回归** | `tests/regression/handle-io.mjs` |
| **发布白名单（唯一打包口径）** | `scripts/pack-release.mjs:30-42` 的 `WHITELIST`；注释明写"tests/、docs/、examples/、.github/、scripts/、图标源文件…一律不进包；字体文件本体不入包" |
| **发布产物实测** | `dist/open-pptd-v1.4.7.zip` = **1.07 MB / 167 项**（packages 75 · editor 73 · references 11 · assets 2 · bin 1 · 根 4） |
| **发布流水线** | `.github/workflows/release.yml`：tag `v*` → 校验 tag 与 `package.json` version 一致 → `test:fixtures` → `npm test` → `npm run pack` → `gh release create "$TAG" dist/*.zip`（**注意：当前只上传 zip，未含安装脚本**） |
| **npm 发布状态** | `npm view open-pptd version` → **404 Not Found**（未发布）；`package.json` 无 `repository`/`publishHome`/`private`/`publishConfig` |
| **git 远端** | `origin = https://github.com/Shingwha/open-pptd.git` |
| **仓库体积实测** | 总计 **142.9 MB**：assets 100.8 · tests 21.5 · examples 11.7 · docs 3.5 · packages 2.5 · dist 2.1 · editor 0.5 · references 0.2 |
| **`references/` 清单** | 11 个文件 / ~270 KB：`design.md` 41.7 · `pptd.md` 79.6 · `shapes.md` 15.3 · `slides_categories/*` 8 个 ~113 |
| **引擎对 `references/` 的依赖** | 全仓 grep：**只有注释**（`style-spec.js:13,26,78`、`svg-gradient.js:4`、`theme-presets.js:4`、`theme.js:4,24`、`validate.js:107`、`gradient.js:4`、`meta.js:4`、`font-manager.js:13`、`gen-preset-geometry.mjs:24`）+ 白名单 `pack-release.mjs:33,39` + 文案 `writer/font.js:144`。**零代码读取 → 搬迁零成本** |
| **`serve` 实测行为** | `bin.js:94-116`：`--port`（默认 55173）/ `--project`；`await startServer(...)` 后进程**前台阻塞**且无 `--detach`。`server/index.js:83-107`：绑 `127.0.0.1`、`EADDRINUSE` 最多顺延 10 个端口、`port:0` 取随机、`console.log("open-pptd 已启动: …/editor/?deck=…")`（**中文单行、无 `--json`**） |
| **字体注册表结构** | `assets/fonts/registry.json` 顶层 = `version, note, fonts, systemFonts`；**27 条**。条目字段实测：`key, family, file, url, mirrors[], size, subset, category, style, usage, license, weight, italic, fsType` |
| **本机字体就绪度** | **16 / 27 就绪，11 个缺失**：`FeiboZhengDots.ttf`、`zcoolxiaoweiLOGO.otf`、`BoutiqueBitmap9x9.ttf`、`LXGWZhiSongMN.ttf`、`LXGWZhenKai.ttf`、`HedvigLettersSans-Regular.ttf`、`Oranienbaum-Regular.ttf`、`SortsMillGoudy-Regular.ttf`、`Coda-Regular.ttf`、`Jersey15-Regular.ttf`、`Jersey20Charted-Regular.ttf` |
| **导出缺字体的真实行为** | `cli/export.js:122`（读注册表）、`:155`（注入 `fontDir: FONT_LIB_DIR`）；`writer/font.js:89-91` Node 分支读盘 → `:96-100` 失败时 `console.warn` + `spec.loadError="file-missing"` + **`return null`（跳过嵌入）**。关键：`if (spec.file)` 先命中，**`spec.url` 分支永不为注册表字体执行** → 有远程地址也不回退 |
| **下载器已有能力（可直接复用）** | `cli/fonts.js:83-93`：magic 前 4 字节（`OTTO` / `0x00010000`）+ **size 与注册表比对**，不符即重下；`:94-97`：`f.url` → `f.mirrors` 回退链 + 源健康降级（网络类错误降级、HTTP 4xx 不降级）；`:99-107`：连接 10s / body 60s 两段超时；并发 6 |
| **提示文案需改** | `writer/font.js:144` 现提示"请核对 references/design.md §4 中的注册名"——该文档已迁至仓 2（§3.8），需改指 `open-pptd assets list` |

**桌面壳探测（2026-09-29，只读；结论见 §1.8）**

| 证据 | 位置 / 内容 |
|---|---|
| Electron 入口 | `resources/app.asar/lib/main.js`（468 KB）；主进程参数含 `--expose-internals …/dsh-desktop-host/lib/index.js <dshRoot> <profile> <runtime> <pnpm> <binDir>`；二进制名 `DeepSeek Harness.exe` |
| 主窗口 origin | `SCHEME="dsh-app"`（`6221`）、`applicationUrl = \`${SCHEME}://app/\``（`10777`）、`createWindow(appPreload,false,true)`（`11521`）、`navigateMain(applicationUrl)`（`10931/10955/11572/11677`） |
| origin 旁证 | `ws://127.0.0.1/*` 校验 `headers.origin !== "dsh-app://app"`（`11098`）；IPC 校验 `startsWith("dsh-app://app/")`（`11111`、`11503`、`9916`）；`applicationFrame`（`6264`） |
| scheme 权限 | `registerSchemesAsPrivileged`：`standard/secure/supportFetchAPI/corsEnabled/stream/codeCache: true`（`10545-10555`） |
| 转发链 | `protocol.handle(SCHEME, …)`（`11046`）：`/`、`/index.html`、`/assets/*`、`/favicon.svg`、`/manifest.webmanifest` → **直接从 `dsh-web-frontend/dist` 提供**；其余 → `forwardWebRequest(request, hostUrl, hostCookie)`（`11052`） |
| 流式透传 | `forwardWebRequest`（`7181-7211`）：换 `cookie` 为 host cookie，`return new Response(response.body, …)` —— **ReadableStream 直传，无 `arrayBuffer()` 缓冲** |
| 插件 bundle 缓存 | `PLUGIN_BUNDLE_PATH.test(pathname)` → 强制 `cache-control: no-store`（`7207`） |
| SSE 活体 | `GET http://127.0.0.1:19387/plugins/events` → `200` + `content-type: text/event-stream` + `Transfer-Encoding: chunked` + `: connected` + 完整 `graph` 帧（curl 超时 28）；graph 含 `@deepseek-ai/dsh-client-hmr`，`immediately: true` |
| HMR 端点为文档相对 | `dsh-client-hmr/lib/client.js:45` `const EVENTS_ROUTE = "/plugins/events".slice(1)`，`:64` `new EventSource(EVENTS_ROUTE)`；注释指向 `2026-09-14-web-document-relative-app-routes.md` |
| README caveat 归属 | `dsh-client-hmr/README.md:118`，位于 **Known Limitations and Deferred Work** 章节："Electron installation and backend restart handling do not use this SSE path" |
| webviewTag | `main.js:10631 webviewTag: primary`；`11521 createWindow(appPreload, false, true)`；另两处 `webviewTag: false`（`8880` login、`9226` guest 策略） |
| webview 在产用例 | `9146 var DesktopBrowserGuests`；`9234 owner.on("did-attach-webview", …)`；`11523 browserGuests.bind(window, …)`；preload `716-717 acquire/release`；主进程 `11079/11083` |
| webview 拦截 | `9208 will-attach-webview`：`lease === void 0 → event.preventDefault()`；并把 preferences 重置为 `nodeIntegration:false / contextIsolation:true / sandbox:true / webSecurity:true / webviewTag:false / plugins:false`（`9216-9231`） |
| webview 导航白名单 | `9314 allowedNavigation`：仅 `http:`/`https:`、无凭据、且 `!isApplicationHost(url)`；`9319 isApplicationHost` 覆盖同端口的 `hostname`/`localhost`/`127.0.0.1`/`[::1]` |
| 裸 GET / | `401`（需 token/cookie） |

**编辑器 UI 量化（2026-09，只读统计；结论见 §6.4）**

| 证据 | 数值 / 位置 |
|---|---|
| 规模 | `editor/` = 18 CSS / 86.5 KB + 54 JS / 369.8 KB（`app/` 24 个 137.6 · `interaction/` 14 个 152.1 · `types/` 9 个 33.9） |
| 18 个 CSS（大到小） | `popovers` 16.0 · `inspector` 11.4 · `dialogs` 10.1 · `canvas` 7.2 · `gallery` 6.9 · `responsive` 5.6 · `excel-grid` 4.5 · `present` 4.2 · `thumbbar` 4.0 · `controls` 3.7 · `quickbar` 3.2 · `tokens` 2.9 · `fab` 1.7 · `base` 1.6 · `topbar` 1.4 · `zoom` 1.2 · `layout` 0.6 · `shot` 0.3（KB） |
| 颜色字面量 | **43 个不同值 / 55 次**；`#fff` 单独出现 **11 次**（`controls.css:41/59` …） |
| 圆角 | **15 种**；`var(--radius-sm)` 35 次 / `var(--radius)` 15 次 / `999px` 13 次 / `var(--radius-lg)` 9 次 / `50%` 6 次 / 裸 `4px` 3 次 / `2px` 2 次 / `99px` 2 次 / `16px 16px 0 0` 2 次 / `5px` 2 次 / `3px` 1 次 / `6px` 1 次 / `14px` 1 次 / `0` 1 次 |
| 阴影 | 9 种；`0 0 0 3px var(--primary-tint)` **36 次**；`inset 0 0 0 999px …`（`excel-grid.css:12/15`）；裸 `0 -8px 32px rgba(28,37,50,0.16)`（`responsive.css:42`） |
| font-size | 7 种；`var(--text-sm)` 34 / `var(--text-xs)` 33 / `var(--text-md)` 18 / `var(--text-lg)` 5 / 裸 `10px` 3 / `var(--text-xl)` 3 / 裸 `9px` 1 |
| transition | **24 种形态**；裸 `0.08s ease`（`canvas.css:78/146`）、`0.22s`（`inspector.css:15`）、`0.3s ease`（`present.css:89/150`） |
| z-index | 9 种；已成令牌 `--z-dropdown` 9 / `--z-sticky` 4 / `--z-modal` 3 / `--z-toast` 2 / `--z-overlay` 1；裸 `40`（`canvas.css:243`）、`6`（`responsive.css:65`）、`3`×3、`1`（`gallery.css:222`） |
| 令牌使用 | `var(--` **973 次**，仅 **1 处** fallback；`!important` 3；`@media` 6；`@keyframes` 2 |
| 类名 | CSS **268 个**不同类名；JS **202 个**；JS 用到但 CSS 无 = 7 |
| `tokens.css` | 79 行 / ~45 令牌：8 中性 + 4 强调 + 6 语义 + 6 字号 + 6 间距 + 3 圆角 + 2 控件高 + 1 顶栏高 + 3 阴影 + 5 层 + 2 时长 + 1 缓动（**设计不差，但缺 11 阶中性色与交互态**） |
| 选择模型 | `state.js:16 selectedId: null`（**标量**）；`:30` `find(el => el.elementId === state.selectedId)`；全仓唯一 `Set` 在 `saver.js:243`（导出对话框**页面**多选）；`Shift` 被 `canvas.js:195`（15px 微调）/ `:232`（等比）/ `:292`（10px 拖动）占用；`keyboard.js` 仅 `Ctrl+Z/Y/S/D` |
| 画布浮层 | `.quickbar` / `.fab-stack` / `.zoom-ctl` / `.add-menu` 被 `stage.js:33` 排除出画布命中测试（即四块常驻浮层）；`index.html` 顶栏 5 个平铺按钮（文件 / 字体 / 配色 / 放映 / …） |
| 可复用资产 | `interaction/fields.js` 117 行 / 5 种 kind（`num/color/select/checks/text`）；`interaction/dialogs/base.js` 101 行壳；`interaction/properties.js` 240 行（已含对齐 6 种 + 层级 2 种 + 旋转/透明度/翻转）；`types/` 7 种元素注册表；`ui.js:258-270` widget 工厂 |
| 硬编码颜色绕过令牌 | `responsive.css:42`、`thumbbar.css:74/75/92/93`、`inspector.css:34/179`、`dialogs.css:9`、`excel-grid.css:12/15` |

---

## 附录 D：接口签名清单（可直接抄写）

### D.1 引擎仓对外契约

```js
// open-pptd/model
export { parseDeck, serializeDeck, createDeck, createPage, nextElementId,
         deckSize, PAGE_WIDTH, PAGE_HEIGHT, PAGE_TYPES, SUPPORTED_SHAPES,
         registerType, getType, allTypes, ELEMENT_TYPES,
         resolveTheme, resolveColor, resolveFont, DEFAULT_THEME, DEFAULT_FONT,
         THEME_PALETTES, mergePaletteColors, validateDeck, registerRule,
         walkElements, collectImageSrcs, shapePaths, shapeMenuIcon, PRESET_SHAPES } from "./model/index.js";

// open-pptd/renderer
export { renderPage, autoGrowTexts, disposeChartInstances, iconThumb } from "./renderer/index.js";

// open-pptd/writer
export { buildPptx, downloadPptx, downloadBlob, magicMatches, ZipWriter } from "./writer/index.js";

// open-pptd/server
export { createServer, startServer, PROJECT_ROOT } from "./server/index.js";

// open-pptd/cli
export { runCheck, exportDeck, exportProject, runRender, runFonts, runIcons, runGallery } from "./cli/index.js";

// open-pptd
export const CONTRACT_VERSION = 2;
```

```js
// open-pptd/paths
export function openPptdHome(): string;          // OPEN_PPTD_HOME → os.homedir()/.open-pptd
export function ensureHome(): string;            // 幂等创建，返回 home
export const paths: {
  home: string;                 // ~/.open-pptd（或 OPEN_PPTD_HOME）
  assets: string;               // home/assets
  fonts: string;                // home/assets/fonts
  icons: string;                // home/assets/icons
  cli: string;                  // home/cli
  cliCurrent: string;           // home/cli/current  ← 仓 3 的默认解析目标
  config: string;               // home/config.json
  state: string; cache: string; tmp: string;
};
export const resourceRoots: {
  fonts: string[];    // 读顺序：[home/assets/fonts, <pkg>/assets/fonts]
  icons: string[];    // 读顺序：[home/assets/icons, <pkg>/assets/icons]
  registry: string[]; // 【必须只有一根】[<pkg>/assets/{fonts,icons}]，永不含 home
};
export function resolveCliRoot(): string | null; // §3.6 解析顺序；供 B 复用同一逻辑
export function contractRoot(): string;          // 含 contract.json 的包根（= resolveCliRoot 结果）

// open-pptd/config
export function readConfig(): {
  version: number;
  fontDir?: string;          // 覆盖默认字体目录（可选）
  iconDir?: string;
  exportTheme?: string;      // pptd_export 默认配色预设
  renderBrowser?: string;    // render 的浏览器路径（可选）
  [k: string]: unknown;
};
export function writeConfig(patch: object): void;   // 浅合并写回，保留未知键
```

```js
// open-pptd/assets —— 资源体检与按需补齐（§3.6）
export function collectRequirements(manifest, ctx): {
  fonts:  Array<{ ref: string, family: string, file: string|null, source: "registry"|"system"|"unknown" }>;
  icons:  Array<{ ref: string, style: string, name: string }>;
  media:  Array<{ ref: string, path: string }>;
};

export function checkResources(req, opts): {
  fonts:  Array<{ family: string, status: "ok"|"missing"|"will-cdn"|"system"|"unknown", path?: string }>;
  icons:  Array<{ name: string,   status: "ok"|"missing"|"will-cdn" }>;
  media:  Array<{ path: string,   status: "ok"|"missing" }>;
  missing: string[];                     // 人类可读清单
};

export async function ensureResources(manifest, opts?: {
  offline?: boolean;                     // true = 只体检不下载
  only?: ("fonts"|"icons"|"all")[];      // 缺省 all
  concurrency?: number;                  // 缺省 6
  onProgress?: (e: { kind: string, name: string, phase: "start"|"ok"|"fail", detail?: string }) => void;
}): Promise<{
  fetched: string[];                     // 实际下载成功的
  failed:  Array<{ name: string, reason: string }>;
  stillMissing: string[];
}>;
```

`ensureResources` 的行为约束（与既有下载器保持一致）：**magic 前 4 字节校验 + size 与 `registry.size` 比对 + `url`→`mirrors` 回退 + 源健康降级**；补不齐**不抛错**，交由调用方决定（`export` 默认软降级、`--strict` 硬失败）。

### D.2 `createEditor`

```js
/**
 * @param {HTMLElement} rootEl
 * @param {{
 *   source: ProjectSource,
 *   deck?: { manifestText: string, pageFiles?: Map<string,string> },
 *   theme?: { tokens?: Record<string,string>, mode?: "light"|"dark" },
 *   chrome?: "full" | "embedded" | {
 *     topbar?: boolean, brand?: boolean, github?: boolean,
 *     thumbbar?: boolean, quickbar?: boolean, zoom?: boolean, inspector?: boolean
 *   },
 *   dialogs?: { alert(msg: string): void|Promise<void>,
 *               confirm(msg: string): boolean|Promise<boolean> },
 *   locale?: string,
 *   on?: {
 *     ready?(inst): void, dirty?(v: boolean): void, saved?(paths: string[]): void,
 *     error?(e: Error): void, deckChange?(deck): void, selectionChange?(sel): void
 *   }
 * }} options
 * @returns {{
 *   ready: Promise<void>,
 *   destroy(): void,                      // 幂等
 *   api: object,                          // 稳定：select/updateSelected/deleteSelected/…
 *   io: object,                           // 稳定：save/reload
 *   state: object, view: object           // 不稳定，仅供高级用法
 * }}
 */
export function createEditor(rootEl, options);
```

### D.3 `ProjectSource`

```js
/**
 * @typedef {object} ProjectSource
 * @property {{ writable: boolean, liveWatch: boolean, binary: boolean }} capabilities
 * @property {() => Promise<{ manifestText: string, pageFiles: Map<string,string>,
 *                            media?: Map<string, Uint8Array> }>} read
 * @property {(files: Array<{path:string, text?:string, bytes?:Uint8Array}>) => Promise<void>} write
 * @property {(path: string) => Promise<Uint8Array|null>} [readMedia]
 * @property {(cb: (evt: {kind:"deck"|"page"|"media", path:string}) => void) => (() => void)} [watch]
 */

export function httpSource({ base = "", deckUrl } = {});      // 现有 serve 模式；base 参数化
export function directoryHandleSource(handle);                 // File System Access
export function memorySource({ files = {} } = {});             // 测试/嵌入
```

### D.4 主题

```js
export const TOKENS: string[];                                 // 引擎支持的令牌名
export function defaultTokens(mode: "light" | "dark"): Record<string,string>;
export function applyThemeTokens(
  rootEl: HTMLElement,
  opts: { tokens?: Record<string,string>, mode?: "light"|"dark" }
): () => void;                                                 // 返回还原函数
```

### D.5 适配仓 Host 半边

```js
// lib/index.js —— 零 @deepseek-ai/* 导入
export const name = "dsh-plugin-pptd";
export function apply(ctx) {
  // 1) 解析引擎 + 契约自检
  // 2) 注册 /pptd/**（静态 / api/ping / api/save / events）
  // 3) 注册工具 pptd_check / pptd_export / pptd_render / pptd_fonts / pptd_preview
  // 4) 订阅项目目录变更并广播
}
export const inject = ["tools", "webServer"];   // Cordis 服务名
```

### D.6 适配仓 Client 半边

```js
window.__ModuleLoader__.load({
  id: "dsh-plugin-pptd",
  factory: (require) => {
    const React = require("react");
    const inject = ["slots", "layout", "sidebarRight", "sidebarRightTabs"];
    const PANEL_ID = "pptd";
    function apply(ctx) { /* sidebar.panellist + 右栏标签 + main 面板 */ }
    return { apply, inject, PANEL_ID };
  }
});
```

### D.7 profile patch 增补行（形状仅示例，**待你批准后才写入**）

```yaml
# ~/.dsh/profiles/desktop/cordis.patch.yml —— 仅追加新行，不修改既有行
- insert:
    - id: dsh-plugin-pptd
      name: "./plugins/dsh-plugin-pptd/lib/index.js"
      config:
        projectRoot: null        # 由会话/工作区决定；null = 按当前工作区
        routePrefix: "/pptd"
```

### D.8 契约 5 的消费方式（适配仓，示意）

```js
import { paths, resourceRoots, ensureHome } from "open-pptd/paths";
import { readConfig } from "open-pptd/config";

// 启动阶段
try { ensureHome(); } catch (e) { /* EACCES/EPERM → 只读降级 */ }

// 静态路由：把 /pptd/assets/** 交给引擎的两级根
ctx.webServer.register({
  path: "/pptd/assets/",
  async handle(req, res) {
    const rel = new URL(req.url, "http://x").pathname.replace("/pptd/assets/", "");
    const isRegistry = rel.endsWith("registry.json");        // 注册表永远只查包内
    const roots = isRegistry ? resourceRoots.registry
      : rel.startsWith("fonts/") ? resourceRoots.fonts.map(r => r)   // 已含 home 优先
      : resourceRoots.icons;
    // 依次尝试 roots，首个命中即 sendFile；全未命中 → 404
  }
});

// 最近项目（取代 IndexedDB）
await fs.writeFile(join(paths.state, "recent.json"), JSON.stringify(list, null, 2));

// 设置页展示
const cfg = readConfig();
const info = { home: paths.home, fonts: dirSize(paths.fonts), icons: dirSize(paths.icons), theme: cfg.exportTheme };
```

> 注意：适配仓只**消费**，不构造路径字符串——所有目录名都来自 `paths`（R6）。

### D.9 CLI 命令面（技能仓依赖的稳定面）

```
open-pptd serve   [--project <dir>] [--port <n>] [--detach] [--json] [--open]
open-pptd serve   --stop
open-pptd check   <manifest>
open-pptd export  <manifest> [--out <file>] [--offline] [--strict] [--json]
open-pptd export-project <manifest> [--out <file>] [--offline] [--strict] [--json]
open-pptd ensure  <manifest> [--offline] [--strict] [--json]
open-pptd render  <manifest> [--out <dir>] [--page all|<n>] [--scale <n>]
open-pptd gallery scan|list
open-pptd assets  list | sync [icons|fonts|all] [--from <zip>] | clean
open-pptd paths   [--json]
open-pptd doctor  [--json]
open-pptd fonts   list|download|check        ← 兼容别名，转发到 assets sync fonts
open-pptd icons   list|download              ← 兼容别名，转发到 assets sync icons
```

**`export` / `export-project` 的默认前置**：先跑 `ensure <manifest>`（§3.6）。`--offline` 只体检不下载；`--strict` 有缺失即非零退出；补不齐时**默认软降级**（跳过嵌入 + 告警，仍导出成功）。

**稳定性承诺**：仓 2（技能）只依赖这张表。**新增子命令是兼容变更**，改变既有子命令的语义才是破坏性变更。

**`serve --json` 的 stdout 契约**：**只输出一行 JSON**；`--json` 模式下人类文案一律走 **stderr**，避免解析歧义。

```json
{"url":"http://127.0.0.1:55173/editor/?deck=project/deck.pptd","port":55173,"pid":4812}
```

**`doctor --json` 输出契约**：

```json
{
  "cli":   {"version":"2.0.0","root":"C:\\Users\\x\\.open-pptd\\cli\\versions\\2.0.0"},
  "node":  {"version":"v22.14.0"},
  "home":  {"path":"C:\\Users\\x\\.open-pptd","writable":true},
  "assets":{"fonts":{"ready":17,"total":17},"icons":{"ready":2164,"total":2164}},
  "path":  {"onPath":true,"dir":"C:\\Users\\x\\.open-pptd\\cli\\bin"}
}
```

**`serve --stop` 的状态文件**：`~/.open-pptd/state/serve.json`

```json
{"pid":4812,"port":55173,"url":"http://127.0.0.1:55173/editor/?deck=project/deck.pptd",
 "projectRoot":"C:\\work\\my-deck","startedAt":"2025-01-01T00:00:00.000Z"}
```

停止前必须校验：pid 存活 **且** 该 pid 确为 open-pptd 启动（避免陈旧 pid 误杀无关进程）。

---

*本文档为设计稿。经确认后，§7 的 P0–P3 将转为可执行工单；在此之前不修改任何代码。*



