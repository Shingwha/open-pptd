// ============================================================================
// model/validate.js — PPTD validator (v3 §4.4, manual review experience cast into code)
// ----------------------------------------------------------------------------
// validateDeck(deck, opts) -> { errors, warnings, perPage }
// Every issue: { level: "error"|"warning", rule, page?, elementId?, message }
// Rule-registry pattern: a new rule = registerRule(fn) with a pure function (deck, ctx, report).
//
// Environment-free (no fs/fetch): checks needing environment capabilities are injected
// through opts and skipped automatically when absent:
//   - opts.fileExists(rel)  relative-path resource existence (the CLI passes an fs implementation)
//   - opts.fontRegistry     font registry object (the product of cli/fonts.js loadRegistry)
//   - opts.iconRegistry     FA icon registry object (assets/icons/registry.json)
//   - opts.layout           LayoutTree (packages/layout): when passed, consumes overflow facts
//                           to report out-of-bounds/overlap issues; when absent that class of
//                           check is skipped (spec 09 T4)
// ============================================================================

import { normalizeTheme, resolveColor, resolveTextStyle } from "./theme.js";
import { parseFontResources } from "./font.js";
import { findFont, findSystemFont } from "./font-registry.js";
import { resolveIconName } from "./icon-fa.js";
import { walkElements } from "./walk.js";
import { deckSize } from "./model.js";
import { ELEMENT_TYPES } from "./style-spec.js";

const KNOWN_TYPES = new Set(ELEMENT_TYPES);

// ---- Rule registry (extension point: a new registerRule immediately joins the check command and the export gate) ----
const RULES = [];
export function registerRule(fn) {
  RULES.push(fn);
}

/**
 * Validate the deck model.
 * @param {object} deck parseDeck product ({version,title,size,theme,fonts,pages})
 * @param {object} [opts] { fileExists?, fontRegistry?, iconRegistry?, layout? }
 * @returns {{ errors: object[], warnings: object[], perPage: Map<number, object[]> }}
 */
export function validateDeck(deck, opts = {}) {
  const errors = [];
  const warnings = [];
  const perPage = new Map();
  const report = (issue) => {
    const list = issue.level === "error" ? errors : warnings;
    list.push(issue);
    if (issue.page != null) {
      if (!perPage.has(issue.page)) perPage.set(issue.page, []);
      perPage.get(issue.page).push(issue);
    }
  };
  const ctx = {
    opts,
    theme: normalizeTheme(deck?.theme),
    size: deckSize(deck),
    fontResources: parseFontResources(deck?.fonts),
  };
  for (const rule of RULES) rule(deck, ctx, report);
  return { errors, warnings, perPage };
}

// ============================================================================
// Built-in rules
// ============================================================================

// ---- schema: deck structure and common element fields ----
registerRule((deck, ctx, report) => {
  if (!deck || typeof deck !== "object") {
    report({ level: "error", rule: "schema", message: "deck 不是对象（manifest 解析失败？）" });
    return;
  }
  if (!Array.isArray(deck.pages) || !deck.pages.length) {
    report({ level: "error", rule: "schema", message: "deck.pages 为空（manifest 未声明任何页面）" });
    return;
  }
  deck.pages.forEach((page, i) => {
    const pageNo = i + 1;
    if (!Array.isArray(page?.elements)) {
      report({ level: "error", rule: "schema", page: pageNo, message: `第 ${pageNo} 页 elements 不是数组` });
      return;
    }
    const seenIds = new Set();
    for (const el of page.elements) {
      const at = { level: "error", rule: "schema", page: pageNo, elementId: el?.elementId };
      if (!el || typeof el !== "object") {
        report({ ...at, message: "元素不是对象" });
        continue;
      }
      if (!KNOWN_TYPES.has(el.elementType)) {
        report({ ...at, message: `未知 elementType "${el.elementType}"（已知: ${[...KNOWN_TYPES].join("/")}）` });
      }
      if (!el.elementId) {
        report({ ...at, message: "缺 elementId" });
      } else if (seenIds.has(el.elementId)) {
        report({ ...at, message: `elementId "${el.elementId}" 页内重复` });
      }
      seenIds.add(el.elementId);
      const b = el.bounds;
      if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== "number" || Number.isNaN(v))) {
        report({ ...at, message: "bounds 必须是 [x, y, w, h] 四元数值数组" });
      } else if (b[2] <= 0 || b[3] <= 0) {
        report({ ...at, message: `bounds 宽高必须为正（实际 ${b[2]}×${b[3]}）` });
      }
      if (el.opacity != null && (typeof el.opacity !== "number" || el.opacity < 0 || el.opacity > 1)) {
        report({ ...at, message: `opacity 必须在 0~1（实际 ${el.opacity}）` });
      }
    }
  });
});

