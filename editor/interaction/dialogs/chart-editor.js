// ============================================================================
// editor/dialogs/chart-editor.js — 图表数据编辑器
// ----------------------------------------------------------------------------
// 类 Excel 数据表：列名/数据行编辑、系列管理、类型切换（encode 语义重映射）。
// 共用控件来自 ./base.js（showDialog / buildCellInput / row / select / button）。
// ============================================================================

import { CHART_META, CHART_TYPE_ORDER } from "../../core/chart.js";
import { themeChartPalette } from "../../core/theme.js";
import { showDialog, buildCellInput, row, select, button } from "./base.js";

const SEMANTIC_KEYS = {
  x: ["x", "category", "date"],
  y: ["y", "value"],
  category: ["category", "x"],
  value: ["value", "y"],
  size: ["size"],
  high: ["high"],
  low: ["low"],
  close: ["close"],
  open: ["open"],
  isTotal: ["isTotal"],
  parent: ["parent"],
  source: ["source"],
  target: ["target"],
  flow: ["flow"],
};

/** 按目标类型元数据重映射 encode（保留已有列引用，自动对齐默认列名）。 */
function remapEncode(oldEncode, meta) {
  const out = {};
  for (const key of Object.keys(meta.encode)) {
    const cand = SEMANTIC_KEYS[key] || [key];
    const hit = cand.map((k) => oldEncode[k]).find((v) => v != null);
    out[key] = hit ?? meta.encode[key];
  }
  return out;
}



