// ============================================================================
// model/index.js — packages/model 包级 barrel（契约 4 入口 open-pptd/model）
// ----------------------------------------------------------------------------
// 纯再导出，零逻辑：把 300+ 深路径收敛为稳定入口（见 docs/embedding.md）。
// 导出面以 docs/specs/ref/integration-plan.md 附录 D.1 为准，逐一核对源文件真实
// 导出名后写下（PRESET_SHAPES 来自 preset-geometry.data.js，ELEMENT_TYPES 来自
// style-spec.js —— 二者均不在 model.js，D.1 只列名字未列文件）。
//
// 浏览器 + Node 双端：本文件与传递闭包内不得出现 node:* / fs / window. / document.
// （字体、图标注册表的 Node 分支走 options.fs 依赖注入，见 dep-graph 既有四条）。
// ============================================================================

// ---- 解析与序列化（pptd-io.js）----
export { parseDeck, serializeDeck } from "./pptd-io.js";

// ---- 数据模型（model.js）----
export {
  createDeck,
  createPage,
  nextElementId,
  deckSize,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  PAGE_TYPES,
  SUPPORTED_SHAPES,
} from "./model.js";

// ---- 元素类型注册表（registry.js / style-spec.js）----
export { registerType, getType, allTypes } from "./registry.js";
export { ELEMENT_TYPES } from "./style-spec.js";

// ---- 主题与配色（theme.js，DEFAULT_THEME/THEME_PALETTES 由 theme.js 再导出）----
export {
  resolveTheme,
  resolveColor,
  resolveFont,
  DEFAULT_THEME,
  DEFAULT_FONT,
  THEME_PALETTES,
  mergePaletteColors,
} from "./theme.js";

// ---- 校验（validate.js）----
export { validateDeck, registerRule } from "./validate.js";

// ---- 遍历（walk.js）----
export { walkElements, collectImageSrcs } from "./walk.js";

// ---- 预置形状（preset-geometry.js / preset-geometry.data.js）----
export { shapePaths, shapeMenuIcon } from "./preset-geometry.js";
export { PRESET_SHAPES } from "./preset-geometry.data.js";

// ---- 图表命名空间（chart.js 全部导出 + chart/option 构建器）----
// chart.js 只再导出元数据/解析/布局工具；buildChartOption 在 chart/option/index.js，
// 二者合并为单一 chart 命名空间（D.1 要求 chart 内含 buildChartOption）。
import * as chartCore from "./chart.js";
import * as chartOption from "./chart/option/index.js";
export const chart = { ...chartCore, ...chartOption };

// ---- 图标命名空间（icon-fa.js 全部公开导出）----
export * as icons from "./icon-fa.js";

// ---- 字体注册表命名空间（font-registry.js 全部公开导出）----
export * as fonts from "./font-registry.js";

// ---- 字节工具命名空间（bytes.js 全部公开导出）----
export * as bytes from "./bytes.js";
