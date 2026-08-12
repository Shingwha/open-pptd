// ============================================================================
// editor/dialogs/table-editor.js — 表格网格编辑器（Excel 式整体设计）
// ----------------------------------------------------------------------------
// 布局：
//   ┌ 工具条（常驻）：[＋行][＋列][删除行][删除列] | [合并][拆分] | [行高列宽…] ┐
//   ├ 表格区（可滚动占满）───────────────┬ 样式面板（右侧固定，选中单格显示）┤
//   │ 列头 A B C D（点击选整列/拖拽多列） │   B/I · 字号 · 字色 · 填充        │
//   │ 行头 1 2 3（点击选整行/拖拽多行）   │   水平/垂直对齐 · textStyle       │
//   │ 单元格网格（单击/拖拽选区域）       │                                   │
//   └────────────────────────────────────┴───────────────────────────────────┘
// 交互模型（统一选区 → 工具条操作）：
//   - 单元格：单击选中 / 拖拽区域（pointerdown 阻止文本选择，双击进入编辑）
//   - 行头/列头：点击选中整行/整列，拖拽扩展多行/多列
//   - 删除行/列：按当前选区覆盖区间删除（含合并保护，需先拆分）
//   - 合并：区域 >1×1 时启用（按钮显示「合并 N×M」）；拆分：选中合并格时启用
// 样式 = 右侧固定面板（不浮动不换行）；网格复用 renderer/table.js 完整样式链
// （cellFinal/tdCss/estimateTableLayout）——所见即所得。
// ============================================================================

import { showDialog, buildCellInput, button } from "./base.js";
import { tableGrid, tryMerge, trySplit, normalizeCells, validateDims, estimateTableLayout } from "../../core/table.js";
import { resolveColor, resolveTableStyle } from "../../core/theme.js";
import * as ui from "../../ui.js";
import { cellFinal, tdCss } from "../../renderer/table.js";
import { renderGroup, fieldHandlers } from "../fields.js";
import { createExcelGrid } from "../excel-grid.js";

const H_ALIGNS = [["left", "左"], ["center", "居中"], ["right", "右"], ["justify", "两端"]];
const V_ALIGNS = [["top", "上"], ["middle", "中"], ["bottom", "下"]];

/** 当前编辑器主题（对话框内预览与画布同源）。 */
function editorTheme() {
  return window.__pptdEditor?.state?.theme || null;
}

