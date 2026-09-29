// ============================================================================
// components/field.js — Field 原语（沿用 interaction/fields.js 的 5 种 kind）
// ----------------------------------------------------------------------------
// 架构保留：字段声明（types/*.js 的 props）→ interaction/fields.js 渲染，
// 本模块只是把「5 种 kind」的入口集中成原语层门面，供 components/* 与面板共用。
//   num / text / textarea / select / color / checks / button / hint
// U1 只统一入口与令牌，不改字段声明协议（U2 做分区折叠与「混合」占位）。
// ============================================================================

export {
  renderGroup,
  fieldHandlers,
  themeSwatches,
} from "../interaction/fields.js";

export {
  field,
  cell,
  textInput,
  numInput,
  colorInput,
  colorField,
  selectInput,
  checkbox,
} from "../ui.js";

/** 分组（可折叠 Section 的简化形态，见 components/section.js）。 */
export { group } from "../ui.js";