// ---- schema: type-specific required fields (aligned with references/pptd.md §5) ----
registerRule((deck, ctx, report) => {
  walkElements(deck?.pages, (el, page, pageIdx) => {
    const at = { level: "error", rule: "schema-type", page: pageIdx + 1, elementId: el.elementId };
    switch (el.elementType) {
      case "text":
        // content = TextContent object (.text is rich text; YAML parses 01/2024 into a number, which is allowed)
        if (!el.content || typeof el.content !== "object" || el.content.text == null || String(el.content.text).trim() === "") {
          report({ ...at, message: "text 元素缺 content.text（或为空）" });
        }
        break;
      case "image":
        if (!el.src) report({ ...at, message: "image 元素缺 src" });
        break;
      case "icon":
        if (!el.iconName) report({ ...at, message: "icon 元素缺 iconName" });
        break;
      case "shape":
        if (!el.shapeName) {
          report({ ...at, message: "shape 元素缺 shapeName" });
        } else if (el.shapeName === "custom" && (!el.path || !Array.isArray(el.viewBox))) {
          report({ ...at, message: "custom shape 缺 path 或 viewBox" });
        }
        break;
      case "line":
        if (typeof el.points !== "string" || el.points.trim().split(/\s+/).length < 2) {
          report({ ...at, message: "line 元素 points 至少需要 2 个点" });
        }
        if (!Array.isArray(el.viewBox) || el.viewBox.length !== 2) {
          report({ ...at, message: "line 元素缺 viewBox [w, h]" });
        }
        break;
      case "table":
        if (!Array.isArray(el.rows) || !el.rows.length) {
          report({ ...at, message: "table 元素缺 rows（Cell 二维数组）" });
        }
        break;
      case "chart":
        if (!el.data || typeof el.data !== "object") {
          report({ ...at, message: "chart 元素缺 data" });
        }
        if (!Array.isArray(el.series) || !el.series.length) {
          report({ ...at, message: "chart 元素 series 至少 1 个" });
        }
        break;
    }
  });
});

// ---- token references: $ color tokens and style references must hit the theme ----
registerRule((deck, ctx, report) => {
  const { theme } = ctx;
  const checkValue = (path, key, value, at) => {
    if (typeof value !== "string" || !value.startsWith("$")) return;
    const token = value.slice(1);
    if (/^(style|textStyle)$/i.test(key)) {
      if (!theme.textStyles?.[token] && !theme.tableStyles?.[token]) {
        report({ ...at, message: `样式引用 ${value} 未命中 theme.textStyles/tableStyles` });
      }
    } else if (/color|fill/i.test(key)) {
      if (!theme.colors?.[token]) {
        report({ ...at, message: `颜色令牌 ${value} 未命中 theme.colors` });
      }
    }
  };
  const walkObj = (obj, at) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === "extra") continue; // unknown fields kept by lenient parsing are not validated
      if (typeof v === "string") checkValue(null, k, v, at);
      else if (v && typeof v === "object" && !Array.isArray(v)) walkObj(v, at);
      else if (Array.isArray(v)) for (const item of v) if (item && typeof item === "object") walkObj(item, at);
    }
  };
  (deck?.pages || []).forEach((page, i) => {
    if (page?.background) walkObj(page.background, { level: "warning", rule: "token", page: i + 1 });
    for (const el of page?.elements || []) {
      walkObj(el, { level: "warning", rule: "token", page: i + 1, elementId: el.elementId });
    }
  });
});