export function openTableEditor(el, { onChange }) {
  const container = document.createElement("div");
  container.className = "table-editor";

  function colCount() {
    const cols = el.columnWidths?.length;
    return cols || (el.rows?.[0]?.length) || 1;
  }

  function commit() {
    onChange();
  }

  // 模型快照（render 时更新；网格组件回调引用——与模型对象同引用，输入提交直接生效）
  let rows = [];
  let cols = 1;
  let theme = null;
  let ts = null;
  let gd = [];
  let rowHeights = [];
  let columnWidths = [];

  // —— Excel 式数据网格（共用 interaction/excel-grid.js，本编辑器为其基准）——
  const grid = createExcelGrid({
    getRows: () => rows.length,
    getCols: () => cols,
    cellValue: (r, c) => gd[r]?.[c]?.cell?.text ?? "",
    onCellChange: (r, c, v) => {
      const g = gd[r]?.[c];
      if (g && !g.covered) {
        g.cell ||= {};
        g.cell.text = v;
        commit();
      }
    },
    covered: (r, c) => !!gd[r]?.[c]?.covered,
    rowSpan: (r, c) => gd[r]?.[c]?.cell?.rowSpan || 1,
    colSpan: (r, c) => gd[r]?.[c]?.cell?.colSpan || 1,
    cellCss: (r, c) => {
      const g = gd[r]?.[c];
      if (!g) return "";
      return tdCss(theme, cellFinal(theme, ts, r, c, rows.length, cols, g.covered ? null : g.cell, el.fill), g.covered);
    },
    inputCss: (r, c) => {
      const g = gd[r]?.[c];
      if (!g || g.covered) return "";
      const hl = resolveColor(theme, cellFinal(theme, ts, r, c, rows.length, cols, g.cell, el.fill).backgroundColor);
      return hl ? `background:${hl}` : "";
    },
    rowHeight: (r) => rowHeights?.[r] ?? null,
    colWidths: () => columnWidths,
    colHeadContent: (c) => String.fromCharCode(65 + c),
    cellTitle: (r, c) => {
      const g = gd[r]?.[c];
      if (!g) return "";
      if (g.covered) return "被合并单元格覆盖";
      const m = (g.cell?.rowSpan || 1) > 1 || (g.cell?.colSpan || 1) > 1;
      return `(${r + 1}, ${c + 1})${m ? " · 合并格" : ""}`;
    },
    cellPlaceholder: () => "双击编辑",
    canInsertRows: (at, n) => (insertGuard(rows, cols, at, "row") ? "插入位置与跨行合并单元格冲突，请先拆分" : null),
    canInsertCols: (at, n) => (insertGuard(rows, cols, at, "col") ? "插入位置与跨列合并单元格冲突，请先拆分" : null),
    canDeleteRows: (r1, r2) => (mergeGuard(rows, cols, r1, r2, "row") ? "选区涉及跨行合并单元格，请先拆分再删除行" : null),
    canDeleteCols: (c1, c2) => (mergeGuard(rows, cols, c1, c2, "col") ? "选区涉及跨列合并单元格，请先拆分再删除列" : null),
    onInsertRows: (at, n) => {
      rows.splice(at, 0, ...Array.from({ length: n }, () => Array.from({ length: cols }, () => ({ text: "" }))));
      ({ grid: gd } = tableGrid(rows, cols));
      syncDims(el);
      commit();
    },
    onInsertCols: (at, n) => {
      for (const row of rows) row.splice(at, 0, ...Array.from({ length: n }, () => ({ text: "" })));
      // 列数变更：columnWidths 同步插入（取相邻列宽），否则 colCount 被旧长度卡死、新列被顶替
      const cw = Array.isArray(el.columnWidths) ? [...el.columnWidths] : Array.from({ length: cols }, () => 1 / cols);
      const w = cw[Math.min(at, cw.length - 1)] ?? 1 / (cw.length + n);
      el.columnWidths = [...cw.slice(0, at), ...Array.from({ length: n }, () => w), ...cw.slice(at)];
      const total = el.columnWidths.reduce((a, b) => a + b, 0) || 1;
      el.columnWidths = el.columnWidths.map((x) => x / total); // 归一保持和 = 1（官方约束）
      cols = colCount(); // 更新闭包列数快照（组件 getCols 读取），否则重建仍用旧列数
      ({ grid: gd } = tableGrid(rows, cols));
      syncDims(el);
      commit();
    },
    onDeleteRows: (r1, r2) => {
      rows.splice(r1, r2 - r1 + 1);
      ({ grid: gd } = tableGrid(rows, cols));
      syncDims(el);
      commit();
    },
    onDeleteCols: (c1, c2) => {
      for (const row of rows) row.splice(c1, c2 - c1 + 1);
      if (Array.isArray(el.columnWidths)) {
        el.columnWidths.splice(c1, c2 - c1 + 1);
        const total = el.columnWidths.reduce((a, b) => a + b, 0) || 1;
        el.columnWidths = el.columnWidths.map((x) => x / total);
      }
      cols = colCount(); // 更新闭包列数快照（组件 getCols 读取）
      ({ grid: gd } = tableGrid(rows, cols));
      syncDims(el);
      commit();
    },
    extraToolbar: (mkBtn, sep) => {
      const mergeBtn = mkBtn("合并", () => {
        if (!grid.isRegion() || (grid.regionRows() === 1 && grid.regionCols() === 1)) return;
        const s = grid.getSel();
        const err = tryMerge(rows, s.r1, s.c1, s.r2, s.c2, cols);
        if (err) { alert(err); return; }
        grid.setSel({ r: s.r1, c: s.c1 });
        render();
        commit();
      }, { disabled: !grid.isRegion() || (grid.regionRows() === 1 && grid.regionCols() === 1) });
      if (grid.isRegion()) mergeBtn.textContent = `合并 ${grid.regionRows()}×${grid.regionCols()}`;
      const splitBtn = mkBtn("拆分", () => {
        const s = grid.getSel();
        if (!s || s.r1 != null) return;
        const err = trySplit(rows, s.r, s.c, cols);
        if (err) { alert(err); return; }
        render();
        commit();
      }, { disabled: true });
      const s = grid.getSel();
      const cellAt = s && !grid.isRegion() ? gd[s.r]?.[s.c]?.cell : null;
      const isMerged = cellAt && ((cellAt.rowSpan || 1) > 1 || (cellAt.colSpan || 1) > 1);
      splitBtn.disabled = !isMerged;
      splitBtn.title = isMerged ? "" : "选中合并单元格后可拆分";
      const dimBtn = mkBtn("行高/列宽…", () => editDims(el, commit, render));
      return [mergeBtn, splitBtn, sep(), dimBtn];
    },
    onSelect: (next, kind) => {
      if (kind !== "end") refreshStylePanel(); // 样式面板随选区实时刷新
    },
    afterRender: () => refreshStylePanel(),
  });

  // --------------------------------------------------------------------------
  // 主渲染：工具条 + 网格 + 样式面板
  // --------------------------------------------------------------------------
  function render() {
    rows = (el.rows = normalizeCells(el.rows));
    if (!rows.length) rows.push([{ text: "" }]);
    syncDims(el);
    cols = colCount();
    ({ grid: gd } = tableGrid(rows, cols));
    theme = editorTheme();
    ts = resolveTableStyle(theme, el.style);
    ({ rowHeights, columnWidths } = estimateTableLayout(el));
    container.innerHTML = "";
    const body = document.createElement("div");
    body.className = "table-body";
    body.appendChild(grid.root); // 工具条 + 网格（组件内部重建）
    container.appendChild(body);
    grid.render();
    refreshStylePanel(); // 初始面板（afterRender 已触发，此处保险——选中态初值）
  }

  /** 合并保护：删除区间 [a1,a2] 与合并格冲突检查（axis: row 查 rowSpan / col 查 colSpan）。 */
  function mergeGuard(rows, cols, a1, a2, axis) {
    const { grid: gd } = tableGrid(rows, cols);
    for (let r = 0; r < gd.length; r++) {
      for (let c = 0; c < cols; c++) {
        const g = gd[r][c];
        if (!g || g.covered) continue;
        const span = axis === "row" ? g.cell?.rowSpan || 1 : g.cell?.colSpan || 1;
        if (span <= 1) continue;
        const s = axis === "row" ? r : c;
        const e = s + span - 1;
        // 主格在区间内但覆盖出区间，或主格在区间外但覆盖进区间 → 禁止
        if ((s >= a1 && s <= a2 && e > a2) || (s < a1 && e >= a1)) {
          alert(axis === "row" ? "选区涉及跨行合并单元格，请先拆分再删除行" : "选区涉及跨列合并单元格，请先拆分再删除列");
          return true;
        }
      }
    }
    return false;
  }

  /** 插入保护：插入位置 at 与合并格冲突检查（axis: row 查 rowSpan / col 查 colSpan）。
   * 主格覆盖区间跨过插入位置 → 插入后覆盖错位，禁止。 */
  function insertGuard(rows, cols, at, axis) {
    const { grid: gd } = tableGrid(rows, cols);
    for (let r = 0; r < gd.length; r++) {
      for (let c = 0; c < cols; c++) {
        const g = gd[r][c];
        if (!g || g.covered) continue;
        const span = axis === "row" ? g.cell?.rowSpan || 1 : g.cell?.colSpan || 1;
        if (span <= 1) continue;
        const s = axis === "row" ? r : c;
        if (s < at && at <= s + span - 1) {
          alert(axis === "row" ? "插入位置与跨行合并单元格冲突，请先拆分" : "插入位置与跨列合并单元格冲突，请先拆分");
          return true;
        }
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // 样式面板（右侧固定；选中单格时显示样式控件，其余显示提示）
  // --------------------------------------------------------------------------
  let stylePanel = null;
  function refreshStylePanel() {
    if (stylePanel) stylePanel.remove();
    stylePanel = renderStylePanel();
    container.querySelector(".table-body")?.appendChild(stylePanel);
  }

  function renderStylePanel() {
    const panel = document.createElement("div");
    panel.className = "style-panel";

    const s = grid.getSel();
    if (!s || s.r1 != null) {
      const hint = document.createElement("div");
      hint.className = "prop-hint";
      hint.textContent = "单击选中单元格后可编辑样式；拖拽选择区域后可合并/删除。";
      panel.appendChild(hint);
      return panel;
    }
    const cell = gd[s.r]?.[s.c]?.cell;
    if (!cell) return panel;

    const set = (fn) => { fn(cell); commit(); render(); };
    // 控件工厂：直接提交（表格面板无需 focus/blur 事务），共用 fields.js 实现
    const h = fieldHandlers({ theme: () => editorTheme() });
    const tsKeys = Object.keys(editorTheme()?.textStyles || {});
    const groups = [
      {
        title: "文字",
        fields: [
          { kind: "checks", items: [
            { label: "粗体", get: () => !!cell.bold, set: (v) => set((c) => { c.bold = v; }) },
            { label: "斜体", get: () => !!cell.italic, set: (v) => set((c) => { c.italic = v; }) },
          ] },
          { kind: "num", label: "字号", min: 6, max: 72,
            get: () => cell.fontSize || 13,
            set: (v) => set((c) => { c.fontSize = Number(v); }) },
          { kind: "color", label: "字色",
            get: () => cell.color || "$text",
            set: (v) => set((c) => { v ? (c.color = v) : delete c.color; }) },
          { kind: "color", label: "高亮",
            get: () => cell.backgroundColor || "",
            set: (v) => set((c) => { v ? (c.backgroundColor = v) : delete c.backgroundColor; }) },
        ],
      },
      {
        title: "外观",
        fields: [
          { kind: "color", label: "填充",
            get: () => cell.fill?.color || "",
            set: (v) => set((c) => { v ? (c.fill = { type: "solid", color: v }) : delete c.fill; }) },
        ],
      },
      {
        title: "对齐",
        fields: [
          { kind: "select", label: "水平", options: H_ALIGNS,
            get: () => cell.align?.[0] || "left",
            set: (v) => set((c) => { c.align = [v || "left", c.align?.[1] || "middle"]; }) },
          { kind: "select", label: "垂直", options: V_ALIGNS,
            get: () => cell.align?.[1] || "middle",
            set: (v) => set((c) => { c.align = [c.align?.[0] || "left", v || "middle"]; }) },
        ],
      },
      {
        title: "引用",
        fields: [
          { kind: "select", label: "textStyle", options: [["", "（无）"], ...tsKeys.map((k) => [k, `$${k}`])],
            get: () => cell.textStyle || "",
            set: (v) => set((c) => { v ? (c.textStyle = v) : delete c.textStyle; }) },
        ],
      },
    ];
    groups.forEach((g) => panel.appendChild(renderGroup(g, h)));
    return panel;
  }

  function syncDims(el) {
    const rows = el.rows || [];
    const cols = colCount();
    if (!Array.isArray(el.columnWidths) || el.columnWidths.length !== cols) {
      el.columnWidths = Array.from({ length: cols }, () => 1 / cols);
    }
    // rowHeights 不自动补全：缺省 = 行高 auto（由排版引擎按内容计算）；
    // 仅在用户通过「行高比例」对话框显式设置时写入
  }

  render();
  showDialog("表格编辑", container);
  // 加宽对话框（表格 + 右侧样式面板）
  const dlg = container.closest(".dialog");
  if (dlg) dlg.style.width = "min(880px, 96vw)";
}

/** 行高/列宽比例编辑对话框（滑块 + 数字；拖动一项按比例缩放其余项，保持和 = 1）。 */
function editDims(el, commit, rerender) {
  // 用户显式设置行高：缺省时初始化为均分（写入 el.rowHeights，转为受控最小行高）
  if (!Array.isArray(el.rowHeights)) {
    const n = Math.max(1, Array.isArray(el.rows) ? el.rows.length : 1);
    el.rowHeights = Array.from({ length: n }, () => 1 / n);
  }
  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:12px;min-width:340px;";
  const mk = (label, dims, onSet) => {
    const wrap = document.createElement("div");
    const title = document.createElement("div");
    title.style.cssText = "font-weight:600;margin-bottom:6px;font-size:13px;";
    title.textContent = label;
    const rows = dims.map((v, i) => {
      const r = document.createElement("div");
      r.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";
      const idx = document.createElement("span");
      idx.style.cssText = "width:44px;flex:none;font-size:12px;color:#6b7280;";
      idx.textContent = i === 0 ? "表头" : `第 ${i + 1} 项`;
      const range = document.createElement("input");
      range.type = "range";
      range.min = "1";
      range.max = "100";
      range.step = "1";
      range.value = String(Math.round(v * 100));
      range.style.cssText = "flex:1;min-width:0;";
      const num = document.createElement("input");
      num.type = "number";
      num.min = "1";
      num.max = "100";
      num.step = "1";
      num.value = String(Math.round(v * 100));
      num.style.cssText = "width:52px;flex:none;";
      num.title = "百分比";
      const apply = (pct) => {
        const next = Math.min(99, Math.max(1, Number(pct) || 1)) / 100;
        const old = dims[i];
        if (Math.abs(old - next) < 0.001) return;
        // 保持和 = 1：其余项等比缩放
        const others = dims.reduce((a, x, j) => a + (j === i ? 0 : x), 0);
        if (others > 0) {
          const scale = (1 - next) / others;
          dims.forEach((x, j) => { if (j !== i) dims[j] = Math.min(0.99, Math.max(0.01, x * scale)); });
        }
        dims[i] = next;
        refreshAll();
        onSet();
      };
      range.addEventListener("input", () => apply(range.value));
      num.addEventListener("change", () => apply(num.value));
      r.append(idx, range, num);
      return { r, range, num };
    });
    const refreshAll = () => {
      rows.forEach(({ range, num }, i) => {
        range.value = String(Math.round(dims[i] * 100));
        num.value = String(Math.round(dims[i] * 100));
      });
    };
    wrap.append(title);
    rows.forEach(({ r }) => wrap.appendChild(r));
    return wrap;
  };
  const dimsChanged = () => {
    validateDims(el.columnWidths, "columnWidths");
    validateDims(el.rowHeights, "rowHeights");
    commit();
    rerender();
  };
  body.append(
    mk("列宽比例（百分比，和 = 100%）", el.columnWidths, dimsChanged),
    mk("行高比例（百分比，和 = 100%）", el.rowHeights, dimsChanged)
  );
  showDialog("行高 / 列宽", body);
}
