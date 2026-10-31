// ============================================================================
// editor/dialogs.js — host-overridable dialog service, one per instance
// ----------------------------------------------------------------------------
// The "host-hostile calls" inside editor/ (native alert/confirm) and every modal
// built by the content editors / Design panel go through this service:
//   dialogs.alert(msg)            notice
//   dialogs.confirm(msg)          confirm → boolean or Promise<boolean> (callers await)
//   dialogs.showDialog(...)       modal (title + body + footer), tracked per instance
//   dialogs.closeAll()            close every modal this instance opened (destroy)
//
// createDialogs(override) builds one instance-scoped service:
//   - override (createEditor options.dialogs) replaces native alert/confirm wholesale
//     (embedding hosts swap in self-drawn dialogs, avoiding iframes needing
//     allow-modals and a visual mismatch)
//   - the open-modal registry is per service, so destroying one editor never closes
//     another instance's modal
//   - defaultDialogs (native window.alert/confirm) is exported for hosts that want
//     to wrap the default behaviour
// ============================================================================

/** Default implementation: native dialogs (the only place window.alert/confirm is allowed). */
export const defaultDialogs = {
  alert(msg) {
    window.alert(msg);
  },
  confirm(msg) {
    return window.confirm(msg);
  },
};

/**
 * Build the dialog service of one preview/editor instance.
 * @param {{alert?: Function, confirm?: Function}|null} [override] host implementation
 * @returns {{alert, confirm, showDialog, closeAll, destroy, overlayCount}}
 */
export function createDialogs(override = null) {
  const impl = override || defaultDialogs;
  /** Overlays opened by this instance (closed together on destroy). */
  const openOverlays = new Set();

  /** Close and remove every open modal of this instance. */
  function closeAll() {
    for (const overlay of [...openOverlays]) overlay.remove();
    openOverlays.clear();
  }

  /** Generic modal: title + body + footer buttons (a single done button by default; overlay/✕ close).
   * actions: { doneText, onDone, buttons, panelClass, closeBtn, overlayClose, onClose }
   *   buttons      custom footer button group (replacing the default done button; close via the returned close())
   *   panelClass   extra panel class (e.g. restore-card fixed width)
   *   closeBtn     false = hide the header ✕ (shown by default)
   *   overlayClose false = clicking the overlay does not close (closes by default)
   *   onClose      called once whenever the dialog closes (done / ✕ / overlay), after the DOM is removed */
  function showDialog(title, buildBody, actions) {
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    const panel = document.createElement("div");
    panel.className = "dialog" + (actions?.panelClass ? ` ${actions.panelClass}` : "");
    const head = document.createElement("div");
    head.className = "dialog-head";
    head.innerHTML = `<strong>${title}</strong>`;
    const close = () => {
      if (!overlay.isConnected) return;
      overlay.remove();
      openOverlays.delete(overlay);
      try {
        actions?.onClose?.();
      } catch (err) {
        console.warn("[dialog] onClose 回调异常:", err?.message || err);
      }
    };
    if (actions?.closeBtn !== false) {
      const closeBtn = document.createElement("button");
      closeBtn.className = "btn btn-sm";
      closeBtn.textContent = "✕";
      closeBtn.onclick = close;
      head.appendChild(closeBtn);
    }
    const body = document.createElement("div");
    body.className = "dialog-body";
    body.appendChild(buildBody);
    const foot = document.createElement("div");
    foot.className = "dialog-foot";
    let doneBtn = null;
    if (actions?.buttons) {
      foot.append(...actions.buttons);
    } else {
      doneBtn = document.createElement("button");
      doneBtn.className = "btn btn-primary btn-sm";
      doneBtn.textContent = actions?.doneText || "完成";
      doneBtn.onclick = () => {
        actions?.onDone && actions.onDone();
        close();
      };
      foot.appendChild(doneBtn);
    }
    panel.append(head, body, foot);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    openOverlays.add(overlay);
    if (actions?.overlayClose !== false) {
      overlay.addEventListener("pointerdown", (e) => {
        if (e.target === overlay) close();
      });
    }
    return { overlay, body, close, doneBtn };
  }

  return {
    alert(msg) {
      return impl.alert(msg);
    },
    confirm(msg) {
      return impl.confirm(msg);
    },
    showDialog,
    closeAll,
    /** Number of modals this instance currently has open (tests / hosts). */
    overlayCount: () => openOverlays.size,
    destroy() {
      closeAll();
    },
  };
}
