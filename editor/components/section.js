// ============================================================================
// components/section.js — Section primitive (collapsible group: title + reset)
// ----------------------------------------------------------------------------
// Two implementations:
//   section()        div form (reuses .prop-group, collapsed state .collapsed) — used by the property panel
//   detailsSection() native <details> form (reuses .sec styles) — design §02 mockup form
// Both provide "title + content + optional reset button".
// ============================================================================

/** div-form collapsible group (.prop-group). */
export function section(title, { collapsed = false, onReset = null } = {}) {
  const g = document.createElement("div");
  g.className = "prop-group" + (collapsed ? " collapsed" : "");
  const head = document.createElement("div");
  head.className = "prop-group-title";
  head.textContent = title;
  head.title = "点击折叠/展开";
  head.addEventListener("click", () => g.classList.toggle("collapsed"));
  if (onReset) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "icon-btn";
    reset.title = "重置";
    reset.textContent = "↺";
    reset.addEventListener("click", (e) => {
      e.stopPropagation();
      onReset();
    });
    head.appendChild(reset);
  }
  g.appendChild(head);
  return g;
}

/** Native <details> group (.sec styles, design mockup form). */
export function detailsSection(title, { open = true } = {}) {
  const d = document.createElement("details");
  d.className = "sec";
  if (open) d.open = true;
  const s = document.createElement("summary");
  s.textContent = title;
  d.appendChild(s);
  const body = document.createElement("div");
  body.className = "body";
  d.appendChild(body);
  d.body = body;
  return d;
}
