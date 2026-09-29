// ============================================================================
// editor/dialogs.js — 宿主可覆盖的对话框接口（契约附件；见 spec 02 T6）
// ----------------------------------------------------------------------------
// editor/ 内的"宿主敌意调用"（原生 alert/confirm）统一收敛到这里：
//   dialogs.alert(msg)           提示
//   dialogs.confirm(msg)         确认 → boolean 或 Promise<boolean>（调用方 await）
// 默认实现包裹原生 window.alert / window.confirm；createEditor 的 options.dialogs
// 可整体覆盖（DSH 等宿主用自绘弹窗替换，避免 iframe 需要 allow-modals 且观感脱节）。
//
// 覆盖是从挂载那一刻生效的进程级设置（编辑器单实例会话内稳定）；
// createEditor destroy 时经 resetDialogs() 还原默认实现。
// ============================================================================

/** 默认实现：原生弹窗（唯一允许出现 window.alert/confirm 的地方）。 */
const nativeDialogs = {
  alert(msg) {
    window.alert(msg);
  },
  confirm(msg) {
    return window.confirm(msg);
  },
};

let current = null;

/** 覆盖全局对话框实现（传 null/undefined 还原默认）。 */
export function configureDialogs(impl) {
  current = impl || null;
}

/** 还原默认实现（destroy 用）。 */
export function resetDialogs() {
  current = null;
}

const active = () => current || nativeDialogs;

/** 对话框门面：调用点统一经它，不直接触碰 window.alert/confirm。 */
export const dialogs = {
  alert(msg) {
    return active().alert(msg);
  },
  confirm(msg) {
    return active().confirm(msg);
  },
};

/** 默认实现导出（供测试/宿主包装原生行为）。 */
export const defaultDialogs = nativeDialogs;
