// ============================================================================
// editor/dialogs/table-editor.js — 表格网格编辑器
// ============================================================================

import { showDialog, buildCellInput, button } from "./base.js";

export function openTableEditor(el, { onChange }) {
  const container = document.createElement("div");
  container.className = "chart-editor";
  const grid = document.createElement("div");
  grid.className = "table-wrap";
  container.appendChild(grid);

  function renderGrid() {
    grid.innerHTML = "";
    const rows = (el.rows ||= []);
    if (!rows.length) rows.push([{ text: "" }]);

    const table = document.createElement("table");
    table.className = "data-table";
    const tbody = document.createElement("tbody");
    rows.forEach((row, r) => {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td");
      td0.className = "row-del";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "row-del-btn";
      delBtn.textContent = "✕";
      delBtn.title = "删除行";
      delBtn.onclick = () => {
        rows.splice(r, 1);
        syncDims(el);
        renderGrid();
        onChange();
      };
      td0.appendChild(delBtn);
      tr.appendChild(td0);
      row.forEach((cell, c) => {
        const td = document.createElement("td");
        td.appendChild(
          buildCellInput(cell?.text ?? "", "", () => {
            row[c].text = td.querySelector("input").value;
            onChange();
          })
        );
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    grid.appendChild(table);

    const ops = document.createElement("div");
    ops.className = "grid-ops";
    ops.append(
      button("＋ 加行", () => {
        rows.push(rows[0].map(() => ({ text: "" })));
        syncDims(el);
        renderGrid();
        onChange();
      }),
      button("＋ 加列", () => {
        for (const row of rows) row.push({ text: "" });
        syncDims(el);
        renderGrid();
        onChange();
      })
    );
    grid.appendChild(ops);
  }

  function syncDims(el) {
    const rows = el.rows || [];
    const cols = rows[0]?.length || 1;
    if (!Array.isArray(el.columnWidths) || el.columnWidths.length !== cols) {
      el.columnWidths = Array.from({ length: cols }, () => 1 / cols);
    }
    if (!Array.isArray(el.rowHeights) || el.rowHeights.length !== rows.length) {
      el.rowHeights = Array.from({ length: rows.length }, () => 1 / rows.length);
    }
  }

  renderGrid();
  showDialog("表格编辑", container);
}

