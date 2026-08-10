// ============================================================================
// editor/dialogs/table-editor.js — 表格网格编辑器（官方 Cell 模型）
// ----------------------------------------------------------------------------
// 能力：
//   - 网格编辑（合并格 rowSpan/colSpan 展开渲染，被覆盖位灰显不可编辑）
//   - 单元格样式：B/I/颜色/字号/填充/水平垂直对齐/textStyle 引用
//   - 合并（区域选择：单击起点 → Shift+单击终点）/ 拆分
//   - 行高/列宽比例编辑（官方约束：各项和 = 1）
// 数据模型：官方 Cell 对象（{text, color, bold, fill, align, rowSpan, colSpan…}），
// 裸值（string/number）在读取时规范化为 {text}。
// ============================================================================

import { showDialog, buildCellInput, button, select } from "./base.js";
import { tableGrid, tryMerge, trySplit, normalizeCells, validateDims } from "../../core/table.js";
import { resolveColor } from "../../core/theme.js";

const PRESET_COLORS = ["", "$primary", "$accent", "$text", "$muted", "$success", "$warning", "$danger", "$primarySoft", "#111827", "#FFFFFF", "#2563EB", "#F59E0B", "#DC2626", "#16A34A"];
const H_ALIGNS = [["left", "左"], ["center", "居中"], ["right", "右"], ["justify", "两端"]];
const V_ALIGNS = [["top", "上"], ["middle", "中"], ["bottom", "下"]];

/** 主题色 → hex（编辑器预览用；$ 引用在 CSS 里无效）。 */
function cssColor(v) {
  const theme = window.__pptdEditor?.state?.theme;
  return theme ? (resolveColor(theme, v) || v) : v;
}