// ---- resource references: image existence (when fileExists is injected) + icon name hit in the icon library ----
registerRule((deck, ctx, report) => {
  walkElements(deck?.pages, (el, page, pageIdx) => {
    const pageNo = pageIdx + 1;
    if (el.elementType === "image" && typeof el.src === "string" && el.src) {
      if (!el.src.startsWith("data:") && !/^https?:/.test(el.src) && ctx.opts.fileExists) {
        if (!ctx.opts.fileExists(el.src)) {
          report({ level: "warning", rule: "resource", page: pageNo, elementId: el.elementId, message: `图片文件不存在: ${el.src}（导出时该图将被跳过）` });
        }
      }
    }
    if (el.elementType === "icon" && el.iconName && ctx.opts.iconRegistry) {
      if (!resolveIconName(el.iconName, ctx.opts.iconRegistry)) {
        report({
          level: "warning",
          rule: "resource",
          page: pageNo,
          elementId: el.elementId,
          message: `iconName "${el.iconName}" 未命中 Font Awesome 免费图标库（导出时该图标将被跳过；命名以官方为准 fontawesome.com/search?ic=free，前缀 fas/far/fab）`,
        });
      }
    }
  });
});

// ---- font references: text content.fontFamily hits the resource table / registry / system fonts (when fontRegistry is injected) ----
registerRule((deck, ctx, report) => {
  const reg = ctx.opts.fontRegistry;
  if (!reg) return; // skipped when no registry is injected (not enabled in the browser yet)
  const checked = new Set();
  const checkFamily = (family, pageNo, elementId) => {
    if (typeof family !== "string" || !family || checked.has(family)) return;
    checked.add(family);
    if (ctx.fontResources[family]) return; // hits the deck.fonts resource table
    if (findFont(reg, family) || findSystemFont(reg, family)) return;
    report({ level: "warning", rule: "font", page: pageNo, elementId, message: `字体 "${family}" 未命中资源表/注册表/系统字体（依赖打开方系统已装）` });
  };
  walkElements(deck?.pages, (el, page, pageIdx) => {
    if (el.elementType !== "text" || !el.content) return;
    const ff = el.content.fontFamily;
    if (typeof ff === "string") checkFamily(ff, pageIdx + 1, el.elementId);
    else if (ff && typeof ff === "object") {
      checkFamily(ff.latin, pageIdx + 1, el.elementId);
      checkFamily(ff.ea, pageIdx + 1, el.elementId);
    }
  });
});

// ---- geometric heuristic: element out of bounds ----
registerRule((deck, ctx, report) => {
  const [W, H] = ctx.size;
  walkElements(deck?.pages, (el, page, pageIdx) => {
    const b = el.bounds;
    if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== "number")) return;
    const [x, y, w, h] = b;
    if (w <= 0 || h <= 0) return; // already reported by the schema rule
    if (x + w < 0 || y + h < 0 || x > W || y > H) {
      report({ level: "warning", rule: "geometry", page: pageIdx + 1, elementId: el.elementId, message: `元素完全在画布外（bounds [${b.join(", ")}]，画布 ${W}×${H}）` });
    } else if (x < 0 || y < 0 || x + w > W || y + h > H) {
      report({ level: "warning", rule: "geometry", page: pageIdx + 1, elementId: el.elementId, message: `元素超出画布边界（bounds [${b.join(", ")}]，画布 ${W}×${H}）` });
    }
  });
});

