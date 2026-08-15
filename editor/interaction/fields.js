// ============================================================================
// interaction/fields.js — 声明式字段渲染器（属性面板 / 表格样式面板共用）
// ----------------------------------------------------------------------------
// 布局规则唯一（与属性面板完全一致）：
//   num      双列紧凑格（label 上置），两两成行     {kind:"num", label, get, set, min?, max?, step?}
//   text     整行文本框                            {kind:"text", label, get, set, placeholder?}
//   textarea 整行多行文本                          {kind:"textarea", label, get, set, placeholder?}
//   select   整行下拉                              {kind:"select", label, options, get, set}
//   color    整行颜色（色块弹层 + 取色器 + hex）    {kind:"color", label, get, set}
//   checks   整行复选框组                          {kind:"checks", items:[{label, get, set}]}
//   button   整行按钮                              {kind:"button", label, onClick, className?}
//   hint     整行提示                              {kind:"hint", text}
//
// 控件工厂 h 由消费方提供（属性面板带提交事务；表格面板直接提交），
// 字段只声明"调什么"，交互事务由消费方决定。
// ============================================================================

import * as ui from "../ui.js";
import { resolveColor } from "../core/theme.js";

/** 主题语义色色板（供 colorField swatches 使用，属性面板/表格/图表共用）。 */
export function themeSwatches(theme) {
  const c = theme?.colors || {};
  const keys = ["primary", "accent", "text", "muted", "line", "success", "warning", "danger", "primaryDeep", "primarySoft", "primaryTint", "accent3"];
  return keys.map((k) => ({ key: `$${k}`, value: resolveColor(theme, c[k]) || "#cccccc" }));
}

/**
 * 声明式字段控件工厂（属性面板 / 表格样式面板 / 图表样式面板共用）。
 * @param {object} opts
 *  - theme: 主题对象或取主题函数（colorField 的 resolve/swatches 数据源）
 *  - wrap(fn): 可选提交包装——属性面板用它包事务+即时刷新，对话框直接传 fn
 *  - onFocus/onBlur: 可选事务钩子（属性面板的 beginChange/endChange）
 *  - extra: 附加助手（属性面板的 fontOptions/openEditor 等）
 */
export function fieldHandlers({ theme, wrap = (f) => f, onFocus, onBlur, extra = {} } = {}) {
  const themeOf = typeof theme === "function" ? theme : () => theme;
  return {
    textInput: (v, c, o = {}) => ui.textInput(v, wrap(c), { onFocus, onBlur, ...o }),
    numInput: (v, c, o = {}) => ui.numInput(v, wrap(c), { onFocus, onBlur, ...o }),
    colorField: (v, c, o = {}) =>
      ui.colorField(v, wrap(c), {
        resolve: (val) => resolveColor(themeOf(), val),
        swatches: themeSwatches(themeOf()),
        onFocus,
        onBlur,
        ...o,
      }),
    selectInput: (options, value, onCommit, o = {}) => ui.selectInput(options, value, wrap(onCommit), { onFocus, onBlur, ...o }),
    checkbox: (l, ch, c, o = {}) => ui.checkbox(l, ch, wrap(c), { onFocus, onBlur, ...o }),
    button: (label, onClick, o) => ui.button(label, onClick, { className: "btn btn-sm", ...o }),
    ...extra,
  };
}

/** 渲染一个分组（group 标题可折叠）。 */
export function renderGroup(group, h) {
  const g = ui.group(group.title || "");
  renderFields(g, group.fields || [], h);
  return g;
}

/** 渲染字段列表到容器（num 两两成行，其余整行）。 */
export function renderFields(g, fields, h) {
  let grid = null;
  const ensureGrid = () => {
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "prop-grid";
      g.appendChild(grid);
    }
    return grid;
  };

  for (const f of fields) {
    if (f.kind === "num") {
      ensureGrid().appendChild(ui.cell(f.label, h.numInput(f.get(), f.set, f)));
      if (grid.children.length === 2) grid = null; // 两两成行
    } else {
      grid = null;
      const node = renderFullField(f, h);
      if (node) g.appendChild(node);
    }
  }
}

/** 整行字段分派。 */
function renderFullField(f, h) {
  switch (f.kind) {
    case "text":
      return ui.field(f.label, h.textInput(f.get(), f.set, { placeholder: f.placeholder || "" }));
    case "textarea":
      return ui.field(f.label, h.textInput(f.get(), f.set, { rows: f.rows || 3, placeholder: f.placeholder || "" }));
    case "select":
      return ui.field(f.label, h.selectInput(f.options, f.get(), f.set));
    case "color":
      return ui.field(f.label, h.colorField(f.get(), f.set));
    case "checks": {
      const wrap = document.createElement("div");
      wrap.className = "prop-checks";
      for (const item of f.items) {
        wrap.appendChild(h.checkbox(item.label, item.get(), item.set));
      }
      return wrap;
    }
    case "button":
      return h.button(f.label, f.onClick, f.className ? { className: f.className } : {});
    case "hint": {
      const div = document.createElement("div");
      div.className = "prop-hint";
      div.textContent = f.text;
      return div;
    }
    default:
      return null;
  }
}
