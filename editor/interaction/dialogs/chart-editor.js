// ============================================================================
// editor/interaction/dialogs/chart-editor.js — chart content editor (minimal)
// ----------------------------------------------------------------------------
// Kept (editor-ux §4.3): Excel-style data grid, column rename (encode remap),
// chart type switch (semantic remap + coexistence warnings), series add/remove,
// value-column selection, series name, series color.
// Removed with 3.0: chart / data-label / axis / legend / series style panels,
// bubble size, line styles, smooth, stack and every other advanced option.
// Chart size/position stay on the canvas (charts resize but never rotate);
// export routing is unchanged (CHART_META.route).
// ============================================================================

import { button } from "./base.js";
import { createExcelGrid } from "../excel-grid.js";
import * as ui from "../../ui.js";
import { themeSwatches } from "../fields.js";
import {
  CHART_META,
  CHART_TYPE_ORDER,
  colLetter,
  remapEncode,
  resolveColor,
  themeChartPalette,
  validateChartSeries,
} from "../../../packages/model/index.js";

/** Find an unused value-column name (y2/y3…). */
function findUnusedValCol(el) {
  const data = el.data || { cols: [] };
  const used = new Set((el.series || []).map((s) => s.encode?.y || s.encode?.value));
  let n = data.cols.length + 1;
  while (used.has(`y${n}`)) n += 1;
  return `y${n}`;
}

