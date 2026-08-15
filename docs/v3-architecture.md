# open-pptd V3 整体重构架构方案

> 状态：方案草案 ｜ 日期：2026-08 ｜ 范围：架构设计（分层解耦 + AI 对话生成 + 服务化/私有部署/开源 SaaS 双形态）
> 前置阅读：`README.md`（现状）、`docs/editor-v2-ux.md`（V2 编辑器改造）、`references/pptd.md`（格式契约）

---

## 0. 现状诊断（V2 探索结论）

### 0.1 值得保留的资产（V3 不动或只做形式迁移）

| 资产 | 说明 | V3 处置 |
|---|---|---|
| **PPTD 单一契约** | manifest + pages/*.page + media/，YAML 人类可读；渲染与导出同源（预览=导出） | 保留并升级为**带 schema 的显式契约** |
| **类型注册表** | `types/registry.js`：新增元素类型只需注册 render/toXml/props/quickbar | 保留，迁入 `model` 包 |
| **零依赖** | 全自研 ESM（writer/renderer/图标/图表/公式/zip），Node 内置即可跑 | 核心引擎包继续零依赖 |
| **文件即项目** | 项目 = 文件夹，可版本化、可 zip 打包、可挂载预览 | 保留为默认存储格式 |
| **预览先行 UX** | 页面逐个落盘 → SSE 实时刷新 → 用户边看边反馈 | 升级为生成流水线的流式事件 |
| **分层测试** | 组件项目 + 一键回归 + E2E（真实浏览器 CDP） | 保留并新增依赖图/契约测试 |
| **部署降级模式** | 前端无 `/api/save`、`/events` 时自动降级为下载 zip | 正式化为**能力探测**机制 |

### 0.2 核心问题（V3 重构点）

1. **引擎与 UI 耦合**：writer/renderer/core 物理上放在 `editor/` 目录内，服务端（`lib/pptd-export.js`）要从"前端目录" import。引擎不是独立可发布单元。
2. **没有校验层**：PPTD 的审查规则散落在 `pptd-io.js` 解析与人工审查经验中（类型/边界/主题 token/溢出/对比度），无法被服务端自动执行，质量闸门依赖"人工自觉"。
3. **生成逻辑不在代码里**：当前的"AI 生成"发生在外部智能体（LLM + 提示词工作流）中，网页服务无法复用这条通道——这是"网页 AI 对话生成"的最大障碍。
4. **没有 API 层**：`lib/editor-server.js` 是静态服务器 + SSE + `/api/save`，没有用户/项目/生成/导出/配额概念，无法直接演进为云服务。
5. **没有部署形态**：无配置系统、存储抽象、认证、任务队列、Docker——无法自托管或上云。
6. **无多租户概念**：画廊与项目均单租户静态。

---

## 1. V3 目标与设计原则

### 1.1 目标

- **G1 引擎纯净化**：model / writer / renderer 抽为独立包，浏览器、Node、Worker 三端可复用，零依赖。
- **G2 生成引擎化**：对话 → PPTD 的流水线固化为代码，LLM Provider 可插拔（DeepSeek/豆包/通义/Claude/Ollama…），生成通道可扩展。
- **G3 服务化**：API-first；本地 `serve` 与云端是同一套 server 包、同一 API 契约，仅配置不同。
- **G4 可部署**：Docker 一键自托管；同一代码库可开 SaaS（认证/计费/对象存储为插件）。
- **G5 保持零依赖**：核心引擎无需 npm install，降低自托管与二次开发门槛。

### 1.2 设计原则

1. **PPTD 是唯一契约**：一切跨层通信走 PPTD 的 YAML 文本形态（manifest + pages/*.page）。**LLM 直接输出 YAML**（不做 JSON 中转），经解析 + schema 校验 → writer/renderer 消费。**生成与渲染彻底解耦**（可跨进程、跨机、异步）。
2. **单向依赖**：`model ← writer/renderer ← generator ← server ← apps`。UI 只依赖 API，不直接碰文件系统。
3. **环境适配层**：I/O（文件/HTTP/DB/对象存储/浏览器）全部抽象，同一代码跑浏览器/Node/Docker。
4. **目录边界 = 包边界**：保持相对导入（零依赖、无构建），但用依赖图测试强制依赖方向。
5. **能力探测**：前端通过 `GET /api/capabilities` 发现服务能力（是否可保存/实时刷新/认证/计费），本地与云端同一前端代码。
6. **插件接口先行**：认证、存储、计费、队列、LLM 全部走接口，开源默认实现 = noop/本地，SaaS 注入商业实现。

### 1.3 扩展性设计（V3 核心关注）

所有扩展点遵循同一模式：**接口定义 → 注册表/工厂 → 内置默认实现 → 配置/插件覆盖**。

| 扩展点 | 机制 | V3 内置实现 | 扩展方式 |
|---|---|---|---|
| 元素类型（text/shape/chart…） | 类型注册表（现有，迁入 model） | 7 种 | 新模块注册 render/toXml/props/quickbar，渲染/导出/面板/菜单自动接入 |
| 图表类型 | chart 模块 | 13 种 | 注册新图表渲染/导出对 |
| 预置形状 / 图标 / 字体 | 数据文件 + 生成脚本 | 187 形状 / 192 图标 / 29 字体 | 追加数据 + scripts 重新生成 |
| 校验规则 | 校验规则注册表（model） | schema / token / 资源 / 几何 / 对比度 | 注册新规则（如品牌合规、企业风格强制） |
| 导出格式 | `Exporter` 注册表（writer） | PPTX / 项目 zip / PNG / PDF | 注册新 Exporter（如 HTML 版、模板导出） |
| LLM 通道 | `LLMProvider` 注册表（generator） | openai-compatible / anthropic / ollama | 新实现即新通道（未来 agent 通道同此接入） |
| 模板规则生成器 | 版式库注册表（generator） | 内置版式集 | 注册新版式模板 |
| 存储 | `ProjectStore` 接口（server） | disk / s3 | 新适配器 |
| 认证 | `AuthProvider` 接口（server） | none / session / OAuth | 新适配器 |
| 计量 / 配额 / 支付 | `Metering` / `QuotaPolicy` / `BillingProvider` | noop / 配置表 | 新策略或支付网关 |
| 任务队列 | `TaskQueue` 接口（server） | in-process / redis | 新队列后端 |
| 服务端能力 | 路由挂载点 | 核心 API | 中间件 / 插件路由 |

配套工程保障（写入 CI）：
- **依赖方向测试**（`tests/dep-graph.mjs`）：目录边界即包边界，禁止跨层 import，防止解耦退化；
- **契约测试**：PPTD schema、API 契约、Provider/Adapter 接口均有测试锁定；
- **配置驱动**：所有插件选择走配置（env/配置文件），代码零改动切换实现。

---

## 2. 目标架构总览

```
┌───────────────────────────────────────────────────────────────┐
│ 交付面 Delivery Surfaces                                      │
│   CLI │ 本地 serve │ Docker 自托管 │ SaaS                     │
├───────────────────────────────────────────────────────────────┤
│ 应用层 apps/                                                   │
│   web：AI 对话生成页 + 编辑器 + 画廊 + 账户/会员 UI             │
├───────────────────────────────────────────────────────────────┤
│ 服务层 packages/server（API-first，配置驱动）                  │
│   REST/SSE API │ 认证插件 │ 项目存储抽象 │ 任务队列 │ 计量/配额 │
├───────────────────────────────────────────────────────────────┤
│ 生成引擎 packages/generator（LLM Provider 可插拔）               │
│   意图→大纲→设计→逐页生成→校验→修复（LLM Provider 抽象）       │
├───────────────────────────────────────────────────────────────┤
│ 引擎层 packages/engine（纯、确定性、零依赖）                   │
│   model    PPTD 数据模型 + schema + 校验器                     │
│   writer   PPTD → PPTX（OOXML）                                │
│   renderer PPTD → DOM/SVG（浏览器预览、headless 出 PNG/PDF）    │
└───────────────────────────────────────────────────────────────┘
    PPTD（YAML 文本）是唯一跨层契约；依赖只允许自上而下
```

**核心思想：三层引擎（确定性代码）与生成大脑（AI）分离，中间只传递 PPTD 的 YAML 文本。** 谁生成的不重要（LLM API / 模板规则 / 未来的 agent 通道），下游（校验 → 渲染 → 导出）完全一致，质量天然对齐。

---

## 3. 引擎层 `packages/model | writer | renderer`（G1）

### 3.1 来源与迁移

| 新包 | 来源（现状） | 职责 |
|---|---|---|
| `packages/model` | `editor/core/`（model/theme/pptd-io/richtext/chart/geometry/icon…）+ `editor/types/` | PPTD 数据模型、YAML 解析/序列化、normalize、**schema 校验器**（错误带行号）、类型注册表 |
| `packages/writer` | `editor/writer/` | PPTD → PPTX（OOXML 全量生成 + 字体嵌入 + 图片处理），纯 Node/浏览器双端，零 DOM |
| `packages/renderer` | `editor/renderer/` + `lib/pptd-render.js` | PPTD → 预览 DOM（浏览器）；headless 渲染 PNG/PDF（复用现有 CDP 零依赖实现） |

规则：
- 三个包只依赖 `model`（writer/renderer 不互依赖）；全部零第三方依赖。
- 禁止反向 import（`model` import `writer` 等）——`tests/dep-graph.mjs` 静态扫描强制。
- `editor/` 保留 UI 层（app/interaction/vendor/styles），从 `packages/*` import 引擎。

### 3.2 校验器（把人工规则固化为代码）——V3 关键新能力

```js
// packages/model/validate.js
validateDeck(deck) → ValidationReport
// { errors: [], warnings: [], perPage: { n: [...] } }
// 每条 issue 带 YAML 定位（行号/列号：js-yaml mark + 元素 bounds 反查）
```

校验维度（将人工审查经验 + pptd.md 约束代码化）：
- **schema**：字段类型、必填、数值边界（坐标/尺寸/字号/透明度 0-1）、枚举（对齐/线型/图表类型…）
- **token 引用**：`$key` 必须存在于 `theme.colors`；`fontFamily` 必须命中字体注册表或声明 url
- **资源引用**：图片 src 存在且字节签名合法；`iconName` 在图标库中（否则导出跳过）
- **几何启发式**：元素越界（超出画布）、文本溢出估算（字号×行数 vs 框高）、重叠遮挡
- **对比度**：文本 vs 背景的 WCAG 相对亮度比（error/warning 分级）

消费端：
- 编辑器：页级实时校验（画布旁提示）
- CLI：`open-pptd check <deck.pptd>`；导出前自动闸门
- generator：生成后自动校验 → 触发修复循环
- 服务端：API 生成/保存时校验

---

## 4. 生成引擎 `packages/generator`（G2）——AI 对话生成的核心

### 4.1 生成流水线（全代码化）

```
UserInput（主题/文档/大纲/参考图/风格）
  → ① intent    需求理解：风格、页数、版式、内容四维澄清（需求访谈）
  → ② outline   逐页大纲（页类型/标题/要点）→ 产出 manifest 的 pages 清单片段
  → ③ design    主题决策：17 键配色 + 字体 + 文本/表格样式 → 产出 manifest 的 theme/fonts 片段
  → ④ compose   逐页生成元素 → 直接输出 pages/*.page 的 YAML 文本（可逐页流式产出）
  → ⑤ validate  引擎层校验器（§3.2）自动检查（YAML 解析 + schema，错误带行号）
  → ⑥ repair    规则修复 + LLM 迭代修复（≤N 轮，按带行号的 error 清单定向重生成出错页）
  → ⑦ assemble  拼接 manifest（②③ 片段 + 页清单）→ 逐页落盘 + media/ → 项目文件
```

### 4.2 关键设计

- **YAML 直出协议（LLM 输出 = 项目最终格式）**：LLM 直接输出 PPTD 的 YAML 文本（manifest 片段 + 逐页 page），不做 JSON 中转。理由：
  - **零转换**：不需要「LLM 出 JSON → 再序列化为 YAML」这一步，LLM 产出即项目文件，少一层失真与维护成本；
  - **无转义地狱**：富文本标签、LaTeX 公式（`\(...\)`、`\frac`）在 JSON 里需双重转义、极易出错，YAML 块标量（`|`）原样保留；
  - **格式即规范**：`references/pptd.md` 本身就是格式规范文档，直接复用为生成 prompt 的格式说明，无需为生成通道另维护一套协议文档；
  - **错误可定位**：js-yaml 解析错误带行号列号（现状 `_parseErrorLine` 已有此机制），喂回 LLM 修复时信息精确；
  - **中间产物可审计**：生成过程中的 YAML 就是项目文件，用户可随时打开检查、手动修改。
  代价与兜底：YAML 有缩进/特殊字符陷阱——由「js-yaml 解析失败重试 + 校验器行号定位 + 修复循环」兜底。
- **LLM Provider 抽象**：

```js
interface LLMProvider {
  chat(messages, opts) → { text }
  complete(system, user, { format?: 'yaml' | 'json' }) → string
  // 统一文本输出，默认 'yaml'（LLM 直出 YAML 文本，解析 + 校验兜底）
  // format:'json' 仅供 provider 内部映射 JSON mode（部分 API 的结构化输出优化），
  // 不作为跨层协议——模型层只认 YAML 文本。
}
```

| 实现 | 场景 |
|---|---|
| `openai-compatible` | DeepSeek / 豆包 / 通义 / OpenAI / 智谱…（一个实现全兼容，国内可直连） |
| `anthropic` | Claude（质量优先） |
| `ollama` | 完全本地、零成本自托管（Docker 场景） |

> 注：`agent` 通道（由外部智能体执行生成任务）为**后续版本预留**——`LLMProvider` 接口即扩展点，届时新增一个实现即可接入，V3 不实施。

- **Search Provider 抽象**（可选）：`intent/outline` 阶段联网扩展材料。本地默认 noop；服务端可接搜索 API。
- **流式事件**：流水线每阶段/每页产出即发事件 `{type: 'outline'|'theme'|'page', pageIndex, …}` → SSE 推前端 → 对话页/编辑器逐页实时出现（保留"页面逐个出现"的招牌 UX）。
- **离线降级**：无 LLM key 时用**模板规则生成器**（主题 + 大纲 → 版式库套用），自托管零配置也能出基础 PPT。
- **确定性保证**：同一输入（意图 + 参考）→ 同一 prompt 模板 → 输出经校验器闸门，质量可控、可回归测试（`tests/generator/*.mjs` 用固定 fixture 断言）。

### 4.3 生成通道与扩展

- V3 生成通道：LLM API（openai-compatible / anthropic / ollama）+ 模板规则（离线降级）。
- 质量保障：validate 闸门（§3.2）+ 修复循环 + fixture 回归（确定性保证）。
- 后续新通道（如 agent/外部智能体）以新增 `LLMProvider` 实现接入——流水线与校验逻辑零改动。

---

## 5. 服务层 `packages/server`（G3）——API-first

### 5.1 API 契约（本地与云端同一套）

```
POST   /api/projects                    创建项目（返回 projectId + 初始 deck）
GET    /api/projects/:id                项目快照（manifest + pages 列表）
PUT    /api/projects/:id/pages/:rel     保存页（写回，对应现有 /api/save）
POST   /api/projects/:id/generate       AI 生成（SSE 流式：progress/outline/page/validate 事件）
POST   /api/projects/:id/export         导出任务（PPTX / 项目 zip / PNG / PDF）→ {taskId}
GET    /api/tasks/:id                   任务状态 + 进度（轮询或 SSE）
GET    /api/tasks/:id/download          下载产物
GET    /api/gallery                     画廊（本地扫描 examples/；云端走库）
GET    /api/me                          当前用户/配额（认证启用时）
GET    /api/capabilities                能力探测（auth/billing/save/events/llm 是否可用）
```

- 现有 `/events`（SSE 文件变更）保留为 `GET /api/projects/:id/events`。
- 本地模式 = 同一 server 以 `--mode local` 启动：匿名用户、disk 存储、无计费——现有 `serve` 命令行为不变（前端零改动可继续用）。

### 5.2 存储抽象

```js
interface ProjectStore {
  create(owner, deckMeta) → project
  read(projectId) → { manifest, pages, media }
  writePage(projectId, rel, content)
  list(owner) → projects
  delete(projectId)
  // 媒体/字体缓存同样走 store
}
```

| 实现 | 场景 |
|---|---|
| `disk`（默认） | 文件即项目，`data/projects/{owner}/{slug}/`，本地与自托管 |
| `s3` | 对象存储 + 元数据 DB（Postgres/SQLite），SaaS 横向扩展 |

### 5.3 认证、计量、队列（全部插件化）

```js
AuthProvider    // none(本地) | session+cookie(自托管) | OAuth(云)
Metering        // usage 事件记录：generate/export/render/storage 计量点
QuotaPolicy     // 配置化限额表（匿名/免费/会员档位）
TaskQueue       // in-process(默认) | redis(可选，多副本)
BillingProvider // 预留：stripe/微信支付 → 改变 plan 字段（见 §8）
```

- **会员机制只做"计量点 + 配额"，不做支付**：所有生成/导出/渲染入口埋计量钩子，限额策略可配置。支付集成后置为插件。
- 开源默认 `AuthProvider=none, Quota=∞`——功能零损失，仅缺"账户体系"。

### 5.4 渲染 Worker（云上 PNG/PDF）

- 复用现有 CDP 零依赖实现（`lib/pptd-render.js` 已是成熟方案），打包为 `render-worker` 容器（headless Chrome + server），导出 PNG/PDF 走任务队列。
- PDF 导出 = headless Chrome print-to-PDF（同一渲染管线，预览=导出原则延续到 PDF）。
- 远期备选：纯 Canvas 渲染器（OffscreenCanvas + 自研文本布局），省掉浏览器依赖——大工程，列为远期项。

---

## 6. 前端应用层 `apps/web`（G2 的可见面）

### 6.1 新增：AI 对话生成页（核心新体验）

```
┌────────────────────────────────────────────────┐
│ [对话区]  描述需求：主题/文档/参考 → 逐轮追问   │
│           确认「风格/页数/版式/内容」四维        │
├────────────────────────────────────────────────┤
│ [生成区]  大纲卡片流 → 点击确认 → 逐页生成      │
│           （SSE 逐页事件，页面实时出现）         │
├────────────────────────────────────────────────┤
│ [跳转]    进入编辑器微调 → 导出 PPTX/PDF/PNG    │
└────────────────────────────────────────────────┘
```

- 对话体验 = 四维澄清（风格/页数/版式/内容）的引导式对话，澄清逻辑与 prompt 模板都在 generator 包内，前端只做呈现。
- 生成中可打断/改稿（基于已有项目 YAML 做增量重生成，而非全量重来）。

### 6.2 编辑器改造

- UI 层（`editor/app|interaction`）只 import `packages/model|writer|renderer`，数据读写全部走 API（本地模式打到 localhost server；GitHub Pages 部署模式维持能力探测降级）。
- 编辑器嵌入 `apps/web` 路由（`/editor/:projectId`），画廊保留。

---

## 7. 交付面与部署形态（G4）

### 7.1 三种形态 = 同一代码、不同配置

| 形态 | 组成 | 配置 |
|---|---|---|
| **本地 serve** | server(`--mode local`) + editor | 零配置 |
| **Docker 自托管** | web + server + render-worker +（可选 ollama） | env：LLM key / 存储路径 / 端口 |
| **SaaS 云服务** | 同上 + 认证/计费/S3/Redis | env：auth / billing / storage / queue |

> Agent/Skill 形态为后续版本（见 §4.3），V3 交付面即上表三种。

```
deploy/
  docker-compose.yml      # web + api + render-worker + (ollama profile)
  Dockerfile              # 多阶段：静态前端 + Node server
  .env.example            # 全部配置项注释齐全
  k8s/                    # 远期：多副本部署清单
```

### 7.2 开源与商业化策略

- **核心全部 MIT 开源**：model / writer / renderer / generator（含 OpenAI 兼容 provider）/ server（含本地实现）/ editor / web。
- **商业插件接口化**：支付、高级配额、企业存储等以插件形式存在，可独立私有仓库，通过接口注入——开源版与 SaaS 版代码同构，不 fork。

---

## 8. 会员机制设计（初步，仅架构预留）

```
User.plan: anonymous | free | pro | team
QuotaPolicy（配置化，例）：
  anonymous  每日生成 3 次 / 导出 3 次 / 存储 50MB / 基础模型
  free(注册)  每日 10 次 / 存储 500MB / 基础模型
  pro(会员)   无限 / 高级模型 / PDF 高清 / 团队协作（远期）
```

- **计量点**（代码埋点）：`generate`（每次生成）、`export`（每次导出）、`storage`（项目总大小）、`render`（PNG/PDF 页数）。
- **不做的**（后置）：支付网关、订阅管理、发票。接口留 `BillingProvider.planOf(user)`，先由管理员/配置文件直接赋 plan。
- 匿名体验优先：未登录可完整走通"对话 → 生成 → 导出"，触发配额时引导注册——转化漏斗天然成立。

---

## 9. 目录结构（V3 目标形态）

```
open-pptd/
├── packages/                     # 引擎 + 生成 + 服务（目录边界 = 包边界）
│   ├── model/                    #   PPTD 模型/schema/校验器/类型注册表（零依赖）
│   ├── writer/                   #   PPTD→PPTX（零依赖）
│   ├── renderer/                 #   PPTD→DOM/PNG/PDF（零依赖 + 可选 CDP）
│   ├── generator/                #   生成流水线 + LLM/Search Provider（零依赖）
│   ├── server/                   #   API + storage/auth/metering/queue 适配器
│   ├── editor/                   #   编辑器 UI（浏览器端，只依赖 model/writer/renderer）
│   └── cli/                      #   open-pptd 命令（serve/export/render/generate/check/fonts）
├── apps/
│   └── web/                      # SaaS 前端：对话生成页 + 编辑器宿主 + 画廊 + 账户
├── deploy/                       # docker-compose / Dockerfile / .env.example / k8s(远期)
├── references/                   # 共享参考文档（pptd.md / themes.md / shapes.md / …）
├── examples/                     # 画廊示例（与现状一致）
├── tests/                        # 分层：unit(model/writer) / generator fixture / server API / E2E
├── scripts/                      # 构建与发布脚本（gen-icons / pack-release / …）
└── docs/                         # 架构与开发文档
```

> 说明：保持零依赖 = 不需要 npm workspaces 安装；包间用相对导入，依赖方向由 `tests/dep-graph.mjs` 静态扫描强制（防止"包边界形同虚设"）。
> 注：`skill/`（agent 交付面）为后续版本预留，不纳入 V3 目录。

---

## 10. 分阶段迁移路线（每阶段可发布、可回退、V2 兼容）

| 阶段 | 内容 | 产出/验收 | 依赖 |
|---|---|---|---|
| **P0 引擎抽包** | `editor/core|writer|renderer` → `packages/model|writer|renderer`（纯搬移 + import 修正）；新增依赖图测试 | 现有测试全绿；CLI/editor 功能不变 | — |
| **P1 校验代码化** | model 校验器（§3.2 全维度）；`open-pptd check`；导出前置闸门；编辑器实时校验 | 人工审查规则 ≥80% 自动化；坏 deck 导出被拦截 | P0 |
| **P2 生成引擎** | generator 包 + YAML 直出协议 + `openai-compatible` provider（DeepSeek 等）+ `open-pptd generate "主题"` CLI（流式输出） | 命令行可生成合格 deck（YAML 直出）；fixture 回归测试 | P0,P1 |
| **P3 服务化** | server 包（REST/SSE + disk 存储 + 匿名会话 + 任务队列 in-process）；`apps/web` 对话页；`serve` 升级为 `--mode local` 完整 API | 浏览器全流程：对话→生成→编辑→导出；本地 `serve` 行为兼容 | P2 |
| **P4 部署与商业** | Docker 自托管 + 认证/计量/配额 + render-worker + s3 存储适配；`apps/web` 账户页 | `docker compose up` 可用；SaaS 配置可上线 | P3 |

- P0–P1 是纯工程重构（无新功能，风险最低，建议立即做）。
- P2 是"AI 对话生成"的技术前提，先用 CLI 打磨 prompt 质量（比直接做 UI 迭代快）。
- P3 让"网页生成 PPT"成为现实；P4 是商业化开关。

---

## 11. 风险与待决策

| # | 风险/问题 | 对策/建议 |
|---|---|---|
| 1 | LLM 生成质量不稳定（元素坐标/富文本/图表数据易错） | 校验修复循环（错误带行号）+ schema 收敛 prompt + **YAML 直出（无 JSON 转义失真）** + 逐页小步生成，定位"够用即交付" |
| 2 | PDF 导出依赖真实浏览器 | Docker 内置 headless Chrome（现有 CDP 方案已验证）；纯 Canvas 渲染器列为远期 |
| 3 | 大 deck 生成延迟（几十页 × 逐页 LLM 调用） | 流式逐页事件 + 并行度控制 + 队列；先出大纲确认再生成页面（减少返工） |
| 4 | 生成一致性/可回归性 | 所有生成通道输出经同一校验器闸门；generator fixture 测试锁质量 |
| 5 | 会员/支付合规 | 支付后置，先配额计量；匿名体验优先 |
| 6 | 开源 vs SaaS 代码边界漂移 | 插件接口 + 商业适配器独立仓库；核心仓库 CI 强制依赖方向 |
| 7 | 零依赖原则与 server 依赖冲突 | 核心包零依赖；server 的 DB/Redis/S3 驱动为可选依赖惰性加载（`require` 不到则降级 disk/in-process） |
| 8 | 存量 V2 项目兼容 | PPTD v2 格式不变、writer 输出不变；`packages` 迁移不改行为（P0 全测试锁回归） |

---

## 12. 一句话总结

**V3 = 把"AI 生成能力"固化为可插拔的生成引擎（LLM 直出 YAML），把"引擎代码"从编辑器 UI 中抽出来固化为零依赖的独立包，再用一套 API 契约把两者拼成"本地 / 自托管 / SaaS"三种形态——PPTD 是唯一契约，校验器是质量闸门，注册表 + 插件接口是扩展性与商业化边界。**
