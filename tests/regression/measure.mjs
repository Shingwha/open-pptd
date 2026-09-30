// ============================================================================
// tests/regression/measure.mjs — measure package regression (spec 09 T3 / M1 acceptance)
// ----------------------------------------------------------------------------
// 1. Pure-function determinism / monotonicity / metrics-table ladder / formula
//    closed form / line-height factor API (always runs)
// 2. Cross-check against real DOM: start a headless browser once, compare the pure
//    estimate for 20 representative texts against scrollHeight, print the error
//    distribution, and assert P95(|relative error|) ≤ 8%; table cell height error ≤ 4px.
// No browser → the DOM cross-check prints SKIP (the pure-function part still runs).
// Browser present but the baseline font (Microsoft YaHei) unavailable (e.g. CI runners)
// → SKIP as well: the DOM then renders in a fallback font and is not comparable to the
// font-metrics-driven estimate.
// ============================================================================

import { spawn } from "node:child_process";
import { measureTextRuns, measureCell, measureTable, lineHeightMultiplierFor, createMetricsTable } from "../../packages/measure/index.js";
import { findBrowser, freePort } from "../../packages/renderer/headless/browser.js";
import { connectCdp, sleep } from "../../packages/renderer/headless/cdp.js";

let ok = true;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
};

// ---------------------------------------------------------------------------
// 1. Pure functions
// ---------------------------------------------------------------------------
console.log("=== 1. 纯函数确定性 ===");
const tr = () => measureTextRuns([{ text: "这是一段用于测量换行高度的中文文本，需要足够长以触发多行显示。" }], { fontSize: 18, lineHeight: 1, fontFamily: "Microsoft YaHei" }, 300);
const a1 = JSON.stringify(tr()), a2 = JSON.stringify(tr()), a3 = JSON.stringify(tr());
check("measureTextRuns 三次结果一致（确定性）", a1 === a2 && a2 === a3, a1);

const short = measureTextRuns([{ text: "短" }], { fontSize: 18, fontFamily: "Microsoft YaHei" }, 300);
const long = measureTextRuns([{ text: "这是一段用于测量换行高度的中文文本，需要足够长以触发多行显示。再加一些字。" }], { fontSize: 18, fontFamily: "Microsoft YaHei" }, 300);
check("文本越长行数不减少（单调）", long.lines >= short.lines, `${short.lines} → ${long.lines}`);
check("单行高度 ≈ fontSize×1.06", Math.abs(short.height - 18 * 1.06) < 0.5, `${short.height}`);

console.log("\n=== 2. 度量表阶梯与行距系数 ===");
check("lineHeightMultiplierFor(雅黑) ≈ 1.32", Math.abs(lineHeightMultiplierFor("Microsoft YaHei") - 1.32) < 1e-6);
check("lineHeightMultiplierFor(宋体) = 1.00", Math.abs(lineHeightMultiplierFor("SimSun") - 1.0) < 1e-6);
check("lineHeightMultiplierFor(Calibri) ≈ 1.22", Math.abs(lineHeightMultiplierFor("Calibri") - 1.22) < 1e-6);
const table2 = createMetricsTable();
const missM = table2.metricsFor("完全不存在的字体XYZ");
check("未知字体走系统常量兜底", missM.fallback === true && missM.lineFactor === 1.32, JSON.stringify({ f: missM.fallback, lf: missM.lineFactor }));
check("未知字体记 diagnostics（不静默）", table2.takeDiagnostics().length === 1);

