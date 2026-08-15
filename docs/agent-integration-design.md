# open-pptd 编辑器 Agent 分栏集成设计方案

> 状态：方案草案 ｜ 日期：2026-08 ｜ 范围：编辑器内嵌 Agent 分栏 + 独立 Agent 服务契约（私有化部署优先）
> 前置阅读：`docs/v3-architecture.md`（V3 整体架构，本文是其 §4.2 "agent 通道"预留的提前落地）、`references/pptd.md`（格式契约）

---

## 0. 定位与边界

### 0.1 两个场景分开

- **对话生成页**（V3 §6.1）：从无到有生成整个 deck，走 generator 完整流水线（intent→outline→design→compose）。
- **编辑器 Agent 分栏**（本文）：对**当前打开的项目**做对话式增量编辑——"把这一页标题改成……"、"给第 3 页加个柱状图"、"整体换商务蓝配色"、"这页太挤了帮我重排"。

关键推论：编辑器 Agent 操作的是**编辑器内存中的模型**（`editor/app/state.js` + ops），不是磁盘上的 YAML 文件。项目状态的唯一副本在浏览器。

### 0.2 核心决策（讨论结论）

1. **Agent loop 拆为独立服务**：Agent 服务是纯粹的"决策大脑"——处理对话历史 + 工具定义 + 工具结果，输出文本与 tool_call。**不碰项目存储、不内置 PPT 领域知识**。
2. **工具执行留在浏览器**：tool_call 由编辑器前端执行（走现有 `editor/app/api.js` + ops），undo/redo、实时预览、保存流程天然集成，用户可随时手动接管。
3. **契约化解耦**：编辑器只依赖一套 session/SSE 契约；Agent 服务可自研、可接现成框架（LangGraph / Dify / 商业 agent API），只要契约不变，编辑器无感。
4. **open-pptd server 做可选代理**：浏览器单入口，认证/配额/能力探测统一收口；私有化部署中 Agent 服务为纯内网组件。

### 0.3 为什么不走"服务端执行工具"

服务端执行工具（Agent 服务直接读写项目存储）要求项目状态在服务端，而现状架构是"编辑器内存模型 + 手动保存落盘"（`app/project/saver.js` → `/api/save`）。走那条路等于把编辑器改造成实时同步/协同架构，工程量是另一个数量级，且与"文件即项目"的核心资产冲突。**不采纳**。

---

## 1. 总体结构

```
┌────────────────────────────────────────────────────────────┐
│ 浏览器                                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 编辑器                                                │  │
│  │  ┌────────────┐  ┌────────────────────────────────┐  │  │
│  │  │ 画布/顶栏…  │  │ 右侧抽屉 tab: [属性] [Agent]    │  │  │
│  │  └────────────┘  │  editor/agent/                  │  │  │
│  │                  │   panel.js    对话 UI（流式渲染）│  │  │
│  │                  │   client.js   契约客户端(SSE)   │  │  │
│  │                  │   loop.js     tool_call 接力    │  │  │
│  │                  │   tools.js    工具执行 → ops    │  │  │
│  │                  │   context.js  页上下文采集      │  │  │
│  │                  └────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────┬────────────────────────────────────┘
                        │ 同一 origin
┌───────────────────────▼────────────────────────────────────┐
│ open-pptd server（packages/server，单入口）                 │
│   GET  /api/capabilities     能力探测（+agent 字段）        │
│   /api/agent/*               可选代理 → Agent 服务          │
│   认证 / 计量 / 配额（既有插件体系，agent.chat 为新计量点）  │
└───────────────────────┬────────────────────────────────────┘
                        │ 内网
        ┌───────────────▼──────────────┐      ┌──────────────┐
        │ Agent 服务（独立部署）        │ ───→ │ LLM          │
        │ 会话状态 / loop / prompt      │      │ openai-compat│
        │ 契约实现 /v1/agent/*          │      │ / ollama     │
        └──────────────────────────────┘      └──────────────┘
```

依赖方向：编辑器 → 契约 → Agent 服务。Agent 服务对 open-pptd 零依赖（通用 agent 服务，可被其他产品复用）。

---

## 2. Agent 服务契约（`/v1/agent/*`）

### 2.1 会话模型

- 会话状态（对话历史、多轮上下文）**留在 Agent 服务**，前端只持有 `sessionId`。历史可落库、可审计、可限流。
- 领域上下文（PPTD 格式说明、当前页 YAML）由前端随会话创建/消息发送时注入——**领域知识留在 open-pptd 侧，Agent 服务保持通用**。
- 会话有 TTL（建议 30min 空闲过期），前端断线可用 sessionId 重连续传。

### 2.2 接口

