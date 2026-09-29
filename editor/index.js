// ============================================================================
// editor/index.js — 编辑器包级 barrel（契约 4 入口 open-pptd/editor）
// ----------------------------------------------------------------------------
// 纯再导出，零逻辑：下游经此入口挂载/控制编辑器，不感知内部文件布局。
// createEditor 完整签名见 docs/embedding.md（契约 1/2/3）。
// 红线：本文件只面向浏览器（依赖 DOM），Node 侧消费方不得 import 本入口。
// ============================================================================

// ---- 可挂载编辑器（契约 1）----
export { createEditor } from "./editor.js";

// ---- 主题注入（契约 3）----
// 含三态主题模式（浅 / 深 / 跟随系统，B3）：宿主可用 bindThemeMode 自管，
// 也可继续经 applyThemeTokens 注入 mode 覆盖（注入优先于内置板）。
export {
  TOKENS,
  defaultTokens,
  applyThemeTokens,
  getThemeMode,
  setThemeMode,
  bindThemeMode,
  systemTheme,
  THEME_MODES,
  THEME_MODE_KEY,
} from "./theme.js";

// ---- 传输接缝（契约 2：ProjectSource 三实现 + 内存外观）----
export {
  httpSource,
  directoryHandleSource,
  memorySource,
  delegatingSource,
} from "./app/project/source.js";
