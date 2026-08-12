// ============================================================================
// editor/interaction/dialogs/chart-editor.js — 图表编辑器
// ----------------------------------------------------------------------------
// 与表格编辑器同构（Excel 式 + 声明式样式面板）：
//   - 布局：顶部类型行 / 主区（数据工具条 + 数据表 + 系列列表）/ 右侧样式面板
//   - 数据表：Excel 式行列头（数字/字母）、点击选行/列、拖拽选区、方向插入行列
//   - 系列列表：点击选中 → 右侧"系列"组联动
//   - 样式面板：fields.js 声明式分组——图表 / 数据标签 / 坐标轴 / 系列（随类型）
//   - 类型切换：语义键重映射（remapEncode）+ 共存约束警告（validateChartSeries）
// ============================================================================

import { CHART_META, CHART_TYPE_ORDER, validateChartSeries, remapEncode, DATA_LABEL_CONTENTS } from "../../core/chart.js";
import { resolveColor, themeChartPalette } from "../../core/theme.js";
import { showDialog, buildCellInput, button } from "./base.js";
import { renderGroup, themeSwatches, fieldHandlers } from "../fields.js";
import { createExcelGrid } from "../excel-grid.js";
import * as ui from "../../ui.js";

const LEGEND_POS = [["bottom", "底部"], ["top", "顶部"], ["right", "右侧"], ["left", "左侧"]];
const LABEL_CONTENT = [["value", "数值"], ["percentage", "百分比"], ["category", "分类名"]];
const NUMBER_FMTS = [
  ["", "无"], ["0", "整数"], ["0.0", "一位小数"], ["0%", "百分比"],
  ["0.0%", "一位百分比"], ["#,##0", "千分位"], ["0.0E+00", "科学计数"],
];
const LINE_STYLES = [["solid", "实线"], ["dash", "虚线"], ["dot", "点线"]];
const STACK_OPTS = [["", "无"], ["normal", "普通堆叠"], ["percent", "百分比堆叠"]];
const MARKER_SHAPES = [["circle", "圆点"], ["rect", "方块"], ["diamond", "菱形"], ["triangle", "三角"]];
const SIZE_SCALES = [["sqrt", "平方根"], ["linear", "线性"], ["log", "对数"]];
const NODE_ALIGNS = [["justify", "两端对齐"], ["left", "左对齐"], ["right", "右对齐"]];

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

/** 找未占用的数值列名（y2/y3…）。 */
function findUnusedValCol(el) {
  const data = el.data || { cols: [] };
  const used = new Set((el.series || []).map((s) => s.encode?.y || s.encode?.value));
  let n = data.cols.length + 1;
  while (used.has(`y${n}`)) n += 1;
  return `y${n}`;
}

