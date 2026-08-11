// ============================================================================
// interaction/excel-grid.js — Excel 式数据网格组件（表格编辑器/图表编辑器共用）
// ----------------------------------------------------------------------------
// 以表格编辑器网格为基准实现，参数化差异点（合并格/列宽/列头内容/额外工具条
// 按钮/单元格样式），表格与图表共用同一套 DOM 结构、选区模型与交互：
//   - 工具条：↑插行 ↓插行 ←插列 →插列 | 删除行 删除列 [+ 消费方额外按钮]
//   - 网格：colgroup（18px 行头列固定 + 数据列宽）+ 字母列头 + 数字行头 + input 单元格
//   - 选区：单格 {r,c} / 区域 {r1,c1,r2,c2}（与表格编辑器语义一致），
//     拖拽选整行/列/区域（共用 interaction/drag-select.js，含边缘自动滚动）
// 插入/删除通过回调让消费方改模型（可返回错误串拒绝，如表格的合并保护），
// 组件负责新选区与重建；样式面板等外部联动走 afterRender / onSelect。
// ============================================================================

import { button } from "./dialogs/base.js";
import { bindExcelDragSelect } from "./drag-select.js";

/** 列字母（Excel 式：A B … Z AA AB）。 */
function colLetter(i) {
  let s = "";
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/** 数据列最小宽度（px）：Excel 式固定列宽——列多时表格超宽出现横向滚动，不挤压。 */
const MIN_COL_W = 96;
/** 列宽逻辑基准（px）：columnWidths 比例 × 基准 = 实际列宽（预览导出同比例）。 */
const COL_BASE_W = 560;

/**
 * @param {object} opts
 *  数据访问：
 *   - getRows(): 行数
 *   - getCols(): 列数
 *   - cellValue(r, c): 单元格显示文本（string）
 *   - onCellChange(r, c, v): 输入提交（消费方改模型）
 *   - covered(r, c): 是否合并占位格（默认 false）
 *   - rowSpan(r, c) / colSpan(r, c): 合并主格跨度（默认 1）
 *   - cellCss(r, c): td 样式 cssText（表格 = tdCss；图表空）
 *   - inputCss(r, c): input 样式 cssText（表格 = 高亮背景；图表空）
 *   - rowHeight(r): 行高 px（默认空）
 *   - colWidths(): 数据列宽比例数组 0-1（默认均分）
 *   - colHeadContent(c): 列头内容（Node|string；默认字母）
 *   - cellTitle(r, c): 单元格 title（默认空）
 *   - cellPlaceholder(r, c): 输入占位提示（默认空；表格 = "双击编辑"）
 *  操作（消费方改模型并 commit；返回错误串可拒绝）：
 *   - canInsertRows(at, n) / canInsertCols(at, n)
 *   - canDeleteRows(r1, r2) / canDeleteCols(c1, c2)
 *   - onInsertRows(at, n) / onInsertCols(at, n)
 *   - onDeleteRows(r1, r2) / onDeleteCols(c1, c2)
 *  联动：
 *   - extraToolbar(mkBtn, sep): 额外工具条按钮（表格：合并/拆分/行高列宽）
 *   - onSelect(sel, kind): 选区变化回调（kind = cell|row|col|end；end 时 sel 为 null）
 *   - afterRender(): 每次重建后回调（表格：刷新样式面板）
 */
export function createExcelGrid(opts) {
  const {
    getRows, getCols,
    cellValue, onCellChange,
    covered = () => false,
    rowSpan = () => 1, colSpan = () => 1,
    cellCss = () => "", inputCss = () => "",
    rowHeight = () => null, colWidths = null,
    colHeadContent = null, cellTitle = () => "", cellPlaceholder = () => "",
    canInsertRows = null, canInsertCols = null,
    canDeleteRows = null, canDeleteCols = null,
    onInsertRows, onInsertCols, onDeleteRows, onDeleteCols,
    extraToolbar = null, onSelect = null, afterRender = null,
  } = opts;

  const root = document.createElement("div");
  root.className = "excel-grid";

  // 选区（单格 {r,c} / 区域 {r1,c1,r2,c2}，Excel 式活动单元格 A1）
  let sel = { r: 0, c: 0 };

  const isRegion = () => sel && sel.r1 != null;
  const regionRows = () => (isRegion() ? sel.r2 - sel.r1 + 1 : 1);
  const regionCols = () => (isRegion() ? sel.c2 - sel.c1 + 1 : 1);
  const selRows = () => (isRegion() ? [sel.r1, sel.r2] : [sel.r, sel.r]);
  const selCols = () => (isRegion() ? [sel.c1, sel.c2] : [sel.c, sel.c]);

  /** 方向插入（Excel 式）：at = 插入位置，n = 插入数量（= 选区跨度）。 */
  const insertRows = (at, n) => {
    const err = canInsertRows ? canInsertRows(at, n) : null;
    if (err) { alert(err); return; }
    onInsertRows(at, n);
    sel = { r1: at, c1: 0, r2: at + n - 1, c2: getCols() - 1 }; // 选中新插入的行
    render();
  };
  const insertCols = (at, n) => {
    const err = canInsertCols ? canInsertCols(at, n) : null;
    if (err) { alert(err); return; }
    onInsertCols(at, n);
    sel = { r1: 0, c1: at, r2: getRows() - 1, c2: at + n - 1 }; // 选中新插入的列
    render();
  };
  const deleteRows = (r1, r2) => {
    if (getRows() <= 1) return;
    const err = canDeleteRows ? canDeleteRows(r1, r2) : null;
    if (err) { alert(err); return; }
    onDeleteRows(r1, r2);
    sel = { r: Math.min(r1, getRows() - 1), c: 0 }; // 删除后落回相邻行首列（与表格基准一致）
    render();
  };
  const deleteCols = (c1, c2) => {
    if (getCols() <= 1) return;
    const err = canDeleteCols ? canDeleteCols(c1, c2) : null;
    if (err) { alert(err); return; }
    onDeleteCols(c1, c2);
    sel = { r: 0, c: Math.min(c1, getCols() - 1) }; // 删除后落回首行相邻列（与表格基准一致）
    render();
  };

  /** 全量重建（工具条 + 网格）。消费方模型变更后调用。 */
  function render() {
    root.innerHTML = "";
    const cols = getCols();
    const rows = getRows();

    // ---- 工具条（常驻） ----
    const toolbar = document.createElement("div");
    toolbar.className = "table-toolbar";
    const sep = () => {
      const s = document.createElement("span");
      s.className = "toolbar-sep";
      return s;
    };
    const mkBtn = (label, onClick, opts2 = {}) => {
      const b = button(label, onClick);
      if (opts2.disabled) b.disabled = true;
      if (opts2.title) b.title = opts2.title;
      return b;
    };
    toolbar.append(
      mkBtn("↑ 插行", () => { const [r1, r2] = selRows(); insertRows(r1, r2 - r1 + 1); }, { title: "在选区上方插入行" }),
      mkBtn("↓ 插行", () => { const [r1, r2] = selRows(); insertRows(r2 + 1, r2 - r1 + 1); }, { title: "在选区下方插入行" }),
      mkBtn("← 插列", () => { const [c1, c2] = selCols(); insertCols(c1, c2 - c1 + 1); }, { title: "在选区左侧插入列" }),
      mkBtn("→ 插列", () => { const [c1, c2] = selCols(); insertCols(c2 + 1, c2 - c1 + 1); }, { title: "在选区右侧插入列" }),
      sep(),
      mkBtn("删除行", () => { const [r1, r2] = selRows(); deleteRows(r1, r2); }, { title: "删除选区覆盖的所有行" }),
      mkBtn("删除列", () => { const [c1, c2] = selCols(); deleteCols(c1, c2); }, { title: "删除选区覆盖的所有列" })
    );
    if (extraToolbar) toolbar.append(sep(), ...extraToolbar(mkBtn, sep));
    root.appendChild(toolbar);

    // ---- 网格区（可滚动） ----
    const gridWrap = document.createElement("div");
    gridWrap.className = "excel-grid-scroll";
    const table = document.createElement("table");
    table.className = "data-table";
    // fixed 布局：列宽完全由 colgroup 决定（行头恒 18px，列头 input 等内容不撑宽）
    table.style.tableLayout = "fixed";
    // 表格宽度 = 内容宽（不拉伸容器）：列少时右侧留白，列多时超宽 → 横向滚动（Excel 式）
    table.style.width = "max-content";
    const colgroup = document.createElement("colgroup");
    // 行头列（固定窄列，必须占 colgroup 首位，否则数据列百分比错位挤爆行头）
    const headCol = document.createElement("col");
    headCol.style.width = "18px";
    colgroup.appendChild(headCol);
    const widths = colWidths ? colWidths() : null;
    for (let c = 0; c < cols; c++) {
      const col = document.createElement("col");
      // Excel 式固定列宽（px）：比例 × 逻辑基准，最小 96px——列多时超宽滚动而不是均分挤压
      const w = widths ? Math.max(MIN_COL_W, widths[c] * COL_BASE_W) : MIN_COL_W;
      col.style.width = `${w.toFixed(0)}px`;
      col.style.minWidth = `${MIN_COL_W}px`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    // 列头（Excel 式：字母，点击/拖拽选列）
    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "head-corner";
    headTr.appendChild(corner);
    for (let c = 0; c < cols; c++) {
      const th = document.createElement("th");
      th.className = "col-head";
      th.dataset.cc = String(c);
      const content = colHeadContent ? colHeadContent(c) : null;
      th.append(content ?? colLetter(c));
      headTr.appendChild(th);
    }
    thead.appendChild(headTr);
    table.appendChild(thead);

    // 行体（行头 + 单元格）
    const tbody = document.createElement("tbody");
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr");
      const rh = rowHeight(r);
      if (rh) tr.style.height = `${rh}px`;
      const th0 = document.createElement("td");
      th0.className = "row-head";
      th0.dataset.rr = String(r);
      th0.textContent = String(r + 1);
      tr.appendChild(th0);

      for (let c = 0; c < cols; c++) {
        const td = document.createElement("td");
        td.className = "grid-cell";
        td.dataset.tr = String(r);
        td.dataset.tc = String(c);
        const css = cellCss(r, c);
        if (css) td.style.cssText = css;
        td.title = cellTitle(r, c);
        const rs = rowSpan(r, c);
        const cs = colSpan(r, c);
        if (covered(r, c)) {
          td.classList.add("cell-covered");
          tr.appendChild(td);
          continue;
        }
        if (rs > 1) td.rowSpan = rs;
        if (cs > 1) td.colSpan = cs;
        const input = document.createElement("input");
        input.type = "text";
        input.value = cellValue(r, c) ?? "";
        const ph = cellPlaceholder(r, c);
        if (ph) input.placeholder = ph;
        const icss = inputCss(r, c);
        if (icss) input.style.cssText = icss;
        // Enter 向下跳格 + 聚焦全选
        input.addEventListener("focus", () => input.select());
        input.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const nextTr = tr.nextElementSibling;
          const nextInput = nextTr?.children?.[c + 1]?.querySelector("input");
          if (nextInput) { nextInput.focus(); nextInput.select(); }
          else input.blur();
        });
        input.addEventListener("change", () => onCellChange(r, c, input.value));
        td.appendChild(input);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    gridWrap.appendChild(table);
    root.appendChild(gridWrap);

    // ---- 选区高亮 + 拖拽（与表格编辑器同语义：单格 outline / 区域阴影，行列头仅区域亮） ----
    const selRange = () => (isRegion() ? sel : { r1: sel.r, c1: sel.c, r2: sel.r, c2: sel.c });
    const paint = () => {
      const single = !isRegion();
      const s = selRange();
      for (const td of gridWrap.querySelectorAll("td.grid-cell")) {
        const r = Number(td.dataset.tr);
        const c = Number(td.dataset.tc);
        td.classList.toggle("cell-selected", single && sel.r === r && sel.c === c);
        td.classList.toggle("cell-region", !single && r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2);
      }
      for (const td of gridWrap.querySelectorAll("td.row-head")) {
        const r = Number(td.dataset.rr);
        td.classList.toggle("head-active", !single && r >= s.r1 && r <= s.r2);
      }
      for (const th of gridWrap.querySelectorAll("th.col-head")) {
        const c = Number(th.dataset.cc);
        th.classList.toggle("head-active", !single && c >= s.c1 && c <= s.c2);
      }
    };
    bindExcelDragSelect(gridWrap, {
      getRows,
      getCols,
      cellOf: (t) => {
        const td = t?.closest?.("td.grid-cell:not(.cell-covered)");
        return td ? { r: Number(td.dataset.tr), c: Number(td.dataset.tc) } : null;
      },
      colOf: (t) => {
        const th = t?.closest?.("th.col-head");
        return th ? Number(th.dataset.cc) : null;
      },
      rowOf: (t) => {
        const td = t?.closest?.("td.row-head");
        return td ? Number(td.dataset.rr) : null;
      },
      onSelect: (next, kind) => {
        if (kind === "end") {
          if (onSelect) onSelect(null, "end");
          if (isRegion()) render(); // 区域完成：重建（按钮态「合并 N×M」/删除行列启用）
          return;
        }
        sel = next;
        paint();
        if (onSelect) onSelect(next, kind);
      },
    });
    paint();
    if (afterRender) afterRender();
  }

  return {
    root,
    render,
    getSel: () => sel,
    setSel: (s) => { sel = s; },
    isRegion,
    regionRows,
    regionCols,
    selRows,
    selCols,
  };
}
