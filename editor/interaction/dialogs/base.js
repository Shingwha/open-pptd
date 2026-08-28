// ============================================================================
// interaction/dialogs/base.js — 对话框基础设施（showDialog + 单元格/表单工具）
// ----------------------------------------------------------------------------
// 图表编辑器与表格编辑器共用；showDialog 是唯一弹窗入口。
// ============================================================================

/** 通用模态框：标题 + body + 底部按钮（默认单「完成」；点遮罩/✕ 关闭）。
 * actions: { doneText, onDone, buttons, panelClass, closeBtn, overlayClose }
 *   buttons      自定义底部按钮组（替代默认完成按钮，关闭走返回的 close()）
 *   panelClass   面板附加 class（如 restore-card 定宽）
 *   closeBtn     false = 不显示头部 ✕（默认显示）
 *   overlayClose false = 点遮罩不关闭（默认关闭） */
export function showDialog(title, buildBody, actions) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  const panel = document.createElement("div");
  panel.className = "dialog" + (actions?.panelClass ? ` ${actions.panelClass}` : "");
  const head = document.createElement("div");
  head.className = "dialog-head";
  head.innerHTML = `<strong>${title}</strong>`;
  const close = () => overlay.remove();
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
  if (actions?.overlayClose !== false) {
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) close();
    });
  }
  return { overlay, body, close, doneBtn };
}

// ----------------------------------------------------------------------------
// 单元格交互（Enter 向下跳格 + 聚焦全选）
// ----------------------------------------------------------------------------
function wireCellNav(input) {
  input.addEventListener("focus", () => input.select());
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const td = input.closest("td");
    const tr = td?.closest("tr");
    if (!tr) return;
    const idx = Array.from(tr.children).indexOf(td);
    const nextTr = tr.nextElementSibling;
    if (nextTr) {
      const nextInput = nextTr.children[idx]?.querySelector("input");
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    } else {
      input.blur();
    }
  });
}

/** 单元格输入（Enter 跳格 + change 提交）。 */
export function buildCellInput(value, placeholder, onCommit) {
  const input = document.createElement("input");
  input.value = value ?? "";
  input.placeholder = placeholder || "";
  wireCellNav(input);
  input.addEventListener("change", onCommit);
  return input;
}

/** 小按钮。 */
export function button(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-sm";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