```
POST /v1/agent/sessions
  body: {
    tools: [{ name, description, schema }],   // 工具定义由前端声明（§3.2）
    context: {                                 // 领域上下文（open-pptd 侧组装）
      format_doc,                              // pptd.md 格式说明（或精简版）
      manifest,                                // 当前项目 manifest YAML
      current_page: { rel, yaml }              // 当前页 YAML
    },
    system?                                    // 可选：覆盖系统 prompt
  }
  → { session_id, expires_at }

POST /v1/agent/sessions/:id/messages           (SSE 流式)
  body: {
    message: "把标题改成……",
    context_patch?                             // 可选：重发最新 current_page.yaml
  }                                            // （用户手动编辑后同步最新状态）
  → event-stream:
      { type: "text_delta", text }             // 对话文本增量，边出边渲染
      { type: "tool_call", id, name, args }    // 请求前端执行工具（一条流可多个）
      { type: "usage", tokens }                // 可选：计量回显
      { type: "done" } | { type: "error", code, message }

POST /v1/agent/sessions/:id/tool-results
  body: { results: [{ tool_call_id, result | error }] }
  → 同 messages 的 SSE 事件流（loop 继续，可能产生新 tool_call 或文本回复）

GET  /v1/agent/sessions/:id                    会话快照（历史/状态，调试用）
DELETE /v1/agent/sessions/:id                  会话销毁
```

### 2.3 设计要点

- **批量工具调用**：一次响应可返回多个 `tool_call`，前端批量执行、批量回传——避免"给 10 页换配色"产生 10 次网络往返。
- **上下文同步从简**：不做增量同步协议。用户手动编辑后，前端下次发消息时经 `context_patch` 捎上当前页最新 YAML（PPTD YAML 体量小，全量重发成本可忽略）。
- **流式协议用 SSE**：与现有 `/events` 一致；POST 流式用 `fetch + ReadableStream`（浏览器原生，零依赖）。
- **错误语义**：`error.code` 区分 `llm_unavailable / quota_exceeded / invalid_tool_result / session_expired`，前端据此提示（如 session 过期自动重建会话并带上历史摘要）。

---

## 3. 前端集成（编辑器侧）

### 3.1 分栏 UI：右侧抽屉 tab 化

当前布局（`editor/index.html`）：顶栏 / 画布 / 右侧属性抽屉（`#inspector`）/ 底部缩略条。

- 右侧抽屉改为 tab 结构：**`属性 | Agent`**，复用现有 inspector 展开/收起机制（`btn-inspector-toggle`、窄屏遮罩 `inspector-mask`）——布局改动最小。
- 顶栏加 Agent 入口按钮；`capabilities.agent.available === false` 时隐藏（沿用能力探测降级原则，GitHub Pages 静态部署不受影响）。
- 对话 UI：流式渲染文本；tool_call 执行过程显示为操作卡片（"正在修改第 3 页…"），可中途停止。

### 3.2 工具协议：YAML 直出为主 + 少量语义工具

| 层 | 方式 | 说明 |
|---|---|---|
| 页面级修改 | **整页 YAML 直出** | Agent 产出整页 `.page` YAML → 前端 js-yaml 解析 + 校验 → 整体替换当前页。与 V3 生成协议同构，复用 `references/pptd.md` 作 prompt 格式说明；校验器（V3 §3.2）落地后直接复用 |
| 全局操作 | **语义工具**（5~8 个） | `switch_page(rel)`、`add_page(after)`、`delete_page(rel)`、`reorder_pages(order)`、`set_theme(patch)`、`replace_page(yaml)`、`get_page(rel)` |

工具数量刻意收敛，降低 LLM 调错率与维护成本。"整页替换"天然支持 Ctrl+Z 整页回滚（`ops.beginChange/endChange` 包裹，接入既有 undo 栈 `interaction/history.js`）。

### 3.3 模块划分（`editor/agent/`，不侵入现有模块）

- `client.js`：契约客户端（sessions/messages/tool-results，SSE 解析）。**只依赖契约，可独立测试**。
- `loop.js`：agent loop 接力——收到 tool_call → 调 tools 执行 → 回传结果 → 直至 `done`。
- `tools.js`：工具实现，经 `createEditorApi`（`app/api.js`）操作模型；由 `main.js` 装配时注入 `api/state`，与画布控制器解耦。
- `context.js`：采集 manifest + 当前页 YAML + 格式说明，组装 `context` / `context_patch`。
- `panel.js`：对话 UI（消息列表、输入框、操作卡片、停止按钮）。

### 3.4 校验与兜底

- Agent 直出的 YAML 先过 js-yaml 解析（错误带行号，现状 `_parseErrorLine` 已有此机制），解析失败把错误回传为 tool_result error，让 Agent 自修复（对齐 V3 修复循环思路）。
- 页替换前做 schema/边界检查（V3 校验器落地前先用现有 normalize 逻辑兜底），校验不过不落画布。
- 所有 Agent 修改包裹在一次 undo 单元内，用户可一键回滚整轮操作。

---

## 4. open-pptd server 侧

### 4.1 能力探测扩展

```json
GET /api/capabilities
{
  "save": true, "events": true,
  "agent": { "available": true, "mode": "proxy", "provider": "remote" }
}
```

- `mode: "proxy"`：前端走同源 `/api/agent/*`（推荐，默认）。
- `mode: "direct"`：capabilities 返回 Agent 服务外网地址，前端直连（适用于 Agent 服务已有独立网关/认证的场景）。

