// ============================================================================
// editor/dialogs/table-editor.js — 表格网格编辑器（官方 Cell 模型）
// ----------------------------------------------------------------------------
// 能力：
//   - 网格编辑（合并格 rowSpan/colSpan 展开渲染，被覆盖位灰显不可编辑）
//   - 选区：Excel 式拖拽（pointerdown 阻止文本选择 → 拖动实时高亮）；
//     单击选中单格，双击进入文字编辑
//   - 合并（选中区域后点「合并 N×M」）/ 拆分
//   - 单元格样式：B/I/字色/字号/填充（三合一颜色控件）/水平垂直对齐/textStyle
//   - 行高/列宽比例编辑（官方约束：各项和 = 1）
// 数据模型：官方 Cell 对象（{text, color, bold, fill, align, rowSpan, colSpan…}），
// 裸值（string/number）在读取时规范化为 {text}。
// ============================================================================

import { showDialog, buildCellInput, button, select } from "./base.js";
import { tableGrid, tryMerge, trySplit, normalizeCells, validateDims } from "../../core/table.js";
import { resolveColor } from "../../core/theme.js";
import { colorField } from "../../ui.js";

const H_ALIGNS = [["left", "左"], ["center", "居中"], ["right", "右"], ["justify", "两端"]];
const V_ALIGNS = [["top", "上"], ["middle", "中"], ["bottom", "下"]];
const FONT_SIZES = [10, 12, 13, 14, 16, 18, 20, 24, 28, 32];

/** 主题色 → hex（编辑器预览用；$ 引用在 CSS 里无效）。 */
function cssColor(v) {
  const theme = window.__pptdEditor?.state?.theme;
  return theme ? (resolveColor(theme, v) || v) : v;
}

/** 主题语义色 swatch（与属性面板 colorField 同源）。 */
function themeSwatches() {
  const state = window.__pptdEditor?.state;
  const theme = state?.theme;
  const c = theme?.colors || {};
  const keys = ["primary", "accent", "text", "muted", "line", "success", "warning", "danger", "primaryDeep"];
  return keys.map((k) => ({ key: `$${k}`, value: resolveColor(theme, c[k]) || "#cccccc" }));
}