console.log("\n=== 3. 公式与表格度量 ===");
const fml = measureTextRuns([{ formula: true, latex: "\\frac{a}{b}" }], { fontSize: 20, fontFamily: "Microsoft YaHei" }, 200);
check("独占公式行 ≈ 1.6 倍行高×安全系数", Math.abs(fml.height - 20 * 1.6 * 1.06) < 0.5, `${fml.height}`);
const tbl = measureTable({ rows: [[{ text: "表头一二" }, { text: "表头三" }], [{ text: "内容" }, { text: "内容二" }]], columnWidths: [0.5, 0.5], bounds: [0, 0, 400, 200] });
check("measureTable 返回列宽/行高/总高", Array.isArray(tbl.rowHeights) && tbl.totalHeight === tbl.rowHeights.reduce((a, b) => a + b, 0), JSON.stringify(tbl.rowHeights));
const tall = measureTable({ rows: [[{ text: "非常长的中文内容需要换很多行来显示，用于验证行高确实被内容撑开而不是只取最小行高。" }]], bounds: [0, 0, 120, 50] });
check("长内容撑开行高（> 最小 30）", tall.rowHeights[0] > 30, `${tall.rowHeights[0]}`);

// ---------------------------------------------------------------------------
// 2. DOM cross-check
// ---------------------------------------------------------------------------
console.log("\n=== 4. 与 DOM 实测对拍 ===");
let browser;
try {
  browser = findBrowser();
} catch (e) {
  console.log(`SKIP  DOM 对拍（${e.message}）`);
  process.exit(ok ? 0 : 1);
}

const cases = [];
const cjkA = "这是一段中文文本用于测量";
const cjkB = "中文排版测试：换行、行高与块级布局都需要被准确估算，不能太低也不能太高。";
const mix = "MiSans 混排 Hello World 2026 与中文";
for (const fs of [14, 18, 24, 32]) {
  for (const w of [200, 320, 480]) {
    cases.push({ text: cjkA, fs, w, lh: 1 });
    cases.push({ text: cjkB, fs, w, lh: 1 });
    cases.push({ text: mix, fs, w, lh: 1.5 });
  }
}
cases.push({ text: `${cjkA}\n${cjkB}`, fs: 18, w: 300, lh: 1 }); // hard line break
cases.push({ text: cjkA, fs: 18, w: 300, lh: 1, lineHeightPx: 30 }); // fixed line height
while (cases.length > 20) cases.pop();

const dbgPort = await freePort();
const profile = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--hide-scrollbars", `--remote-debugging-port=${dbgPort}`, "about:blank",
], { stdio: "ignore" });
profile.unref();