### 4.2 代理层（可选但默认）

`/api/agent/*` 原样转发到配置的 Agent 服务地址（含 SSE 流透传）。价值：

- 浏览器单 origin，免 CORS；
- 私有化交付时 Agent 服务不暴露端口，纯内网组件；
- 认证 / 计量 / 配额在 server 统一收口——`agent.chat` 作为新计量点接入 V3 §8 的计量体系（每次 messages 调用计数，配额策略配置化）。

配置（env / 配置文件，对齐 V3 "配置驱动"）：

```
AGENT_SERVICE_URL=http://agent:9200    # 空 = agent 不可用，capabilities 返回 available:false
AGENT_AUTH_TOKEN=...                   # server → agent 服务间认证（内网可选）
```

### 4.3 与 V3 架构的关系

V3 §1.3 扩展表新增一行：

| 扩展点 | 机制 | 内置实现 | 扩展方式 |
|---|---|---|---|
| Agent 通道 | `AgentProvider` 注册表 | `remote`（本文契约）/ `echo`（联调桩，无 LLM 的固定回复） | 新实现接入自研/第三方 agent |

开源默认提供 `echo` 桩实现用于前端联调（零配置跑通 UI），生产私有化部署注入 `remote` 接自有 Agent 服务——对齐 V3 "插件接口先行、开源默认 noop" 原则。

---

## 5. 部署形态（私有化优先）

```
deploy/
  docker-compose.yml
    services:
      web+server:   open-pptd（静态前端 + API + /api/agent 代理）
      agent:        Agent 服务（用户自研/自带）      # profile: agent
      ollama:       本地 LLM（纯内网离线场景）        # profile: offline
```

- LLM key 只存在于 Agent 服务侧 env，前端与 open-pptd server 均不接触。
- 纯内网场景：Agent 服务接 ollama，全链路无外网依赖。
- 认证：内网部署 `AuthProvider=none` 够用；对外开放时接 session/OAuth 插件，agent 计量点随配额档生效。

---

## 6. 分阶段落地路线

| 阶段 | 内容 | 验收 | 依赖 |
|---|---|---|---|
| **A1 契约冻结 + echo 桩** | 契约文档（§2）定稿；server 实现 `/api/agent/*` 代理 + echo 桩 + capabilities | 无 LLM 环境下契约测试通过 | — |
| **A2 前端分栏骨架** | inspector tab 化 + 对话 UI（流式渲染）+ client.js | 对着 echo 桩跑通收发 | A1 |
| **A3 工具层** | tools.js（YAML 直出 + 语义工具）+ loop.js 接力 + undo 集成 | 模拟 tool_call 改画布、可回滚 | A2 |
| **A4 上下文与 prompt** | context.js（manifest + 当前页 + 格式说明注入）；接真实 Agent 服务联调 | 自然语言改当前页端到端可用 | A3 |
| **A5 私有化打磨** | 计量点 / 配额 / 断线重连 / 批量 tool_call / docker-compose 集成 | 私有化环境全流程验收 | A4 |

A1–A3 不依赖真实 Agent 服务（echo 桩 + 模拟 tool_call），可与 Agent 服务开发并行。

---

## 7. 风险与待决策

| # | 风险/问题 | 对策/建议 |
|---|---|---|
| 1 | LLM 直出整页 YAML 出错（缩进/富文本/坐标） | js-yaml 行号错误回传自修复 + 校验闸门 + 整页 undo 兜底；V3 校验器落地后升级为自动修复循环 |
| 2 | 上下文过期（用户手动编辑 vs Agent 认知） | `context_patch` 每次发消息捎最新页 YAML；不做增量同步 |
| 3 | 跨进程接力的延迟（tool_call 往返） | 批量 tool_call 契约；单页修改通常 1~2 轮工具调用，可接受 |
| 4 | 会话状态泄漏（多用户私有化） | 会话按用户隔离（认证启用时）；TTL + 主动销毁 |
| 5 | 契约演进破坏兼容 | 契约版本号（`/v1/`）；契约测试锁定（server 侧 fixture） |
| 6 | Agent 服务选型未定 | 契约为准——自研实现契约，或适配层桥接第三方框架/MCP；编辑器不感知 |

**待决策**：

1. Agent 服务是否需要"脱离编辑器的无头模式"（批量生成/定时任务）？若需要，契约需增加服务端直连项目存储的另一套模式（本文不覆盖，另立文档）。
2. Agent 服务实现路线：自研（轻量 loop + openai-compatible provider）vs 接入现成框架（LangGraph / Dify / MCP 桥接）。建议先自研最小实现锁定契约，再评估替换。

---

## 8. 一句话总结

**Agent 分栏 = 编辑器右侧新增的对话面板，通过一套 session/SSE 契约连接独立的 Agent 服务（纯大脑、无项目状态）；工具在浏览器内执行（整页 YAML 直出 + 少量语义工具），open-pptd server 做代理与计量收口——领域知识留在 open-pptd 侧，Agent 服务保持通用可替换，私有化部署只多一个内网容器。**