// ----------------------------------------------------------------------------
// 图表编辑器
// ----------------------------------------------------------------------------
export function openChartEditor(el, { theme, onChange }) {
  const container = document.createElement("div");
  container.className = "chart-editor";

  const editorTheme = () => window.__pptdEditor?.state?.theme || theme;
  const palette = () => themeChartPalette(editorTheme());
  const commit = () => onChange?.();
  const curType = () => el.series?.[0]?.type || "bar";
  const metaOf = (t) => CHART_META[t] || CHART_META.bar;
  /** 值通道键（系列列表的"值列"下拉与添加系列的默认列）。 */
  const valKeyOf = (t) =>
    Object.keys(metaOf(t).encode).find((k) => !["x", "category", "date", "source", "target"].includes(k)) || "y";

  // 数据（宽容空表）
  const data = (el.data ||= { cols: [], rows: [] });
  if (!data.cols.length) data.cols = ["x", "y"];
  if (!data.rows.length) data.rows = [["", ""]];
  const colCount = () => data.cols.length;
  const rowCount = () => data.rows.length;

  let curSeries = 0;

  // —— Excel 式数据网格（共用 interaction/excel-grid.js，与表格编辑器同一实现）——
  const grid = createExcelGrid({
    getRows: rowCount,
    getCols: colCount,
    cellValue: (r, c) => String(data.rows[r]?.[c] ?? ""),
    onCellChange: (r, c, v) => {
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
        renameColumn(c, input.value);
        setAndRefresh();
      });
      wrap.append(letter, input);
      return wrap;
    },
    onInsertRows: (at, n) => {
      data.rows.splice(at, 0, ...Array.from({ length: n }, () => data.cols.map(() => null)));
      commit();
    },
    onInsertCols: (at, n) => {
      for (const r of data.rows) r.splice(at, 0, ...Array.from({ length: n }, () => null));
      commit();
    },
    onDeleteRows: (r1, r2) => {
      data.rows.splice(r1, r2 - r1 + 1);
      commit();
    },
    onDeleteCols: (c1, c2) => {
      const removed = data.cols.slice(c1, c2 + 1);
      for (const r of data.rows) r.splice(c1, c2 - c1 + 1);
      data.cols.splice(c1, c2 - c1 + 1);
      // 系列 encode 引用被删列 → 重置到首列（不悬空）
      for (const s of el.series || []) {
        for (const k of Object.keys(s.encode || {})) {
          if (removed.includes(s.encode[k])) s.encode[k] = data.cols[0];
        }
      }
      commit();
    },
  });

  // —— 布局骨架 ——
  const topRow = document.createElement("div");
  topRow.className = "chart-top";
  const warnBox = document.createElement("div");
  warnBox.className = "chart-warn";
  warnBox.hidden = true;

  const bodyRow = document.createElement("div");
  bodyRow.className = "chart-body";
  const main = document.createElement("div");
  main.className = "chart-main";
  const panel = document.createElement("div");
  panel.className = "style-panel";
  bodyRow.append(main, panel);
  container.append(topRow, bodyRow);

  // 每次变更：提交 + 全量重渲（数据格 input 的 change 只提交，避免丢焦点）
  const setAndRefresh = () => { commit(); renderAll(); };

  // --------------------------------------------------------------------------
  // 顶部：类型切换 + 添加系列 + 共存警告
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

    // 类型共存/结构警告（官方 §5.4）
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
  // 数据表（Excel 式：数字行头 / 字母列头 / 拖拽选区 / 方向插入）——组件实现
  // --------------------------------------------------------------------------
  const gridBox = grid.root;
  main.appendChild(gridBox);
  /** 列重命名：同步更新各系列 encode 引用。 */
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
  // 系列列表（点击选中 → 右侧样式面板联动）
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
      wrap.title = "点击选中此系列，右侧面板编辑其样式";
      const t = s.type || curType();
      // 主色字段：bar/scatter/bubble/pie → color；line/area/radar → lineColor
      const hasMainColor = ["bar", "scatter", "bubble", "pie", "line", "area", "radar"].includes(t);
      if (hasMainColor) {
        const colorKey = ["line", "area", "radar"].includes(t) ? "lineColor" : "color";
        const cf = ui.colorField(
          s[colorKey] || palette()[i % palette().length],
          (v) => {
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
        s.name = nameInput.value;
        commit();
      });
      wrap.appendChild(nameInput);

      const valSel = ui.selectInput(
        data.cols.map((c, idx) => [String(idx), c]),
        String(Math.max(0, data.cols.indexOf(s.encode?.[valKeyOf(t)] ?? ""))),
        (v) => {
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
        el.series.splice(i, 1);
        curSeries = Math.min(curSeries, Math.max(0, (el.series.length || 1) - 1));
        setAndRefresh();
      });
      wrap.appendChild(del);

      wrap.addEventListener("click", (e) => {
        // 控件（色块/输入/下拉/删除）内的点击不触发选中重建
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

  // --------------------------------------------------------------------------
  // 样式面板（声明式分组，fields.js 渲染器；随类型与选中系列联动）
  // --------------------------------------------------------------------------
  const h = fieldHandlers({ theme: () => editorTheme() });

  /** 数值轴对象安全获取（xAxis/yAxis/spokeAxis 共享）。 */
  const axisObj = (el, key) => {
    if (el[key] === false || el[key] == null || typeof el[key] !== "object") el[key] = {};
    return el[key];
  };

  function chartGroup() {
    const t = curType();
    const fields = [
      { kind: "checks", items: [
        { label: "显示图例", get: () => el.legend !== false,
          set: (v) => { if (v) { if (el.legend === false) el.legend = {}; } else el.legend = false; setAndRefresh(); } },
      ] },
      { kind: "select", label: "图例位置", options: LEGEND_POS,
        get: () => (typeof el.legend === "object" ? el.legend.position : "") || "bottom",
        set: (v) => { const o = axisObj(el, "legend"); o.position = v; setAndRefresh(); } },
      { kind: "num", label: "图例字号", min: 8, max: 24,
        get: () => (typeof el.legend === "object" ? el.legend.fontSize : "") || 11,
        set: (v) => { axisObj(el, "legend").fontSize = Number(v); setAndRefresh(); } },
      { kind: "color", label: "图例颜色",
        get: () => (typeof el.legend === "object" ? el.legend.color : "") || "",
        set: (v) => { const o = axisObj(el, "legend"); v ? (o.color = v) : delete o.color; setAndRefresh(); } },
    ];
    if (t === "bar") {
      fields.push(
        { kind: "num", label: "柱宽", min: 0.1, max: 1, step: 0.05,
          get: () => el.barWidth ?? 0.6, set: (v) => { el.barWidth = Number(v); setAndRefresh(); } },
        { kind: "num", label: "柱间距", min: 0, max: 1, step: 0.05,
          get: () => el.barGap ?? 0, set: (v) => { el.barGap = Number(v); setAndRefresh(); } },
        { kind: "num", label: "分类间距", min: 0, max: 1, step: 0.05,
          get: () => el.categoryGap ?? 0.2, set: (v) => { el.categoryGap = Number(v); setAndRefresh(); } }
      );
    }
    return { title: "图表", fields };
  }

  function labelGroup() {
    const t = curType();
    const o = () => (typeof el.dataLabels === "object" ? el.dataLabels : (el.dataLabels = {}));
    return {
      title: "数据标签",
      fields: [
        { kind: "checks", items: [
          { label: "显示", get: () => el.dataLabels !== false,
            set: (v) => { if (v) { if (el.dataLabels === false || el.dataLabels == null) el.dataLabels = {}; } else el.dataLabels = false; setAndRefresh(); } },
        ] },
        { kind: "select", label: "内容", options: LABEL_CONTENT.filter(([k]) => (DATA_LABEL_CONTENTS[t] || ["value"]).includes(k)),
          get: () => o().content || "value",
          set: (v) => { o().content = v; setAndRefresh(); } },
        { kind: "select", label: "数字格式", options: NUMBER_FMTS,
          get: () => o().numberFormat || "",
          set: (v) => { v ? (o().numberFormat = v) : delete o().numberFormat; setAndRefresh(); } },
        { kind: "num", label: "字号", min: 8, max: 24,
          get: () => o().fontSize || 10,
          set: (v) => { o().fontSize = Number(v); setAndRefresh(); } },
        { kind: "color", label: "颜色",
          get: () => o().color || "",
          set: (v) => { v ? (o().color = v) : delete o().color; setAndRefresh(); } },
      ],
    };
  }

  function axisGroup(key, title, { minMax = false } = {}) {
    const cfg = () => (el[key] === false ? null : el[key]);
    const obj = () => (el[key] === false || el[key] == null || typeof el[key] !== "object" ? (el[key] = {}) : el[key]);
    const fields = [
      { kind: "checks", items: [
        { label: "显示", get: () => el[key] !== false,
          set: (v) => { if (v) { if (el[key] === false) el[key] = {}; } else el[key] = false; setAndRefresh(); } },
      ] },
      { kind: "text", label: "标题",
        get: () => {
          const t2 = cfg()?.title;
          return typeof t2 === "string" ? t2 : (t2 && t2.text) || "";
        },
        set: (v) => { const o = obj(); v ? (o.title = v) : delete o.title; setAndRefresh(); } },
      { kind: "num", label: "标签字号", min: 8, max: 20,
        get: () => cfg()?.label?.fontSize || 11,
        set: (v) => { const o = obj(); o.label ||= {}; o.label.fontSize = Number(v); setAndRefresh(); } },
      { kind: "color", label: "标签颜色",
        get: () => cfg()?.label?.color || "",
        set: (v) => { const o = obj(); o.label ||= {}; v ? (o.label.color = v) : delete o.label.color; setAndRefresh(); } },
    ];
    if (minMax) {
      fields.push(
        { kind: "num", label: "最小值",
          get: () => (cfg()?.min != null ? cfg().min : ""),
          set: (v) => { const o = obj(); v === "" ? delete o.min : (o.min = Number(v)); setAndRefresh(); } },
        { kind: "num", label: "最大值",
          get: () => (cfg()?.max != null ? cfg().max : ""),
          set: (v) => { const o = obj(); v === "" ? delete o.max : (o.max = Number(v)); setAndRefresh(); } }
      );
    }
    fields.push(
      { kind: "checks", items: [
        { label: "网格线", get: () => !(cfg() && cfg().gridLine === false),
          set: (v) => { const o = obj(); v ? delete o.gridLine : (o.gridLine = false); setAndRefresh(); } },
      ] },
      { kind: "select", label: "网格样式", options: LINE_STYLES,
        get: () => (cfg()?.gridLine && typeof cfg().gridLine === "object" && cfg().gridLine.style) || "solid",
        set: (v) => { const o = obj(); if (o.gridLine === false) delete o.gridLine; o.gridLine ||= {}; v && v !== "solid" ? (o.gridLine.style = v) : delete o.gridLine.style; setAndRefresh(); } }
    );
    return { title, fields };
  }

  function spokeGroup() {
    const cfg = () => (el.spokeAxis && typeof el.spokeAxis === "object" ? el.spokeAxis : null);
    const obj = () => (el.spokeAxis && typeof el.spokeAxis === "object" ? el.spokeAxis : (el.spokeAxis = {}));
    return {
      title: "蛛网轴",
      fields: [
        { kind: "checks", items: [
          { label: "轴线", get: () => !(cfg() && cfg().axisLine === false),
            set: (v) => { const o = obj(); v ? delete o.axisLine : (o.axisLine = false); setAndRefresh(); } },
          { label: "网格线", get: () => !(cfg() && cfg().gridLine === false),
            set: (v) => { const o = obj(); v ? delete o.gridLine : (o.gridLine = false); setAndRefresh(); } },
        ] },
        { kind: "color", label: "网格颜色",
          get: () => (cfg()?.gridLine && typeof cfg().gridLine === "object" ? cfg().gridLine.color : "") || "",
          set: (v) => { const o = obj(); if (o.gridLine === false) delete o.gridLine; o.gridLine ||= {}; v ? (o.gridLine.color = v) : delete o.gridLine.color; setAndRefresh(); } },
        { kind: "num", label: "最大刻度",
          get: () => (cfg()?.max != null ? cfg().max : ""),
          set: (v) => { const o = obj(); v === "" ? delete o.max : (o.max = Number(v)); setAndRefresh(); } },
      ],
    };
  }

  function seriesGroup() {
    const t = curType();
    const s = el.series?.[curSeries];
    if (!s) return null;
    const setS = (fn) => { fn(s); setAndRefresh(); };
    const colorFieldF = (key, label) => {
      const getV = (x) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), x);
      const setV = (x, v) => {
        const parts = key.split(".");
        let o = x;
        for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] ||= {}; o = o[parts[i]]; }
        v ? (o[parts[parts.length - 1]] = v) : delete o[parts[parts.length - 1]];
      };
      return {
        kind: "color", label,
        get: () => getV(s) || "",
        set: (v) => setS((x) => setV(x, v)),
      };
    };
    const borderFields = [
      { kind: "color", label: "边框",
        get: () => s.border?.color || "",
        set: (v) => setS((x) => { x.border ||= {}; v ? (x.border.color = v) : delete x.border.color; }) },
      { kind: "num", label: "边框宽", min: 0, max: 8,
        get: () => s.border?.width ?? 0,
        set: (v) => setS((x) => { x.border ||= {}; x.border.width = Number(v); }) },
    ];
    const markerFields = [
      { kind: "checks", items: [
        { label: "显示标记", get: () => s.marker !== false,
          set: (v) => setS((x) => { if (v) { if (x.marker === false) x.marker = {}; } else x.marker = false; }) },
      ] },
      { kind: "select", label: "标记形状", options: MARKER_SHAPES,
        get: () => (typeof s.marker === "object" && s.marker.shape) || "circle",
        set: (v) => setS((x) => { if (x.marker === false || x.marker == null) x.marker = {}; x.marker.shape = v; }) },
      { kind: "num", label: "标记尺寸", min: 2, max: 16,
        get: () => (typeof s.marker === "object" && s.marker.size) || 8,
        set: (v) => setS((x) => { if (x.marker === false || x.marker == null) x.marker = {}; x.marker.size = Number(v); }) },
    ];
    const lineFields = [
      colorFieldF("lineColor", "线色"),
      { kind: "num", label: "线宽", min: 1, max: 10,
        get: () => s.width ?? 2, set: (v) => setS((x) => { x.width = Number(v); }) },
      { kind: "select", label: "线型", options: LINE_STYLES,
        get: () => s.lineStyle || "solid",
        set: (v) => setS((x) => { v && v !== "solid" ? (x.lineStyle = v) : delete x.lineStyle; }) },
      { kind: "checks", items: [
        { label: "平滑", get: () => !!s.smooth, set: (v) => setS((x) => { v ? (x.smooth = true) : delete x.smooth; }) },
      ] },
      ...markerFields,
    ];
    const stackField = {
      kind: "select", label: "堆叠", options: STACK_OPTS,
      get: () => (s.stack === "percent" ? "percent" : s.stack === "normal" ? "normal" : ""),
      set: (v) => setS((x) => { v ? (x.stack = v) : delete x.stack; }),
    };

    let fields;
    if (t === "line" || t === "area" || t === "radar") {
      fields = [...lineFields];
      if (t === "area") fields.push(colorFieldF("areaColor", "面积色"));
      if (t !== "radar") fields.push(stackField);
    } else if (t === "bar" || t === "scatter" || t === "bubble") {
      fields = [colorFieldF("color", "填充"), ...borderFields];
      if (t === "bar") fields.push(stackField);
      if (t === "bubble") {
        fields.push(
          { kind: "select", label: "尺寸缩放", options: SIZE_SCALES,
            get: () => s.sizeScale || "sqrt",
            set: (v) => setS((x) => { v && v !== "sqrt" ? (x.sizeScale = v) : delete x.sizeScale; }) },
          { kind: "num", label: "最小半径", min: 2, max: 60,
            get: () => s.sizeRange?.[0] ?? 6,
            set: (v) => setS((x) => { x.sizeRange = [Number(v), x.sizeRange?.[1] ?? 48]; }) },
          { kind: "num", label: "最大半径", min: 2, max: 120,
            get: () => s.sizeRange?.[1] ?? 48,
            set: (v) => setS((x) => { x.sizeRange = [x.sizeRange?.[0] ?? 6, Number(v)]; }) }
        );
      }
    } else if (t === "pie") {
      fields = [
        colorFieldF("color", "填充"),
        { kind: "num", label: "内径比例", min: 0, max: 0.9, step: 0.05,
          get: () => s.innerRadius || 0,
          set: (v) => setS((x) => { v > 0 ? (x.innerRadius = Number(v)) : delete x.innerRadius; }) },
        { kind: "num", label: "起始角度", min: 0, max: 360,
          get: () => s.startAngle || 0,
          set: (v) => setS((x) => { v ? (x.startAngle = Number(v)) : delete x.startAngle; }) },
        ...borderFields,
      ];
    } else if (t === "candlestick") {
      fields = [
        colorFieldF("upBars.fill", "上涨色"),
        colorFieldF("downBars.fill", "下跌色"),
      ];
    } else if (t === "waterfall") {
      fields = [
        colorFieldF("totalBars.fill", "总计色"),
        colorFieldF("increaseBars.fill", "上升色"),
        colorFieldF("decreaseBars.fill", "下降色"),
      ];
    } else if (t === "heatmap") {
      fields = [
        { kind: "color", label: "浅端色",
          get: () => (Array.isArray(s.colorScheme) ? s.colorScheme[0] : "") || "",
          set: (v) => setS((x) => { const arr = Array.isArray(x.colorScheme) ? [...x.colorScheme] : ["", ""]; v ? (arr[0] = v) : (arr[0] = ""); arr[0] || arr[1] ? (x.colorScheme = arr) : delete x.colorScheme; }) },
        { kind: "color", label: "深端色",
          get: () => (Array.isArray(s.colorScheme) ? s.colorScheme[1] : "") || "",
          set: (v) => setS((x) => { const arr = Array.isArray(x.colorScheme) ? [...x.colorScheme] : ["", ""]; v ? (arr[1] = v) : (arr[1] = ""); arr[0] || arr[1] ? (x.colorScheme = arr) : delete x.colorScheme; }) },
        { kind: "checks", items: [
          { label: "颜色条", get: () => s.colorbar !== false,
            set: (v) => setS((x) => { if (v) { if (x.colorbar === false) x.colorbar = {}; } else x.colorbar = false; }) },
        ] },
      ];
    } else if (t === "treemap" || t === "sunburst") {
      fields = [
        { kind: "num", label: "层级深度", min: 1, max: 20,
          get: () => s.levels ?? "",
          set: (v) => setS((x) => { v ? (x.levels = Number(v)) : delete x.levels; }) },
      ];
    } else if (t === "sankey") {
      fields = [
        { kind: "select", label: "节点对齐", options: NODE_ALIGNS,
          get: () => s.nodeAlign || "justify",
          set: (v) => setS((x) => { v && v !== "justify" ? (x.nodeAlign = v) : delete x.nodeAlign; }) },
        colorFieldF("fill", "节点色"),
      ];
    } else {
      fields = [];
    }
    return { title: `系列${curSeries + 1}`, fields };
  }

  function renderStylePanel() {
    panel.innerHTML = "";
    const t = curType();
    const meta = metaOf(t);
    const groups = [chartGroup(), labelGroup()];
    if (meta.axes === "cartesian") {
      groups.push(axisGroup("xAxis", "X 轴"), axisGroup("yAxis", "Y 轴", { minMax: true }));
    }
    if (t === "radar") groups.push(spokeGroup());
    const sg = seriesGroup();
    if (sg) groups.push(sg);
    for (const g of groups) panel.appendChild(renderGroup(g, h));
  }

  function renderAll() {
    renderTop();
    grid.render();
    renderSeries();
    renderStylePanel();
  }
  renderAll();

  showDialog("图表编辑", container);
  // 加宽对话框（数据表 + 系列 + 右侧样式面板）
  const dlg = container.closest(".dialog");
  if (dlg) dlg.style.width = "min(960px, 96vw)";
}