export function openChartEditor(el, { theme, onChange, beginChange, onDone, dialogs } = {}) {
  const container = document.createElement("div");
  container.className = "chart-editor";

  // Live editor theme (a getter from app/api.js), falling back to the theme captured when the dialog opened
  const themeOf = typeof theme === "function" ? theme : () => theme;
  const editorTheme = () => themeOf();
  const palette = () => themeChartPalette(editorTheme());
  const commit = () => onChange?.();
  const curType = () => el.series?.[0]?.type || "bar";
  const metaOf = (t) => CHART_META[t] || CHART_META.bar;
  /** Value channel key (for the series list's "value column" dropdown and new series). */
  const valKeyOf = (t) =>
    Object.keys(metaOf(t).encode).find((k) => !["x", "category", "date", "source", "target"].includes(k)) || "y";

  // Data (tolerant of an empty table)
  const data = (el.data ||= { cols: [], rows: [] });
  if (!data.cols.length) data.cols = ["x", "y"];
  if (!data.rows.length) data.rows = [["", ""]];
  const colCount = () => data.cols.length;
  const rowCount = () => data.rows.length;

  let curSeries = 0;

  // -- Excel-style data grid (shared interaction/excel-grid.js) --
  const grid = createExcelGrid({
    dialogs,
    getRows: rowCount,
    getCols: colCount,
    cellValue: (r, c) => String(data.rows[r]?.[c] ?? ""),
    onCellChange: (r, c, v) => {
      beginChange?.();
      data.rows[r][c] = v;
      commit();
    },
    colHeadContent: (c) => {
      const wrap = document.createElement("div");
      wrap.className = "chart-col-head";
      const letter = document.createElement("div");
      letter.className = "col-letter";
      letter.textContent = colLetter(c);
      const input = document.createElement("input");
      input.type = "text";
      input.value = data.cols[c] ?? "";
      input.placeholder = "列名";
      input.addEventListener("change", () => {
        beginChange?.();
        renameColumn(c, input.value);
        setAndRefresh();
      });
      wrap.append(letter, input);
      return wrap;
    },
    onInsertRows: (at, n) => {
      beginChange?.();
      data.rows.splice(at, 0, ...Array.from({ length: n }, () => data.cols.map(() => null)));
      commit();
    },
    onInsertCols: (at, n) => {
      beginChange?.();
      for (const r of data.rows) r.splice(at, 0, ...Array.from({ length: n }, () => null));
      commit();
    },
    onDeleteRows: (r1, r2) => {
      beginChange?.();
      data.rows.splice(r1, r2 - r1 + 1);
      commit();
    },
    onDeleteCols: (c1, c2) => {
      beginChange?.();
      const removed = data.cols.slice(c1, c2 + 1);
      for (const r of data.rows) r.splice(c1, c2 - c1 + 1);
      data.cols.splice(c1, c2 - c1 + 1);
      // Series encode referencing a deleted column → reset to the first column (no dangling refs)
      for (const s of el.series || []) {
        for (const k of Object.keys(s.encode || {})) {
          if (removed.includes(s.encode[k])) s.encode[k] = data.cols[0];
        }
      }
      commit();
    },
  });

  // -- Layout skeleton --
  const topRow = document.createElement("div");
  topRow.className = "chart-top";
  const warnBox = document.createElement("div");
  warnBox.className = "chart-warn";
  warnBox.hidden = true;

  const main = document.createElement("div");
  main.className = "chart-main";
  container.append(topRow, main);

  // On every change: commit + full re-render (a data-cell input change only commits, so focus is not lost)
  const setAndRefresh = () => { commit(); renderAll(); };

  // --------------------------------------------------------------------------
  // Top: type switch + add series + coexistence warnings
  // --------------------------------------------------------------------------
  function renderTop() {
    topRow.innerHTML = "";
    const typeLabel = document.createElement("span");
    typeLabel.className = "prop-label";
    typeLabel.textContent = "图表类型";
    const typeSel = ui.selectInput(
      CHART_TYPE_ORDER.map((t) => [t, CHART_META[t].label]),
      curType(),
      (v) => {
        const meta = metaOf(v);
        beginChange?.();
        for (const s of el.series || []) {
          s.type = v;
          s.encode = remapEncode(s.encode || {}, meta);
          if (v !== "pie" && s.innerRadius != null) delete s.innerRadius;
        }
        curSeries = Math.min(curSeries, Math.max(0, (el.series?.length || 1) - 1));
        setAndRefresh();
      }
    );
    const addBtn = button("＋ 添加系列", () => {
      beginChange?.();
      el.series ||= [];
      const type = curType();
      const meta = metaOf(type);
      const valCol = findUnusedValCol(el);
      const valKey = valKeyOf(type);
      el.series.push({ type, encode: { ...meta.encode, [valKey]: valCol }, name: `系列${el.series.length + 1}` });
      if (!data.cols.includes(valCol)) {
        data.cols.push(valCol);
        for (const r of data.rows) r.push(null);
      }
      curSeries = el.series.length - 1;
      setAndRefresh();
    });
    addBtn.title = "添加一个系列（自动新增数据列）";
    topRow.append(typeLabel, typeSel, addBtn);

    // Type coexistence/structure warnings
    const warns = validateChartSeries(el);
    warnBox.hidden = warns.length === 0;
    warnBox.innerHTML = "";
    for (const w of warns) {
      const div = document.createElement("div");
      div.textContent = w.replace("[chart] ", "");
      warnBox.appendChild(div);
    }
  }

  // --------------------------------------------------------------------------
  // Data table — implemented by the shared grid component
  // --------------------------------------------------------------------------
  main.appendChild(grid.root);
  main.appendChild(warnBox);
  /** Column rename: also updates every series encode reference. */
  function renameColumn(c, newName) {
    const old = data.cols[c];
    if (!old || old === newName || !newName) return;
    data.cols[c] = newName;
    for (const s of el.series || []) {
      for (const key of Object.keys(s.encode || {})) {
        if (s.encode[key] === old) s.encode[key] = newName;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Series list: name / value column / color / delete (the only style kept)
  // --------------------------------------------------------------------------
  const seriesBox = document.createElement("div");
  seriesBox.className = "series-box";
  main.appendChild(seriesBox);

  function renderSeries() {
    seriesBox.innerHTML = "";
    const title = document.createElement("div");
    title.className = "series-title";
    title.textContent = "系列";
    seriesBox.appendChild(title);
    const list = document.createElement("div");
    list.className = "series-list";

    (el.series || []).forEach((s, i) => {
      const wrap = document.createElement("div");
      wrap.className = "series-item" + (i === curSeries ? " series-active" : "");
      wrap.title = "点击选中此系列";
      const t = s.type || curType();
      // Main color field: bar/scatter/bubble/pie → color; line/area/radar → lineColor
      const hasMainColor = ["bar", "scatter", "bubble", "pie", "line", "area", "radar"].includes(t);
      if (hasMainColor) {
        const colorKey = ["line", "area", "radar"].includes(t) ? "lineColor" : "color";
        const cf = ui.colorField(
          s[colorKey] || palette()[i % palette().length],
          (v) => {
            beginChange?.();
            if (v) s[colorKey] = v;
            else delete s[colorKey];
            setAndRefresh();
          },
          { resolve: (val) => resolveColor(editorTheme(), val), swatches: themeSwatches(editorTheme()) }
        );
        cf.title = "系列颜色（留空=主题色板自动）";
        wrap.appendChild(cf);
      }
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = s.name || "";
      nameInput.placeholder = `系列 ${i + 1}`;
      nameInput.title = "系列名称";
      nameInput.addEventListener("change", () => {
        beginChange?.();
        s.name = nameInput.value;
        commit();
      });
      wrap.appendChild(nameInput);

      const valSel = ui.selectInput(
        data.cols.map((c, idx) => [String(idx), c]),
        String(Math.max(0, data.cols.indexOf(s.encode?.[valKeyOf(t)] ?? ""))),
        (v) => {
          beginChange?.();
          const col = data.cols[Number(v)];
          if (col) {
            s.encode ||= {};
            s.encode[valKeyOf(t)] = col;
          }
          setAndRefresh();
        },
        { title: `值列（${valKeyOf(t)}）` }
      );
      wrap.appendChild(valSel);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-sm btn-ghost";
      del.textContent = "✕";
      del.title = "删除系列";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        beginChange?.();
        el.series.splice(i, 1);
        curSeries = Math.min(curSeries, Math.max(0, (el.series.length || 1) - 1));
        setAndRefresh();
      });
      wrap.appendChild(del);

      wrap.addEventListener("click", (e) => {
        // Clicks inside controls (swatch/input/select/delete) do not trigger a selection rebuild
        if (e.target.closest("input,select,button,.color-pop")) return;
        if (curSeries !== i) {
          curSeries = i;
          renderAll();
        }
      });
      list.appendChild(wrap);
    });

    if (!el.series || !el.series.length) {
      const hint = document.createElement("div");
      hint.className = "prop-hint";
      hint.textContent = "暂无系列——点击上方「＋ 添加系列」";
      list.appendChild(hint);
    }
    seriesBox.appendChild(list);
  }

  function renderAll() {
    renderTop();
    grid.render();
    renderSeries();
  }
  renderAll();

  dialogs.showDialog("图表编辑", container, { onClose: () => onDone?.() });
  // Widen the dialog (data table + series list)
  const dlg = container.closest(".dialog");
  if (dlg) dlg.style.width = "min(880px, 96vw)";
}
