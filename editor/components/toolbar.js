// ============================================================================
// components/toolbar.js — Toolbar 原语（分组 + 溢出折叠）
// ----------------------------------------------------------------------------
// 顶栏 / 工具栏的分组容器：分隔符 + 分组 + 窄屏溢出（横向滚动，由 layout.css
// 的 .topbar 断点规则承担）。U1 提供结构原语，U2 的信息架构在此之上收敛入口。
// ============================================================================

/** 工具栏分组（.toolbar-group）。 */
export function toolbarGroup(children = [], { className = "toolbar-group" } = {}) {
  const g = document.createElement("div");
  g.className = className;
  for (const c of children) if (c) g.appendChild(c);
  return g;
}

/** 竖线分隔符（.topbar-divider）。 */
export function divider() {
  const s = document.createElement("span");
  s.className = "topbar-divider";
  return s;
}

/** 工具栏容器（.topbar / 自定义类）。 */
export function toolbar({ className = "topbar", children = [] } = {}) {
  const bar = document.createElement("div");
  bar.className = className;
  for (const c of children) if (c) bar.appendChild(c);
  return bar;
}
