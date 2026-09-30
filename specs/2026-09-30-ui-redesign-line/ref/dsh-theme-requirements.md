# ref · DSH 主题与结构适配要求（摘自《open-pptd × DSH 深度集成方案.md》v1.0）

> 本文件是 spec 组内权威参考的唯一副本，agent 只信这里。原方案 §6 的 B2 信息架构与锐利圆角（2/4/6）**已被用户否决**（见 00-overview.md D1/D6），本文档仅保留「适配面」要求。

## 1. 主题机制（方案 §1.6 / §5.5 / 契约 3）

- DSH 设计令牌前缀 `--dsw-`，语义别名约 110 个（`--dsw-alias-*`）；`--dsh-*` 是框架力学变量，不是设计令牌。
- 暗色标记：`body[data-ds-dark-theme]`；令牌值由样式表切换，插件「读令牌、不管主题状态」。
- **本仓对应面（契约 3，已存在，冻结）**：
  - `export const TOKENS: string[]` — 引擎支持的令牌名
  - `export function defaultTokens(mode)` — 内置 light/dark 两套（`editor/theme.js` 用探测元素读 tokens.css，无颜色字面量）
  - `export function applyThemeTokens(rootEl, { tokens, mode })` — 设置 `data-pptd-theme` + 内联令牌覆盖，返回幂等还原函数
- DSH 侧将来做 `--dsw-alias-*` → 本仓 TOKENS 的映射后注入；**本仓只需保证：语义令牌齐全、命名稳定、深浅两板完整、画廊编辑器同源**。

## 2. 深浅色（方案 §6.11 的可执行部分）

- 组件永远不知道 light/dark——只有 `[data-pptd-theme="dark"]` 块知道。
- 两层主题：自带默认板（独立 serve / Pages 自足）+ 宿主覆盖（applyThemeTokens）。
- 三态：浅 / 深 / 跟随系统（`prefers-color-scheme`）。
- `?shot=1` 截图模式单列，不在本次范围。

## 3. 挂载结构（方案 §1.8，已完成事实，本次只核对不重构）

- DSH 用**同源 iframe** 挂 `/pptd/**`；桌面壳 `dsh-app://app` 与浏览器两种环境都同源。
- URL 必须**文档相对**（适配仓的事）；open-pptd 资源必须在 `/pptd/` 下（`/assets/**` 被 DSH dist 抢占，本仓 ROOT 天然落在 /pptd/ 下）。
- 编辑器已被 `createEditor` 实例化（H1/H2/H3 已解），本组不动。

## 4. 本次重构必须守住的适配点

1. `editor/theme.js` 三个导出签名零变化。
2. tokens.css 语义令牌不重命名、不删除；只可加。
3. 画廊与编辑器同一套令牌与 `data-pptd-theme` 机制（D7）。
4. 颜色/阴影字面量只存在于 tokens.css（present.css 投影面豁免）——W5 将其固化为回归门禁。
5. 深色板完整可用：编辑器与画廊的所有 chrome 在 dark 下不露浅色破绽（W5 走查）。
