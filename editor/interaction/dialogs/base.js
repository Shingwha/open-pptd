// ============================================================================
// interaction/dialogs/base.js — dialog building blocks (cell inputs / buttons)
// ----------------------------------------------------------------------------
// Shared by the chart and table editors. The modal itself is no longer here: 3.0
// dialogs are per instance (editor/dialogs.js createDialogs), and the content
// editors receive that service through their open options.
// ============================================================================

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