export function openTableEditor(el, { onChange }) {
  const container = document.createElement("div");
  container.className = "chart-editor";
  const grid = document.createElement("div");
  grid.className = "table-wrap";
  container.appendChild(grid);

  // 选中状态：{r, c} 或区域 {r1, c1, r2, c2}
  let sel = null;
  let anchor = null; // 区域选择起点

  function colCount() {
    const cols = el.columnWidths?.length;
    return cols || (el.rows?.[0]?.length) || 1;
  }

  function commit() {
    onChange();
  }

  /** 渲染网格 + 样式工具条 + 操作按钮。 */
  function renderGrid() {
    grid.innerHTML = "";
    const rows = (el.rows = normalizeCells(el.rows));
    if (!rows.length) rows.push([{ text: "" }]);
    syncDims(el);
    const cols = colCount();

    const table = document.createElement("table");
    table.className = "data-table";
    const tbody = document.createElement("tbody");
    const { grid: gd } = tableGrid(rows, cols);

    gd.forEach((gRow, r) => {
      const tr = document.createElement("tr");
      // 行删除按钮列（跳过被覆盖行不显示？合并行整行删除有歧义——保留按钮仅对首行可见格）
      const td0 = document.createElement("td");
      td0.className = "row-del";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "row-del-btn";
      delBtn.textContent = "✕";
      delBtn.title = "删除行";
      delBtn.onclick = () => {
        // 含跨行合并（主格在本行）时禁止删除，避免 rowSpan 越界
        const hasRowSpan = gRow.some((g) => !g.covered && (g.cell?.rowSpan || 1) > 1);
        if (hasRowSpan) { alert("该行包含跨行合并单元格，请先拆分再删除行"); return; }
        rows.splice(r, 1);
        syncDims(el);
        renderGrid();
        commit();
      };
      td0.appendChild(delBtn);
      tr.appendChild(td0);

      gRow.forEach((g, c) => {
        const td = document.createElement("td");
        td.className = "grid-cell";
        const isSel = sel && sel.r === r && sel.c === c;
        const inRegion = sel && sel.r1 != null && r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2;
        if (isSel) td.classList.add("cell-selected");
        if (inRegion) td.classList.add("cell-region");
        if (g.covered) {
          td.className += " cell-covered";
          td.textContent = "";
          td.title = "被合并单元格覆盖";
          tr.appendChild(td);
          return;
        }
        td.title = `(${r + 1}, ${c + 1})${(g.cell?.rowSpan || 1) > 1 || (g.cell?.colSpan || 1) > 1 ? " · 合并格" : ""}`;
        if ((g.cell?.rowSpan || 1) > 1) td.rowSpan = g.cell.rowSpan;
        if ((g.cell?.colSpan || 1) > 1) td.colSpan = g.cell.colSpan;
        td.style.cssText = cellCss(g.cell);
        const input = buildCellInput(g.cell?.text ?? "", "单元格文本", () => {
          g.cell.text = input.value;
          commit();
        });
        td.appendChild(input);
        // 点击选中：单击选中，Shift+单击 区域选择
        input.addEventListener("click", (ev) => {
          if (ev.shiftKey && anchor) {
            sel = { r1: Math.min(anchor.r, r), c1: Math.min(anchor.c, c), r2: Math.max(anchor.r, r), c2: Math.max(anchor.c, c), anchor: true };
          } else {
            anchor = { r, c };
            sel = { r, c };
          }
          renderGrid();
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    grid.appendChild(table);

    // ---- 操作区：合并/拆分 + 尺寸 ----
    const ops = document.createElement("div");
    ops.className = "grid-ops";
    const mergeBtn = button("合并", () => {
      if (!sel || sel.r1 == null) { alert("请先选中区域：单击起点后 Shift+单击终点"); return; }
      const rows2 = el.rows;
      const err = tryMerge(rows2, sel.r1, sel.c1, sel.r2, sel.c2, colCount());
      if (err) { alert(err); return; }
      sel = { r: sel.r1, c: sel.c1 };
      anchor = null;
      renderGrid();
      commit();
    });
    const splitBtn = button("拆分", () => {
      if (!sel || sel.r1 != null) { alert("请先单击选中一个合并单元格"); return; }
      const err = trySplit(el.rows, sel.r, sel.c, colCount());
      if (err) { alert(err); return; }
      renderGrid();
      commit();
    });
    const dimBtn = button("行高/列宽…", () => editDims(el, commit, renderGrid));
    ops.append(mergeBtn, splitBtn, dimBtn,
      button("＋ 加行", () => {
        el.rows.push(Array.from({ length: colCount() }, () => ({ text: "" })));
        syncDims(el); renderGrid(); commit();
      }),
      button("＋ 加列", () => {
        for (const row of el.rows) row.push({ text: "" });
        syncDims(el); renderGrid(); commit();
      })
    );
    grid.appendChild(ops);
    renderStyles();
  }

  // ---- 单元格样式工具条（选中单格时显示） ----
  let styleBar = null;
  function renderStyles() {
    if (styleBar) styleBar.remove();
    styleBar = document.createElement("div");
    styleBar.className = "cell-style-bar";
    if (!sel || sel.r1 != null) {
      styleBar.textContent = "选中单元格后可编辑样式；Shift+点击选择合并区域。";
      styleBar.style.color = "#8a94a6";
      grid.appendChild(styleBar);
      return;
    }
    const g = tableGrid(el.rows, colCount()).grid[sel.r]?.[sel.c];
    const cell = g?.cell;
    if (!cell) { styleBar.remove(); return; }

    const set = (fn) => { fn(cell); commit(); renderStyles(); };
    const T = (label, control) => {
      const w = document.createElement("span");
      w.className = "style-item";
      const l = document.createElement("label");
      l.textContent = label;
      w.append(l, control);
      return w;
    };

    // B / I
    const bBtn = button(cell.bold ? "B ✓" : "B", () => set((c) => { c.bold = !c.bold; }));
    bBtn.className += cell.bold ? " style-active" : "";
    const iBtn = button(cell.italic ? "I ✓" : "I", () => set((c) => { c.italic = !c.italic; }));
    iBtn.className += cell.italic ? " style-active" : "";
    // 颜色 / 字号 / 填充
    const colorSel = select(PRESET_COLORS.map((x) => [x, x || "（默认）"]), cell.color || "", (v) => set((c) => { v ? (c.color = v) : delete c.color; }));
    const sizeInp = document.createElement("input");
    sizeInp.type = "number";
    sizeInp.min = 8; sizeInp.max = 48; sizeInp.value = cell.fontSize || 13;
    sizeInp.style.width = "52px";
    sizeInp.addEventListener("change", () => set((c) => { c.fontSize = Number(sizeInp.value) || 13; }));
    const fillSel = select(PRESET_COLORS.map((x) => [x, x || "（透明）"]), cell.fill?.color || "", (v) => set((c) => { v ? (c.fill = { type: "solid", color: v }) : delete c.fill; }));
    // 对齐
    const hSel = select(H_ALIGNS, cell.align?.[0] || "", (v) => set((c) => { c.align = [v || "left", c.align?.[1] || "middle"]; }));
    const vSel = select(V_ALIGNS, cell.align?.[1] || "", (v) => set((c) => { c.align = [c.align?.[0] || "left", v || "middle"]; }));
    // textStyle 引用
    const tsInp = document.createElement("input");
    tsInp.placeholder = "$key（如 $body）";
    tsInp.value = cell.textStyle || "";
    tsInp.style.width = "110px";
    tsInp.addEventListener("change", () => set((c) => { tsInp.value ? (c.textStyle = tsInp.value) : delete c.textStyle; }));

    styleBar.append(
      T("样式", [bBtn, iBtn]),
      T("字色", colorSel),
      T("字号", sizeInp),
      T("填充", fillSel),
      T("水平", hSel),
      T("垂直", vSel),
      T("textStyle", tsInp)
    );
    grid.appendChild(styleBar);
  }

  function syncDims(el) {
    const rows = el.rows || [];
    const cols = colCount();
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

/** 单元格样式 → td 内联样式（与预览 renderer/table.js 一致的简化版）。 */
function cellCss(cell) {
  const parts = [];
  if (cell?.fill?.color) parts.push(`background:${cssColor(cell.fill.color)}`);
  if (cell?.bold) parts.push("font-weight:600");
  if (cell?.italic) parts.push("font-style:italic");
  if (cell?.color) parts.push(`color:${cssColor(cell.color)}`);
  if (cell?.fontSize) parts.push(`font-size:${cell.fontSize}px`);
  if (cell?.align?.[0]) parts.push(`text-align:${cell.align[0]}`);
  return parts.join(";");
}

/** 行高/列宽比例编辑对话框（官方约束：各项和 = 1）。 */
function editDims(el, commit, rerender) {
  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:10px;min-width:320px;";
  const mk = (label, dims, onSet) => {
    const wrap = document.createElement("div");
    const title = document.createElement("div");
    title.style.cssText = "font-weight:600;margin-bottom:4px;";
    title.textContent = label;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    dims.forEach((v, i) => {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.step = "0.05";
      inp.min = "0.05";
      inp.max = "1";
      inp.value = v.toFixed(2);
      inp.style.width = "56px";
      inp.title = `第 ${i + 1} 项`;
      inp.addEventListener("change", () => {
        dims[i] = Number(inp.value) || 1 / dims.length;
        onSet();
      });
      row.appendChild(inp);
    });
    wrap.append(title, row);
    return wrap;
  };
  const dimsChanged = () => {
    const msg = validateDims(el.columnWidths, "columnWidths") || validateDims(el.rowHeights, "rowHeights");
    if (msg) {
      // 不阻止编辑，提示即可
    }
    commit();
    rerender();
  };
  body.append(
    mk("列宽比例（columnWidths，和 = 1）", el.columnWidths, dimsChanged),
    mk("行高比例（rowHeights，和 = 1）", el.rowHeights, dimsChanged)
  );
  showDialog("行高 / 列宽", body);
}
