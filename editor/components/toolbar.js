// ============================================================================
// components/toolbar.js — Toolbar primitive (grouping + overflow collapse)
// ----------------------------------------------------------------------------
// Group containers for the topbar/toolbars: dividers + groups + narrow-screen
// overflow (horizontal scroll, owned by the .topbar breakpoint rules in
// layout.css). Structural primitives only; the information architecture builds on
// them.
// ============================================================================

/** Toolbar group (.toolbar-group). */
export function toolbarGroup(children = [], { className = "toolbar-group" } = {}) {
  const g = document.createElement("div");
  g.className = className;
  for (const c of children) if (c) g.appendChild(c);
  return g;
}

/** Vertical divider (.topbar-divider). */
export function divider() {
  const s = document.createElement("span");
  s.className = "topbar-divider";
  return s;
}

/** Toolbar container (.topbar / a custom class). */
export function toolbar({ className = "topbar", children = [] } = {}) {
  const bar = document.createElement("div");
  bar.className = className;
  for (const c of children) if (c) bar.appendChild(c);
  return bar;
}
