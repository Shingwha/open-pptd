// ============================================================================
// components/panel.js — Panel primitive (sidebar / panel container)
// ----------------------------------------------------------------------------
// The container shell for the sidebar (aside.inspector) and floating panels. Just
// construction and content assembly here; the information architecture (section
// collapsing / per-type filtering) builds on top of it.
// ============================================================================

/** Sidebar panel container (.inspector structure: head + content area). */
export function panel({ className = "inspector", head = null, id = "" } = {}) {
  const aside = document.createElement("aside");
  aside.className = className;
  if (id) aside.id = id;
  if (head) {
    const h = document.createElement("div");
    h.className = "inspector-head";
    const row = document.createElement("div");
    row.className = "inspector-title-row";
    const badge = document.createElement("span");
    badge.className = "inspector-badge";
    badge.hidden = true;
    const title = document.createElement("span");
    title.textContent = head.title || "属性";
    row.append(badge, title);
    h.appendChild(row);
    aside.appendChild(h);
    aside.badge = badge;
    aside.titleEl = title;
  }
  const body = document.createElement("div");
  body.className = "panel-body";
  aside.appendChild(body);
  aside.body = body;
  return aside;
}

/** Generic floating panel container (same shell as .file-menu / .theme-panel). */
export function floatingPanel(className, content = null) {
  const el = document.createElement("div");
  el.className = className;
  if (content) el.appendChild(content);
  return el;
}
