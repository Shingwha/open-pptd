// ============================================================================
// components/index.js — 组件原语层 barrel
// ----------------------------------------------------------------------------
// 原生 DOM 原语函数（不引 React、不引打包器），样式集中在
// editor/styles/primitives.css。U1 建立原语层与统一入口；各调用点按 U2 逐步迁移。
// ============================================================================

export { button, iconButton, buttonRow, btnClass } from "./button.js";
export { menu, menuItem, menuSeparator, menuLabel, openMenuAt, closePopupMenu } from "./menu.js";
export { section, detailsSection } from "./section.js";
export { panel, floatingPanel } from "./panel.js";
export { showDialog, closeAllDialogs } from "./dialog.js";
export { attachPopover, popover } from "./popover.js";
export { attachTooltip } from "./tooltip.js";
export { bindExcelDragSelect, bindGridKeyboard } from "./datagrid.js";
export { toolbar, toolbarGroup, divider } from "./toolbar.js";
export {
  field,
  cell,
  textInput,
  numInput,
  colorInput,
  colorField,
  selectInput,
  checkbox,
  group,
  renderGroup,
  fieldHandlers,
  themeSwatches,
} from "./field.js";
