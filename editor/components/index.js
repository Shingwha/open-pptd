// ============================================================================
// components/index.js — component primitive layer barrel
// ----------------------------------------------------------------------------
// Native DOM primitive functions (no React, no bundler); styles are centralized in
// editor/styles/primitives.css. Call sites migrate over time.
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