// ---- geometric facts: LayoutTree overflow/overlap consumption (spec 09 T4 / plan §4 scenario D) ----
// The old "conservative text overflow estimate" heuristic (estimating width by Σ, reporting
// only past 2× the box height) was deleted: too crude and it ignored lineHeightPx. It now
// consumes the overflow fact from the layout stage (deterministic height); when opts.layout is
// not passed this class of check is skipped (the other checks are unchanged).
registerRule((deck, ctx, report) => {
  const lt = ctx.opts.layout;
  if (!lt) return;
  for (const page of lt.pages || []) {
    const pageNo = page.index + 1;
    for (const le of page.elements || []) {
      const ov = le.overflow || {};
      const f = le.frame || { x: 0, y: 0, w: 0, h: 0 };
      if (ov.page) {
        report({ level: "warning", rule: "geometry", page: pageNo, elementId: le.elementId, message: `元素实际几何完全超出画布（frame [${fmt4(f)}]，画布 ${lt.pageSize.w}×${lt.pageSize.h}）` });
      } else if (ov.x || ov.y) {
        report({ level: "warning", rule: "geometry", page: pageNo, elementId: le.elementId, message: `元素实际几何超出画布（frame [${fmt4(f)}]，画布 ${lt.pageSize.w}×${lt.pageSize.h}${le.grown ? "，内容撑高后越界" : ""}）` });
      }
      for (const hit of ov.overlaps || []) {
        report({ level: "warning", rule: "geometry", page: pageNo, elementId: le.elementId, message: `元素内容撑高后与「${hit.elementId}」重叠（实际高 ${Math.round(f.h)} vs 声明 ${Math.round(le.declared.h)}）` });
      }
    }
  }
  function fmt4(f) {
    return [f.x, f.y, f.w, Math.round(f.h)].join(", ");
  }
});

// ---- contrast: WCAG relative luminance ratio of text vs background (gradient/image backgrounds skipped) ----
// Effective background = the nearest solid-color shape directly below the text (lower in z
// order) that fully contains it, otherwise the page solid background.
registerRule((deck, ctx, report) => {
  const lum = (hex) => {
    // WCAG relative luminance: each channel is sRGB gamma-linearized before the Rec.709
    // weighting. Deliberately different from model/chart/colors.js#luminanceOf, which uses a
    // plain weighted sum to choose a readable label color; this rule needs the exact WCAG
    // formula for its 3:1 contrast ratio to be meaningful. Keep the two apart; do not merge.
    const m = /^#([0-9a-fA-F]{6})/.exec(hex || "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f((n >> 16) & 0xff) + 0.7152 * f((n >> 8) & 0xff) + 0.0722 * f(n & 0xff);
  };
  const contains = (outer, inner) =>
    Array.isArray(outer) && Array.isArray(inner) &&
    outer[0] <= inner[0] && outer[1] <= inner[1] &&
    outer[0] + outer[2] >= inner[0] + inner[2] && outer[1] + outer[3] >= inner[1] + inner[3];
  (deck?.pages || []).forEach((page, i) => {
    const elements = page?.elements || [];
    // The page solid background as the fallback background
    const pageBg = page?.background;
    const fallbackBgLum = pageBg?.type === "solid" ? lum(resolveColor(ctx.theme, pageBg.color)) : null;
    elements.forEach((el, idx) => {
      if (el.elementType !== "text" || !el.content) return;
      // Find the nearest (highest z-order) solid container shape directly below the text
      let bgLum = fallbackBgLum;
      for (let j = idx - 1; j >= 0; j--) {
        const under = elements[j];
        if (under.elementType !== "shape" || under.fill?.type !== "solid") continue;
        if (!contains(under.bounds, el.bounds)) continue;
        const shapeLum = lum(resolveColor(ctx.theme, under.fill.color));
        if (shapeLum != null) bgLum = shapeLum;
        break; // take the nearest layer, whether or not its color resolves
      }
      if (bgLum == null) return;
      // Text color: content explicit color -> style reference -> theme body -> default black
      const styleRef = typeof el.content.style === "string" ? el.content.style : null;
      const ts = styleRef ? resolveTextStyle(ctx.theme, styleRef) : null;
      const colorHex = resolveColor(ctx.theme, el.content.color || ts?.color || ctx.theme.textStyles?.body?.color || "#000000");
      const fgLum = lum(colorHex);
      if (fgLum == null) return;
      const ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
      if (ratio < 3) {
        report({ level: "warning", rule: "contrast", page: i + 1, elementId: el.elementId, message: `文本与背景对比度偏低（${ratio.toFixed(2)}:1，建议 ≥3:1）` });
      }
    });
  });
});
