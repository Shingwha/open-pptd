// ============================================================================
// editor/dialogs.js — host-overridable dialog interface (contract attachment)
// ----------------------------------------------------------------------------
// The "host-hostile calls" inside editor/ (native alert/confirm) are funneled
// through here:
//   dialogs.alert(msg)            notice
//   dialogs.confirm(msg)          confirm → boolean or Promise<boolean> (callers await)
// The default implementation wraps native window.alert / window.confirm;
// createEditor's options.dialogs can override it wholesale (hosts such as DSH
// swap in self-drawn dialogs, avoiding iframes needing allow-modals and a visual
// mismatch).
//
// The override is a process-level setting effective from the moment of mounting
// (stable across an editor's single-instance session); createEditor restore the
// default via resetDialogs() on destroy.
// ============================================================================

/** Default implementation: native dialogs (the only place window.alert/confirm is allowed). */
const nativeDialogs = {
  alert(msg) {
    window.alert(msg);
  },
  confirm(msg) {
    return window.confirm(msg);
  },
};

let current = null;

/** Override the global dialog implementation (pass null/undefined to restore the default). */
export function configureDialogs(impl) {
  current = impl || null;
}

/** Restore the default implementation (used by destroy). */
export function resetDialogs() {
  current = null;
}

const active = () => current || nativeDialogs;

/** Dialog facade: call sites go through this, never touching window.alert/confirm directly. */
export const dialogs = {
  alert(msg) {
    return active().alert(msg);
  },
  confirm(msg) {
    return active().confirm(msg);
  },
};

/** Default implementation export (for tests/hosts wrapping the native behavior). */
export const defaultDialogs = nativeDialogs;