export function openTableEditor(el, { onChange }) {
  const container = document.createElement("div");
  container.className = "table-editor";
  const grid = document.createElement("div");
  grid.className = "table-wrap";
  container.appendChild(grid);

  // 选中状态：单格 {r, c} 或区域 {r1, c1, r2, c2}
  let sel = null;
  let dragSel = null; // 拖拽选区 {anchor:{r,c}, cur:{r,c}}

  function colCount() {
    const cols = el.columnWidths?.length;
    return cols || (el.rows?.[0]?.length) || 1;
  }

  function commit() {
    onChange();
  }

  const isRegion = () => sel && sel.r1 != null;
  const regionSize = () => (isRegion() ? `${sel.r2 - sel.r1 + 1}×${sel.c2 - sel.c1 + 1}` : "");

  // --------------------------------------------------------------------------
  // 选区高亮（不重建 DOM，只切 class）
  // --------------------------------------------------------------------------
  function renderSelection() {
    for (const td of grid.querySelectorAll("td.grid-cell")) {
      const r = Number(td.dataset.tr);
      const c = Number(td.dataset.tc);
      if (Number.isNaN(r) || Number.isNaN(c)) continue;
      const single = !isRegion();
      const isSel = single && sel && sel.r === r && sel.c === c;
      const inRegion = isRegion() && r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2;
      td.classList.toggle("cell-selected", isSel);
      td.classList.toggle("cell-region", inRegion);
    }
  }

  /** 渲染网格 + 工具条 + 样式条。 */
  function renderGrid() {
    grid.innerHTML = "";
    const rows = (el.rows = normalizeCells(el.rows));
    if (!rows.length) rows.push([{ text: "" }]);
    syncDims(el);
    const cols = colCount();
    const { grid: gd } = tableGrid(rows, cols);

    // ---- 结构工具条（常驻） ----
    const toolbar = document.createElement("div");
    toolbar.className = "grid-toolbar";
    const mergeBtn = button("合并", () => {
      if (!isRegion()) return;
      const err = tryMerge(rows, sel.r1, sel.c1, sel.r2, sel.c2, cols);
      if (err) { alert(err); return; }
      sel = { r: sel.r1, c: sel.c1 };
      renderGrid();
      commit();
    });
    const splitBtn = button("拆分", () => {
      if (!sel || sel.r1 != null) { alert("请先单击选中一个合并单元格"); return; }
      const err = trySplit(rows, sel.r, sel.c, cols);
      if (err) { alert(err); return; }
      renderGrid();
      commit();
    });
    const dimBtn = button("行高/列宽…", () => editDims(el, commit, renderGrid));
    toolbar.append(
      button("＋ 行", () => {
        rows.push(Array.from({ length: cols }, () => ({ text: "" })));
        syncDims(el); renderGrid(); commit();
      }),
      button("＋ 列", () => {
        for (const row of rows) row.push({ text: "" });
        syncDims(el); renderGrid(); commit();
      }),
      mergeBtn,
      splitBtn,
      dimBtn
    );
    grid.appendChild(toolbar);

    // ---- 网格 ----
    const table = document.createElement("table");
    table.className = "data-table";
    const tbody = document.createElement("tbody");
    gd.forEach((gRow, r) => {
      const tr = document.createElement("tr");
      // 行删除按钮列（跨行合并的主格所在行才显示）
      const td0 = document.createElement("td");
      td0.className = "row-del";
      const hasRowSpan = gRow.some((g) => !g.covered && (g.cell?.rowSpan || 1) > 1);
      if (!hasRowSpan) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "row-del-btn";
        delBtn.textContent = "✕";
        delBtn.title = "删除行";
        delBtn.onclick = () => {
          rows.splice(r, 1);
          syncDims(el);
          renderGrid();
          commit();
        };
        td0.appendChild(delBtn);
      }
      tr.appendChild(td0);

      gRow.forEach((g, c) => {
        const td = document.createElement("td");
        td.className = "grid-cell";
        td.dataset.tr = String(r);
        td.dataset.tc = String(c);
        if (g.covered) {
          td.classList.add("cell-covered");
          td.title = "被合并单元格覆盖";
          tr.appendChild(td);
          return;
        }
        td.title = `(${r + 1}, ${c + 1})${(g.cell?.rowSpan || 1) > 1 || (g.cell?.colSpan || 1) > 1 ? " · 合并格" : ""}`;
        if ((g.cell?.rowSpan || 1) > 1) td.rowSpan = g.cell.rowSpan;
        if ((g.cell?.colSpan || 1) > 1) td.colSpan = g.cell.colSpan;
        td.style.cssText = cellCss(g.cell);
        const input = buildCellInput(g.cell?.text ?? "", "单元格文本（双击编辑）", () => {
          g.cell.text = input.value;
          commit();
        });
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    grid.appendChild(table);

    // ---- 拖拽选区（Excel 式） ----
    bindDragSelect(table);

    // ---- 样式条（选中单格时显示） ----
    grid.appendChild(renderStyleBar());

    // 合并/拆分按钮动态态
    if (isRegion()) {
      mergeBtn.textContent = `合并 ${regionSize()}`;
      mergeBtn.disabled = false;
    } else {
      mergeBtn.textContent = "合并";
      mergeBtn.disabled = true;
      mergeBtn.title = "拖拽选择单元格区域后合并";
    }
    const cellAt = sel && !isRegion() ? tableGrid(rows, cols).grid[sel.r]?.[sel.c]?.cell : null;
    const isMerged = cellAt && ((cellAt.rowSpan || 1) > 1 || (cellAt.colSpan || 1) > 1);
    splitBtn.disabled = !isMerged;
    splitBtn.title = isMerged ? "" : "选中合并单元格后可拆分";

    renderSelection();
  }

  /**
   * Excel 式拖拽选区：
   *  - pointerdown 阻止默认（防 input 聚焦/文本选择），记录锚点
   *  - pointermove 实时更新选区（elementFromPoint 定位格子）
   *  - pointerup / cancel / blur 结束
   *  - 双击进入文字编辑
   */
  function bindDragSelect(table) {
    table.addEventListener("pointerdown", (e) => {
      const td = e.target.closest("td.grid-cell:not(.cell-covered)");
      if (!td) return;
      e.preventDefault(); // 阻止文本选择与 input 聚焦（拖拽选区的前提）
      const r = Number(td.dataset.tr);
      const c = Number(td.dataset.tc);
      dragSel = { anchor: { r, c }, cur: { r, c } };
      sel = { r, c };
      renderSelection();
    });

    table.addEventListener("pointermove", (e) => {
      if (!dragSel) return;
      const td = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("td.grid-cell:not(.cell-covered)");
      if (!td) return;
      const r = Number(td.dataset.tr);
      const c = Number(td.dataset.tc);
      if (r === dragSel.cur.r && c === dragSel.cur.c) return;
      dragSel.cur = { r, c };
      sel = {
        r1: Math.min(dragSel.anchor.r, r), c1: Math.min(dragSel.anchor.c, c),
        r2: Math.max(dragSel.anchor.r, r), c2: Math.max(dragSel.anchor.c, c),
      };
      renderSelection();
    });

    const endDrag = () => { dragSel = null; };
    table.addEventListener("pointerup", endDrag);
    table.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);

    // 双击进入编辑（pointerdown 已阻止单击聚焦）
    table.addEventListener("dblclick", (e) => {
      const td = e.target.closest("td.grid-cell:not(.cell-covered)");
      const inp = td?.querySelector("input");
      if (inp) inp.focus();
    });
  }

  // --------------------------------------------------------------------------
  // 单元格样式工具条（选中单格时显示）
  // --------------------------------------------------------------------------
  function renderStyleBar() {
    const bar = document.createElement("div");
    bar.className = "cell-style-bar";
    if (!sel || sel.r1 != null) {
      const hint = document.createElement("span");
      hint.className = "style-hint";
      hint.textContent = "拖拽选择区域后点「合并」；单击选中单元格可编辑样式，双击编辑文字。";
      bar.appendChild(hint);
      return bar;
    }
    const cell = tableGrid(el.rows, colCount()).grid[sel.r]?.[sel.c]?.cell;
    if (!cell) return bar;

    const set = (fn) => { fn(cell); commit(); renderGrid(); };
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
    // 字色 / 填充：三合一颜色控件（色块弹层 + 取色器 + hex）
    const colorCtl = colorField(cell.color || "$text", (v) => set((c) => { v ? (c.color = v) : delete c.color; }), {
      resolve: (val) => resolveColor(window.__pptdEditor?.state?.theme, val),
      swatches: themeSwatches(),
    });
    const fillCtl = colorField(cell.fill?.color || "", (v) => set((c) => { v ? (c.fill = { type: "solid", color: v }) : delete c.fill; }), {
      resolve: (val) => resolveColor(window.__pptdEditor?.state?.theme, val),
      swatches: themeSwatches(),
    });
    // 字号（预设 + 数字）
    const sizeSel = select(FONT_SIZES.map((n) => [String(n), `${n}`]), String(cell.fontSize || 13), (v) => set((c) => { c.fontSize = Number(v); }));
    // 对齐
    const hSel = select(H_ALIGNS, cell.align?.[0] || "", (v) => set((c) => { c.align = [v || "left", c.align?.[1] || "middle"]; }));
    const vSel = select(V_ALIGNS, cell.align?.[1] || "", (v) => set((c) => { c.align = [c.align?.[0] || "left", v || "middle"]; }));
    // textStyle 引用
    const tsInp = document.createElement("input");
    tsInp.placeholder = "$key（如 $body）";
    tsInp.value = cell.textStyle || "";
    tsInp.className = "style-ts";
    tsInp.addEventListener("change", () => set((c) => { tsInp.value ? (c.textStyle = tsInp.value) : delete c.textStyle; }));

    bar.append(
      T("样式", [bBtn, iBtn]),
      T("字色", colorCtl),
      T("字号", sizeSel),
      T("填充", fillCtl),
      T("水平", hSel),
      T("垂直", vSel),
      T("textStyle", tsInp)
    );
    return bar;
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
    commit();
    rerender();
  };
  body.append(
    mk("列宽比例（columnWidths，和 = 1）", el.columnWidths, dimsChanged),
    mk("行高比例（rowHeights，和 = 1）", el.rowHeights, dimsChanged)
  );
  showDialog("行高 / 列宽", body);
}