// ----------------------------------------------------------------------------
// 图表编辑器
// ----------------------------------------------------------------------------
export function openChartEditor(el, { theme, onChange }) {
  const container = document.createElement("div");
  container.className = "chart-editor";

  // 类型（切换时同步系列 encode，保证数据列映射不丢失）
  const curType = el.series?.[0]?.type || "bar";
  const typeRow = row(
    "图表类型",
    select(CHART_TYPE_ORDER.map((t) => [t, CHART_META[t].label]), curType, (v) => {
      const meta = CHART_META[v];
      for (const s of el.series || []) {
        s.type = v;
        s.encode = remapEncode(s.encode || {}, meta);
      }
      renderSeries();
      onChange();
    })
  );
  container.appendChild(typeRow);

  // 数据标签开关
  const labelRow = document.createElement("div");
  labelRow.className = "editor-check";
  const labelChk = document.createElement("input");
  labelChk.type = "checkbox";
  labelChk.checked = el.dataLabels !== false;
  labelChk.addEventListener("change", () => {
    el.dataLabels = labelChk.checked;
    onChange();
  });
  const labelTxt = document.createElement("span");
  labelTxt.textContent = "显示数据标签（官方默认关）";
  labelRow.appendChild(labelChk);
  labelRow.appendChild(labelTxt);
  container.appendChild(labelRow);

  // 数据表
  const dataBox = document.createElement("div");
  dataBox.className = "editor-section";
  const dataTitle = document.createElement("div");
  dataTitle.className = "editor-section-title";
  dataTitle.textContent = "数据";
  dataBox.appendChild(dataTitle);
  const grid = document.createElement("div");
  grid.className = "table-wrap";
  dataBox.appendChild(grid);
  container.appendChild(dataBox);

  // 系列
  const seriesBox = document.createElement("div");
  seriesBox.className = "editor-section";
  const seriesTitle = document.createElement("div");
  seriesTitle.className = "editor-section-title";
  seriesTitle.textContent = "系列";
  seriesBox.appendChild(seriesTitle);
  const seriesList = document.createElement("div");
  seriesList.className = "series-list";
  seriesBox.appendChild(seriesList);
  container.appendChild(seriesBox);

  const addSeriesBtn = button("＋ 添加系列", () => {
    el.series ||= [];
    const type = el.series[0]?.type || "bar";
    const meta = CHART_META[type];
    const valCol = findUnusedValCol(el);
    const valKey = Object.keys(meta.encode).find((k) => !["x", "category", "date", "source", "target"].includes(k)) || "y";
    el.series.push({
      type,
      encode: { ...meta.encode, [valKey]: valCol },
      name: `系列${el.series.length + 1}`,
    });
    if (el.data && valCol && !el.data.cols.includes(valCol)) {
      el.data.cols.push(valCol);
      for (const row of el.data.rows || []) row.push(null);
    }
    renderAll();
    onChange();
  });
  container.appendChild(addSeriesBtn);

  function renderDataGrid() {
    grid.innerHTML = "";
    const data = (el.data ||= { cols: [], rows: [] });
    if (!data.cols.length) data.cols = ["x", "y"];
    if (!data.rows.length) data.rows = [["", ""]];

    const table = document.createElement("table");
    table.className = "data-table";

    // 表头行（列名 + 删列）
    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "corner";
    headTr.appendChild(corner);
    data.cols.forEach((colName, c) => {
      const th = document.createElement("th");
      const wrap = document.createElement("div");
      wrap.className = "cell-edit";
      wrap.appendChild(
        buildCellInput(colName, `列 ${c + 1}`, () => {
          renameColumn(el, c, wrap.querySelector("input").value);
          renderAll();
          onChange();
        })
      );
      if (data.cols.length > 2) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "col-del";
        del.textContent = "✕";
        del.title = "删除列";
        del.onclick = () => {
          removeColumn(el, c);
          renderAll();
          onChange();
        };
        wrap.appendChild(del);
      }
      th.appendChild(wrap);
      headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    table.appendChild(thead);

    // 数据行（行首删除 + 单元格）
    const tbody = document.createElement("tbody");
    data.rows.forEach((row, r) => {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td");
      td0.className = "row-del";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "row-del-btn";
      delBtn.textContent = "✕";
      delBtn.title = "删除行";
      delBtn.onclick = () => {
        data.rows.splice(r, 1);
        renderAll();
        onChange();
      };
      td0.appendChild(delBtn);
      tr.appendChild(td0);
      data.cols.forEach((_, c) => {
        const td = document.createElement("td");
        td.appendChild(
          buildCellInput(row[c], r === 0 ? "数值" : "", () => {
            row[c] = td.querySelector("input").value;
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
        data.rows.push(data.cols.map(() => null));
        renderAll();
        onChange();
      }),
      button("＋ 加列", () => {
        data.cols.push(`列${data.cols.length + 1}`);
        for (const row of data.rows) row.push(null);
        renderAll();
        onChange();
      })
    );
    grid.appendChild(ops);
  }

  function renderSeries() {
    seriesList.innerHTML = "";
    const palette = themeChartPalette(theme);
    (el.series || []).forEach((s, i) => {
      const wrap = document.createElement("div");
      wrap.className = "series-item";
      const nameInput = document.createElement("input");
      nameInput.value = s.name || "";
      nameInput.placeholder = `系列 ${i + 1}`;
      nameInput.addEventListener("change", () => { s.name = nameInput.value; onChange(); });
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      const hex = String(s.color || palette[i % palette.length] || "#2563eb").replace("#", "");
      colorInput.value = /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : "#2563eb";
      colorInput.addEventListener("change", () => { s.color = colorInput.value; onChange(); });
      const valKey = Object.keys(CHART_META[s.type]?.encode || {}).find((k) => !["x", "category", "date", "source", "target"].includes(k)) || "y";
      const valSel = select(
        (el.data?.cols || []).map((c, idx) => [String(idx), c]),
        String(Math.max(0, el.data?.cols.indexOf(s.encode?.[valKey] ?? ""))),
        (v) => {
          const col = el.data?.cols[Number(v)];
          if (col) { s.encode ||= {}; s.encode[valKey] = col; }
          onChange();
        }
      );
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-sm btn-ghost";
      del.textContent = "✕";
      del.title = "删除系列";
      del.onclick = () => {
        el.series.splice(i, 1);
        renderAll();
        onChange();
      };
      wrap.append(nameInput, colorInput, valSel, del);
      seriesList.appendChild(wrap);
    });
    if (!el.series || !el.series.length) {
      const hint = document.createElement("div");
      hint.className = "prop-hint";
      hint.textContent = "暂无系列";
      seriesList.appendChild(hint);
    }
  }

  function renderAll() {
    renderDataGrid();
    renderSeries();
  }
  renderAll();

  showDialog("图表数据编辑", container);
}

function findUnusedValCol(el) {
  const data = el.data || { cols: [] };
  const used = new Set((el.series || []).map((s) => s.encode?.y || s.encode?.value));
  let n = data.cols.length + 1;
  while (used.has(`y${n}`)) n += 1;
  return `y${n}`;
}

function renameColumn(el, idx, newName) {
  const data = el.data;
  if (!data || !data.cols[idx]) return;
  const old = data.cols[idx];
  if (old === newName || !newName) return;
  data.cols[idx] = newName;
  for (const s of el.series || []) {
    for (const key of Object.keys(SEMANTIC_KEYS)) {
      if (s.encode?.[key] === old) s.encode[key] = newName;
    }
  }
}

function removeColumn(el, idx) {
  const data = el.data;
  if (!data) return;
  const removed = data.cols[idx];
  data.cols.splice(idx, 1);
  for (const row of data.rows || []) row.splice(idx, 1);
  for (const s of el.series || []) {
    for (const key of Object.keys(SEMANTIC_KEYS)) {
      if (s.encode?.[key] === removed) {
        const first = data.cols[0];
        s.encode[key] = first;
      }
    }
  }
}

// ----------------------------------------------------------------------------
// 表格编辑器
