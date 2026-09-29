// ============================================================================
// components/panel.js — Panel 原语（侧栏 / 面板容器）
// ----------------------------------------------------------------------------
// 侧栏（aside.inspector）与浮层面板的容器外壳。U1 只提供构造与内容装配；
// U2 的信息架构（分区折叠 / 按类型过滤）在此之上展开。
// ============================================================================

/** 侧栏面板容器（.inspector 结构：头部 + 内容区）。 */
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

/** 通用浮层容器（.file-menu / .theme-panel 同款外壳）。 */
export function floatingPanel(className, content = null) {
  const el = document.createElement("div");
  el.className = className;
  if (content) el.appendChild(content);
  return el;
}