let cdp;
try {
  cdp = await connectCdp(dbgPort, 20000);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  const fontOk = await cdp.evalJs(`document.fonts.check('16px "Microsoft YaHei"')`);
  if (fontOk !== true) {
    console.log("SKIP  DOM 对拍（环境缺基准字体 Microsoft YaHei——回退字体渲染与度量表估算无可比性）");
    profile.kill();
    process.exit(ok ? 0 : 1);
  }

  const domResults = await cdp.evalJs(`(async () => {
    const cases = ${JSON.stringify(cases)};
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:0;";
    document.body.appendChild(host);
    const out = [];
    for (const c of cases) {
      const root = document.createElement("div");
      const lhCss = c.lineHeightPx != null ? c.lineHeightPx + "px" : String(c.lh);
      root.style.cssText =
        "position:absolute;left:0;top:0;width:" + c.w + "px;box-sizing:border-box;overflow:hidden;" +
        "white-space:pre-line;font-size:" + c.fs + "px;line-height:" + lhCss + ";" +
        'font-family:"Microsoft YaHei",sans-serif;color:#000;';
      root.textContent = c.text;
      host.appendChild(root);
      out.push({ offset: root.offsetHeight, scroll: root.scrollHeight });
      root.remove();
    }
    // Table cell: a div inside a td (same CSS as renderer/table.js)
    const tbl = document.createElement("table");
    tbl.style.cssText = "border-collapse:collapse;table-layout:fixed;font-size:13px;width:200px;";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.style.cssText = "padding:5px 9px;vertical-align:middle;width:200px;";
    const inner = document.createElement("div");
    inner.style.cssText = "width:100%;box-sizing:border-box;overflow:hidden;white-space:pre-line;" +
      "font-size:13px;line-height:1;font-family:\\"Microsoft YaHei\\",sans-serif;";
    inner.textContent = "表格内的中文内容测试，应该换行并撑高单元格。";
    td.appendChild(inner); tr.appendChild(td); tbl.appendChild(tr);
    host.appendChild(tbl);
    const tdInner = inner.offsetHeight;
    host.remove();
    return { text: out, tdInner };
  })()`, 20000);

  if (!domResults || !Array.isArray(domResults.text)) {
    check("DOM 对拍执行", false, "无返回");
  } else {
    // Baseline is offsetHeight (element layout height = lines × line height): scrollHeight
    // additionally counts glyph ink clipped by overflow:hidden (~+2..3px), not a layout fact.
    const errs = [];
    cases.forEach((c, i) => {
      const est = measureTextRuns([{ text: c.text }], { fontSize: c.fs, lineHeight: c.lh, lineHeightPx: c.lineHeightPx, fontFamily: "Microsoft YaHei" }, c.w).height;
      const actual = domResults.text[i].offset;
      errs.push({ i, case: c, est, actual, scroll: domResults.text[i].scroll, rel: (est - actual) / actual });
    });
    errs.sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel));
    const relAbs = errs.map((e) => Math.abs(e.rel)).sort((a, b) => a - b);
    const pct = (p) => relAbs[Math.min(relAbs.length - 1, Math.floor(p * relAbs.length))];
    const p50 = pct(0.5), p90 = pct(0.9), p95 = pct(0.95), max = relAbs[relAbs.length - 1];
    const under = errs.filter((e) => e.rel < 0);
    const scrollAbs = errs.map((e) => Math.abs((e.est - e.scroll) / e.scroll)).sort((a, b) => a - b);
    const sp95 = scrollAbs[Math.min(scrollAbs.length - 1, Math.floor(0.95 * scrollAbs.length))];
    console.log(`  布局高度对拍（offsetHeight）：P50=${(p50 * 100).toFixed(1)}% P90=${(p90 * 100).toFixed(1)}% P95=${(p95 * 100).toFixed(1)}% max=${(max * 100).toFixed(1)}%`);
    console.log(`  宁高勿低：${errs.length - under.length}/${errs.length} 组估算 ≥ 布局高度；负误差最大 ${under.length ? (Math.min(...under.map((e) => e.rel)) * 100).toFixed(1) + "%" : "无"}`);
    console.log(`  参考（scrollHeight 含裁剪墨水溢出）：P95=${(sp95 * 100).toFixed(1)}%（不计入断言）`);
    if (process.argv.includes("--verbose")) {
      console.log("  逐例（est/offset/scroll/rel）：");
      for (const e of errs) {
        console.log(`    fs=${e.case.fs} w=${e.case.w} lh=${e.case.lineHeightPx ?? e.case.lh} text="${e.case.text.slice(0, 14)}…" est=${e.est} offset=${e.actual} scroll=${e.scroll} rel=${(e.rel * 100).toFixed(1)}%`);
      }
    }
    check("文本高度误差 P95 ≤ 8%（对布局高度）", p95 <= 0.08, `P95=${(p95 * 100).toFixed(2)}%`);
    check("宁高勿低：≥95% 组估算不小于布局高度", under.length / errs.length <= 0.05, `欠估 ${under.length}/${errs.length}`);

    const cellEst = measureCell({ text: "表格内的中文内容测试，应该换行并撑高单元格。", fontSize: 13, fontFamily: "Microsoft YaHei" }, 200);
    const cellActual = domResults.tdInner + 10; // + top/bottom padding (5+5)
    check("表格行高误差 ≤ 4px", Math.abs(cellEst - cellActual) <= 4, `est=${cellEst} actual=${cellActual} Δ=${(cellEst - cellActual).toFixed(1)}`);
  }
} finally {
  try { cdp?.close(); } catch { /* noop */ }
  await sleep(200);
  try { profile.kill(); } catch { /* noop */ }
}

process.exit(ok ? 0 : 1);
