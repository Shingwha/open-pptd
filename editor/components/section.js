// ============================================================================
// components/section.js — Section 原语（可折叠分组：标题 + 重置）
// ----------------------------------------------------------------------------
// 两种实现：
//   section()        div 版（复用 .prop-group，折叠态 .collapsed）——属性面板用
//   detailsSection() 原生 <details> 版（复用 .sec 样式）——设计稿 §02 样机形态
// 二者都给「标题 + 内容 + 可选重置按钮」。
// ============================================================================

/** div 版可折叠分组（.prop-group）。 */
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

/** 原生 <details> 版分组（.sec 样式，设计稿样机形态）。 */
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
