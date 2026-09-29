# Changelog

## 2.0.0（2026-09-29）

引擎接口化 + 渲染管线三段式重构 + 技能拆分。零 npm 依赖、零构建的纪律保持不变。

### 引擎接口化（契约 4，CONTRACT_VERSION = 2）

- 新增包级 barrel：`open-pptd/{model,renderer,writer,server,cli,editor,paths,config}` 与包根 `.`；`exports` map 与机器可读 `contract.json` 双口径，由契约测试（`tests/contract/public-api.mjs`）断言一致。
- editor 对 `packages/` 的 89 处深路径全部迁移到包级入口；dep-graph 新增规则：editor 禁止深路径、barrel 禁止 import editor。
- 旧深路径经 `./internal/*` 仍可达（2.x 兼容，3.0 移除）。

### 可挂载编辑器与传输接缝

- `createEditor(rootEl, options) → { ready, destroy, api, io, state, view }`：可挂载、可销毁（幂等）、`chrome` 三档（full/minimal/shot）、dialogs 可注入（12 处宿主敌意调用清零）。
- `ProjectSource` 传输契约 + `httpSource`/`directoryHandleSource`/`memorySource`/`delegatingSource` 四实现；`saver`/`live-reload` 不再硬编码 `/api/save`、`/events`。
- 主题注入：`applyThemeTokens`/`defaultTokens(light|dark)`，内置 dark 板 + 8 处硬编码色清零。

### 资源外置与 CLI 产品化

- `~/.open-pptd`（`OPEN_PPTD_HOME` 可覆盖）：读三级（env → home → 包内）、写一级；`registry.json` 永远只读包内；下载原子落地（tmp → rename）。
- 新命令：`doctor` / `paths` / `assets list|sync|clean` / `ensure`；`serve --detach --json --stop --open`（stdout 单行 JSON）；`export` 前置资源体检（`--offline`/`--strict`/`--json`，缺字体软降级不阻断）。
- 仓库根新增 `install.ps1` / `install.sh`（raw URL 一键安装，SHA256 校验、幂等、干跑模式）；pack-release 产五类发布资产 + SHA256SUMS。

### 技能拆分（breaking）

- `SKILL.md` + `references/` 迁出为独立纯文本技能仓 **open-pptd-skill**；本仓不再含内容面。
- 技能自检引导：`open-pptd doctor` → 缺则给一键安装命令；预览统一 `serve --detach --json`。

### 编辑器 UI（布局保持原版观感，能力增强）

- 选择模型集合化：多选 / 框选 / Shift 加选 / Ctrl 切换 / Ctrl+A / Esc 分层 / Ctrl+拖动复制；键位重映射（Shift→多选，Alt→微调/等比/复制拖动）。
- 对齐二义化（单选对页面、多选对选区）+ 分布 + 组合（group 类型）。
- 右键上下文菜单（三态）、缩略条升级（拖排序可撤销 / 页面多选 / 右键菜单）、内部剪贴板 Ctrl+C/V、`]`/`[` 置顶置底、层序方向修正。
- 深浅色三态（浅 / 深 / 跟随系统，入口在配色面板）；多选属性「混合」占位。
- 组件原语层（`editor/components/`）+ CSS 18→8 收敛（无加载顺序依赖）；令牌体系重建，**值保持原版观感**（圆角 6/8/12px、轻投影）。

### 渲染管线三段式（resolve → layout → paint）

- 新增 `packages/measure`（字体度量表驱动的纯函数排版度量，DOM 对拍 P95 误差 6%）与 `packages/layout`（LayoutTree：几何事实 + overflow/重叠检测）。
- `paintPage(layoutPage)` 消费 LayoutTree；测量写回删除（autoGrowTexts 双拷贝清零）；`validate` 越界检查改读 overflow 事实（启发式删除）。
- writer 表格行高/行距与 measure 单源对齐；**行为变更**：文本不再因框小被裁剪（配 `check` 几何告警）、表格行高从 min 语义变精确值。
- headless 就绪协议改 `Runtime.addBinding`（删除 title 轮询）；图片导出统一：capture 优先 + foreignObject 逐元素体检回退（消灭静默白图）。
- 编辑器几何单源：选中框/框选命中读 LayoutTree（文本取 declared、表格取 frame），domMeasure 精修接线，dirty 判定不再被测量污染。
- 黄金基线（24 项目 / 156 页）+ 白名单机制守门。

### 兼容与升级

- 深路径消费者请迁移到包级入口；内容面请改用 open-pptd-skill 仓。
- 旧仓库布局零迁移可用（包内资源只读回退）；`fonts download` / `icons download` 保留为兼容别名。
