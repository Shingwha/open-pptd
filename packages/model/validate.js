// ============================================================================
// model/validate.js — PPTD 校验器（v3 §4.4，把人工审查经验固化为代码）
// ----------------------------------------------------------------------------
// validateDeck(deck, opts) → { errors, warnings, perPage }
// 每条 issue：{ level: "error"|"warning", rule, page?, elementId?, message }
// 规则注册表模式：新规则 = registerRule(fn) 注册一个纯函数（deck, ctx, report）。
//
// 双端纯净（无 fs/fetch）：需要环境能力的检查走 opts 注入，缺省自动跳过：
//   - opts.fileExists(rel)  相对路径资源存在性（CLI 传 fs 实现）
//   - opts.fontRegistry     字体注册表对象（cli/fonts.js loadRegistry 的产物）
//   - opts.iconRegistry     FA 图标注册表对象（assets/icons/registry.json）
// ============================================================================

import { normalizeTheme, resolveColor, resolveTextStyle } from "./theme.js";
import { parseFontResources } from "./font.js";
import { findFont, findSystemFont } from "./font-registry.js";
import { resolveIconName } from "./icon-fa.js";
import { walkElements } from "./walk.js";
import { PAGE_WIDTH, PAGE_HEIGHT } from "./model.js";
import { ELEMENT_TYPES } from "./style-spec.js";

const KNOWN_TYPES = new Set(ELEMENT_TYPES);

// ---- 规则注册表（扩展点：新规则 registerRule 即接入 check 命令与导出闸门）----
const RULES = [];
export function registerRule(fn) {
  RULES.push(fn);
}
export function allRules() {
  return [...RULES];
}

/**
 * 校验 deck 模型。
 * @param {object} deck parseDeck 产物（{version,title,size,theme,fonts,pages}）
 * @param {object} [opts] { fileExists?, fontRegistry?, iconRegistry? }
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
    size: Array.isArray(deck?.size) && deck.size.length === 2 ? deck.size : [PAGE_WIDTH, PAGE_HEIGHT],
    fontResources: parseFontResources(deck?.fonts),
  };
  for (const rule of RULES) rule(deck, ctx, report);
  return { errors, warnings, perPage };
}

// ============================================================================
// 内置规则
// ============================================================================

// ---- schema：deck 结构与元素通用字段 ----
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

// ---- schema：类型专属必填字段（对齐 references/pptd.md §5）----
registerRule((deck, ctx, report) => {
  walkElements(deck?.pages, (el, page, pageIdx) => {
    const at = { level: "error", rule: "schema-type", page: pageIdx + 1, elementId: el.elementId };
    switch (el.elementType) {
      case "text":
        // content = TextContent 对象（.text 为富文本；YAML 会把 01/2024 解析为数字，允许）
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

// ---- token 引用：$ 颜色令牌与样式引用必须命中主题 ----
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
      if (k === "extra") continue; // 宽容解析保留的未知字段不校验
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

// ---- 资源引用：图片存在性（注入 fileExists 时）+ 图标名命中图标库 ----
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

// ---- 字体引用：文本 content.fontFamily 命中资源表 / 注册表 / 系统字体（注入 fontRegistry 时）----
registerRule((deck, ctx, report) => {
  const reg = ctx.opts.fontRegistry;
  if (!reg) return; // 无注册表注入则跳过（浏览器端暂不启用）
  const checked = new Set();
  const checkFamily = (family, pageNo, elementId) => {
    if (typeof family !== "string" || !family || checked.has(family)) return;
    checked.add(family);
    if (ctx.fontResources[family]) return; // 命中 deck.fonts 资源表
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

// ---- 几何启发式：元素越界 ----
registerRule((deck, ctx, report) => {
  const [W, H] = ctx.size;
  walkElements(deck?.pages, (el, page, pageIdx) => {
    const b = el.bounds;
    if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== "number")) return;
    const [x, y, w, h] = b;
    if (w <= 0 || h <= 0) return; // schema 规则已报
    if (x + w < 0 || y + h < 0 || x > W || y > H) {
      report({ level: "warning", rule: "geometry", page: pageIdx + 1, elementId: el.elementId, message: `元素完全在画布外（bounds [${b.join(", ")}]，画布 ${W}×${H}）` });
    } else if (x < 0 || y < 0 || x + w > W || y + h > H) {
      report({ level: "warning", rule: "geometry", page: pageIdx + 1, elementId: el.elementId, message: `元素超出画布边界（bounds [${b.join(", ")}]，画布 ${W}×${H}）` });
    }
  });
});

// ---- 几何启发式：文本溢出保守估算（仅强信号才报）----
registerRule((deck, ctx, report) => {
  const stripRich = (s) =>
    String(s)
      .replace(/\\\([\s\S]*?\\\)/g, "∑") // \(latex\) 按一个宽字符估算
      .replace(/<[^>]+>/g, ""); // 富文本标签
  walkElements(deck?.pages, (el, page, pageIdx) => {
    if (el.elementType !== "text" || el.content?.text == null) return;
    const b = el.bounds;
    if (!Array.isArray(b) || b.length !== 4 || b[2] <= 0 || b[3] <= 0) return;
    const content = el.content;
    const fontSize = typeof content.fontSize === "number" ? content.fontSize : 18;
    const lineHeight = typeof content.lineHeight === "number" ? content.lineHeight : 1;
    let lines = 0;
    for (const rawLine of stripRich(String(content.text)).split(/\r?\n/)) {
      let width = 0;
      for (const ch of rawLine) width += ch.charCodeAt(0) > 0xff ? fontSize * 0.95 : fontSize * 0.5;
      lines += Math.max(1, Math.ceil(width / b[2]));
    }
    const estHeight = lines * fontSize * lineHeight;
    // 保守阈值：估算高度超过框高 2 倍才报（估算偏粗 + 导出 spAutoFit 自适应增高，仅提示）
    if (estHeight > b[3] * 2) {
      report({ level: "warning", rule: "geometry", page: pageIdx + 1, elementId: el.elementId, message: `文本可能溢出（估算高 ${Math.round(estHeight)} vs 框高 ${b[3]}，导出将自动增高）` });
    }
  });
});

// ---- 对比度：文本 vs 背景的 WCAG 相对亮度比（gradient/image 背景跳过）----
// 有效背景 = 文本正下方（z 序更低）完整包住文本的最近纯色 shape，否则页面纯色背景。
registerRule((deck, ctx, report) => {
  const lum = (hex) => {
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
    // 页面纯色背景作为兜底背景
    const pageBg = page?.background;
    const fallbackBgLum = pageBg?.type === "solid" ? lum(resolveColor(ctx.theme, pageBg.color)) : null;
    elements.forEach((el, idx) => {
      if (el.elementType !== "text" || !el.content) return;
      // 找文本正下方最近（z 序最高）的纯色容器 shape
      let bgLum = fallbackBgLum;
      for (let j = idx - 1; j >= 0; j--) {
        const under = elements[j];
        if (under.elementType !== "shape" || under.fill?.type !== "solid") continue;
        if (!contains(under.bounds, el.bounds)) continue;
        const shapeLum = lum(resolveColor(ctx.theme, under.fill.color));
        if (shapeLum != null) bgLum = shapeLum;
        break; // 取最近一层，无论能否解析颜色
      }
      if (bgLum == null) return;
      // 文本颜色：content 显式 color → 样式引用 → 主题 body → 默认黑
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
