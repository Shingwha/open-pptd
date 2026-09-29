// ============================================================================
// interaction/dialogs/base.js — dialog infrastructure (showDialog + cell/form helpers)
// ----------------------------------------------------------------------------
// Shared by the chart and table editors; showDialog is the single modal entry point.
// ============================================================================

// Registry of open modals (closed together on destroy, avoiding leftover DOM)
const openOverlays = new Set();

/** Close and remove every open modal (used by createEditor's destroy). */
export function closeAllDialogs() {
  for (const overlay of [...openOverlays]) overlay.remove();
  openOverlays.clear();
}

/** Generic modal: title + body + footer buttons (a single done button by default; overlay/✕ close).
 * actions: { doneText, onDone, buttons, panelClass, closeBtn, overlayClose }
 *   buttons      custom footer button group (replacing the default done button; close via the returned close())
 *   panelClass   extra panel class (e.g. restore-card fixed width)
 *   closeBtn     false = hide the header ✕ (shown by default)
 *   overlayClose false = clicking the overlay does not close (closes by default) */
export function showDialog(title, buildBody, actions) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  const panel = document.createElement("div");
  panel.className = "dialog" + (actions?.panelClass ? ` ${actions.panelClass}` : "");
  const head = document.createElement("div");
  head.className = "dialog-head";
  head.innerHTML = `<strong>${title}</strong>`;
  const close = () => {
    overlay.remove();
    openOverlays.delete(overlay);
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

// ----------------------------------------------------------------------------
// Cell interaction (focus-select + Enter moves down one row)
// ----------------------------------------------------------------------------
function wireCellNav(input) {
  input.addEventListener("focus", () => input.select());
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const td = input.closest("td");
    const tr = td?.closest("tr");
    if (!tr) return;
    // Same column in the next row (the row header occupies column 0, so use the
    // td's position within the row); blur when there is no next row or the next
    // cell has no input (e.g. covered by a merge)
    const idx = Array.from(tr.children).indexOf(td);
    const nextInput = tr.nextElementSibling?.children?.[idx]?.querySelector("input");
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    } else {
      input.blur();
    }
  });
}

/** Cell input (Enter moves down + change commits). */
export function buildCellInput(value, placeholder, onCommit) {
  const input = document.createElement("input");
  input.value = value ?? "";
  input.placeholder = placeholder || "";
  wireCellNav(input);
  input.addEventListener("change", onCommit);
  return input;
}

/** Small button. */
export function button(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-sm";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
