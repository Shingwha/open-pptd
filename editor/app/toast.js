// ============================================================================
// app/toast.js — 统一提示系统（所有操作反馈走这里）
// ----------------------------------------------------------------------------
// 用法：showToast("已保存", "success")  /  showToast("导出失败", "danger")  /  showToast("已加载", "info")
// 右上角浮层堆叠，自动消失；成功/失败/信息三态用左侧色条区分。
// 常驻信息（如实时刷新状态）不进 toast，由顶栏指示器承担（live-reload.js）。
// ============================================================================

let container = null;

export function showToast(text, type = "info", duration = 3000) {
  if (typeof document === "undefined") return; // Node（测试/CLI）安全
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = text;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 220);
  }, duration);
}
