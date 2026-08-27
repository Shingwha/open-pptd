// ============================================================================

import { parseXml } from "./xml-parser.js";
// mathml2omml.js v2.2 — 纯 JS、零依赖：MathML → OMML（PowerPoint 原生公式）
// ----------------------------------------------------------------------------
// 输入：KaTeX 输出的 Presentation MathML（<math>...</math> 字符串）
// 输出：<m:oMath>...</m:oMath> 字符串（不带命名空间声明，注入时补充）
//
// v2 重写：逐条复刻微软官方 MML2OMML.XSL 的行为（用官方 XSLT 输出做字节级对照，
// 回归：npm test，204 用例 vs 官方固化参考）：
//   1. run 合并：相邻同字体的 mi/mn/mo/ms/mtext 合并进同一个 m:r（mtext 只与 mtext 合并；
//      fence 内部的 token 强制单 run，不合并——官方 fFenceOperator 行为）
//   2. nary 作用域：∑/∫/∏ 的 m:e 只吸收【紧随其后的第一个兄弟】（mrow/mstyle 则拆开取其子），
//      其余兄弟留在 nary 之外（官方 NaryHandleMrowMstyle 行为）
//   3. fence：\left( \right) 与 (x)^2（FFencedWithScript）→ m:d；begChr/endChr 为默认值
//      "("/")" 时省略；sepChr 为 "|" 时省略，否则显式写出（含空字符串）
//   4. 重音：m:acc 的 chr 经过 ToUpperCombining 映射（^ → U+0302 等）
//   5. mstyle 的单子包装不产生额外输出；mspace 直接丢弃；mtext 空白-only 不加 m:nor
// ============================================================================

// ── 2. 工具 ─────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// XSLT 的字符串值：全部后代文本按文档序拼接（token 带子元素时官方直接压平成文本）
function stringValue(node) {
  if (!node.children.length) return node.text;
  let s = node.text;
  for (const c of node.children) s += stringValue(c);
  return s;
}

// CreateArgProp：最近的 ancestor-or-self mstyle 的 scriptlevel ∈ {0,1,2} → m:argPr
function argProp(node) {
  for (let n = node; n; n = n.parent) {
    if (n.name === "mstyle" && ["0", "1", "2"].includes(n.attrs.scriptlevel)) {
      return `<m:argPr><m:scrLvl m:val="${esc(n.attrs.scriptlevel)}"/></m:argPr>`;
    }
  }
  return "";
}

// XSLT normalize-space：仅 ASCII 空白（#x20 #x9 #xD #xA）折叠，NBSP 保留
const normalizeSpace = (s) => (s || "").replace(/[\t\r\n ]+/g, " ").replace(/^ | $/g, "");

const isToken = (n) =>
  n && (n.name === "mi" || n.name === "mn" || n.name === "mo" || n.name === "ms" || n.name === "mtext");

const isNumeric = (t) => t !== "" && !isNaN(Number(t));

// 数学默认字体（GetFontCur 的默认分支，KaTeX 不输出 fontstyle/fontweight）
function getFontCur(node) {
  const mv = node.attrs.mathvariant;
  if (mv) return mv;
  const t = stringValue(node);
  if (
    (node.name === "mi" && normalizeSpace(t).length <= 1) ||
    (node.name === "mn" && isNumeric(t)) ||
    node.name === "mo"
  ) {
    return "italic";
  }
  return "normal"; // 多字符 mi、非数字 mn、ms、mtext
}

// FNor：mtext → m:nor（内容仅空白（含 NBSP）时除外）
function fNor(node) {
  if (node.name !== "mtext") return 0;
  return normalizeSpace(stringValue(node).replace(/\u00a0/g, " ")) === "" ? 0 : 1;
}

// CreateMathScrStyProp：字体 → m:scr / m:sty 映射
function mathScrSty(font, nor) {
  switch (font) {
    case "normal": return nor ? "" : '<m:sty m:val="p"/>';
    case "bold": return '<m:sty m:val="b"/>';
    case "italic": return "";
    case "script": return '<m:scr m:val="script"/>';
    case "bold-script": return '<m:scr m:val="script"/><m:sty m:val="b"/>';
    case "double-struck": return '<m:scr m:val="double-struck"/><m:sty m:val="p"/>';
    case "fraktur": return '<m:scr m:val="fraktur"/><m:sty m:val="p"/>';
    case "bold-fraktur": return '<m:scr m:val="fraktur"/><m:sty m:val="b"/>';
    case "sans-serif": return '<m:scr m:val="sans-serif"/><m:sty m:val="p"/>';
    case "bold-sans-serif": return '<m:scr m:val="sans-serif"/><m:sty m:val="b"/>';
    case "sans-serif-italic": return '<m:scr m:val="sans-serif"/>';
    case "sans-serif-bold-italic": return '<m:scr m:val="sans-serif"/><m:sty m:val="bi"/>';
    case "monospace": return '<m:scr m:val="monospace"/><m:sty m:val="p"/>';
    case "bi":
    case "bold-italic": return '<m:sty m:val="bi"/>';
    default: return "";
  }
}

// lxml 序列化规则：空元素一律自闭合（官方产物行为，见 KNOWN-DIFFS 坑 6）
const wrapEl = (name, inner) => (inner ? `<${name}>${inner}</${name}>` : `<${name}/>`);

// CreateRunProp：fNor=1 或字体非 italic/空 时输出 m:rPr
function runProps(font, nor) {
  if (!(nor === 1 || (font !== "italic" && font !== ""))) return "";
  return `<m:rPr>${nor === 1 ? "<m:nor/>" : ""}${mathScrSty(font, nor)}</m:rPr>`;
}

/** 单 token → 独立 m:r（fShouldCollect=0 的路径：fence 内、函数名、线性分数内） */
function singleRun(node) {
  return `<m:r>${runProps(getFontCur(node), fNor(node))}<m:t>${esc(normalizeSpace(stringValue(node)))}</m:t></m:r>`;
}

// CreateRunWithSameProp 的合并判定：token t 是否能并入字体为 font 的当前 run
function canJoinRun(t, font, isMText) {
  if (!isToken(t)) return false;
  if ((t.name === "mtext") !== isMText) return false;
  const tmv = t.attrs.mathvariant;
  if (tmv) return tmv === font;
  switch (font) {
    case "italic":
      return (
        (t.name === "mn" && isNumeric(stringValue(t))) ||
        t.name === "mo" ||
        (t.name === "mi" && normalizeSpace(stringValue(t)).length <= 1)
      );
    case "normal":
      return (
        (t.name === "mi" && normalizeSpace(stringValue(t)).length > 1) ||
        (t.name === "mn" && !isNumeric(stringValue(t))) ||
        t.name === "ms" ||
        t.name === "mtext"
      );
    default:
      // bold / bi / script / double-struck … 仅显式 mathvariant 相同才合并（KaTeX 均显式给出）
      return false;
  }
}

/** 从 siblings[start] 开始收集同字体连续 token，返回 {run, next} */
function collectRun(siblings, start) {
  const first = siblings[start];
  const font = getFontCur(first);
  const isMText = first.name === "mtext";
  let end = start + 1;
  while (end < siblings.length && canJoinRun(siblings[end], font, isMText)) end++;
  let text = "";
  for (let i = start; i < end; i++) text += normalizeSpace(stringValue(siblings[i]));
  return { run: `<m:r>${runProps(font, fNor(first))}<m:t>${esc(text)}</m:t></m:r>`, next: end };
}

// ── 3. 常量表（全部直接抄录自官方 XSLT，勿改；改动需重跑 npm test） ─────────
// 本区块集中 6 张表：NARY_OPS / NARY_GROW / OPEN_CHARS / CLOSE_CHARS /
// FENCE_MATCH / TO_UPPER_COMBINING。对应 XSLT 变量：IsNaryOper、
// NaryGrowDefault、OpenChars、CloseChars、FENCE_MATCH、ToUpperCombining。
// isNaryOper：n-ary 运算符字符集合
const NARY_OPS = new Set(
  "∫∬∭∮∯∰∲∳∱∩∪∏∐∑⋀⋁⋂⋃℀⅋⨀⨂⨉⋏⋎⨓⨔⨄⨅⨌⨍⨎⨏⨐⨑⨒⨓⨔⨕⨖⨗⨘⨙⨚⨛⨜".split("")
);

// CreateNaryProp 的 grow 默认表
const NARY_GROW = new Set("∫∮∯∲∳∩∪∏∑⋀⋁⋂⋃".split(""));

// OpenChars / CloseChars（fence 检测字符表）
const OPEN_CHARS = "([{<\u230a\u2308\u27e6]|\u2016";
const CLOSE_CHARS = ")]}>\u230b\u2309\u27e7[|\u2016";
const FENCE_MATCH = {
  "(": ")", "[": "]", "{": "}", "<": ">",
  "\u230a": "\u230b", "\u2308": "\u2309", "\u27e6": "\u27e7",
  ")": "(", "]": "[", "}": "{", ">": "<",
  "\u230b": "\u230a", "\u2309": "\u2308", "\u27e7": "\u27e6",
  "|": "|", "\u2016": "\u2016",
};

// ToUpperCombining：非组合重音 → 组合重音
const TO_UPPER_COMBINING = {
  "\u02d8": "\u0306", "\u00b8": "\u0312", "\u0060": "\u0300",
  "\u002d": "\u0305", "\u2212": "\u0305", "\u002e": "\u0307",
  "\u02d9": "\u0307", "\u02dd": "\u030b", "\u00b4": "\u0301",
  "\u007e": "\u0303", "\u02dc": "\u0303", "\u00a8": "\u0308",
  "\u02c7": "\u030c", "\u005e": "\u0302", "\u00af": "\u0305",
  "\u2192": "\u20d7", "\u27f6": "\u20d7", "\u2190": "\u20d6",
};

// ── 4. fence 检测与 m:d ─────────────────────────────────────────────────────
function fenceOpenChar(children) {
  if (children.length <= 1) return "";
  const first = children[0];
  if (first.name === "mo") return OPEN_CHARS.includes(normalizeSpace(first.text)) ? normalizeSpace(first.text) : "";
  if (first.name === "mrow" && first.children.length === 1 && first.children[0].name === "mo") {
    const t = normalizeSpace(first.children[0].text);
    return OPEN_CHARS.includes(t) ? t : "";
  }
  return "";
}

function fenceCloseChar(children) {
  if (children.length <= 1) return "";
  const last = children[children.length - 1];
  if (last.name === "mo") return CLOSE_CHARS.includes(normalizeSpace(last.text)) ? normalizeSpace(last.text) : "";
  if (last.name === "mrow" && last.children.length === 1 && last.children[0].name === "mo") {
    const t = normalizeSpace(last.children[0].text);
    return CLOSE_CHARS.includes(t) ? t : "";
  }
  return "";
}

function fenceSeparatorChar(children) {
  const mids = children.filter((c, i) => i !== 0 && i !== children.length - 1 && c.name === "mo");
  if (mids.length === 0) return "";
  const ch = normalizeSpace(mids[0].text);
  return mids.every((c) => normalizeSpace(c.text) === ch) ? ch : "";
}

// FFenced
function isFenced(children) {
  const chOpen = fenceOpenChar(children);
  const chClose = fenceCloseChar(children);
  const matchClose = FENCE_MATCH[chOpen];
  const matchOpen = FENCE_MATCH[chClose];
  if (chOpen !== "" && chClose !== "" && chClose === matchClose) return true;
  if (chOpen !== "" && chClose === "" && !children.some((c) => c.name === "mo" && normalizeSpace(c.text) === matchClose)) return true;
  if (chClose !== "" && chOpen === "" && !children.some((c) => c.name === "mo" && normalizeSpace(c.text) === matchOpen)) return true;
  return false;
}

// CreateDelimProp：begChr 为 "("、endChr 为 ")"、sepChr 为 "|" 时省略（其余值——含空串——都显式写出）
function delimProps(chOpen, chClose, sep, openValid = true, closeValid = true, sepValid = true) {
  const chSep = sep ? sep[0] : "";
  const need =
    (openValid && chOpen !== "(") ||
    (closeValid && chClose !== ")") ||
    (sepValid ? chSep !== "|" : true);
  if (!need) return "";
  let s = "<m:dPr>";
  if (openValid && chOpen !== "(") s += `<m:begChr m:val="${esc(chOpen)}"/>`;
  if (sepValid) {
    if (chSep !== "|") s += `<m:sepChr m:val="${esc(chSep)}"/>`;
  } else {
    s += '<m:sepChr m:val=","/>';
  }
  if (closeValid && chClose !== ")") s += `<m:endChr m:val="${esc(chClose)}"/>`;
  return s + "</m:dPr>";
}

function isFenceNode(c, ch) {
  if (ch === "") return false;
  if (c.name === "mo" && normalizeSpace(c.text) === ch) return true;
  return c.name === "mrow" && c.children.length === 1 && c.children[0].name === "mo" && normalizeSpace(c.children[0].text) === ch;
}

// WriteFenced：mrow 首尾为配对 fence → m:d（按分隔符切分多个 m:e）
function writeFenced(children) {
  const chOpen = fenceOpenChar(children);
  const chClose = fenceCloseChar(children);
  const sep = fenceSeparatorChar(children);
  const dPr = delimProps(chOpen, chClose, sep);

  const groups = [];
  let cur = [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (i === 0 && isFenceNode(c, chOpen)) continue;
    if (i === children.length - 1 && isFenceNode(c, chClose)) continue;
    if (c.name === "mo" && sep !== "" && normalizeSpace(c.text) === sep) {
      groups.push(cur);
      cur = [];
      continue;
    }
    cur.push(c);
  }
  if (groups.length === 0 || cur.length > 0) groups.push(cur);

  const ap = argProp(children[0] && children[0].parent ? children[0].parent : null);
  return `<m:d>${dPr}${groups.map((g) => wrapEl("m:e", ap + processChildren(g, { fenced: true }))).join("")}</m:d>`;
}

// FFencedWithScript：(x)^2 模式 —— 闭合 fence 是最后一个脚本元素的基础
function isFencedWithScript(children) {
  const chOpen = fenceOpenChar(children);
  if (chOpen === "") return false;
  const last = children[children.length - 1];
  if (!last || !["msup", "msub", "msubsup", "munder", "mover", "munderover"].includes(last.name)) return false;
  const base = last.children[0];
  if (!base || base.name !== "mo") return false;
  const t = normalizeSpace(base.text);
  return t !== "" && CLOSE_CHARS.includes(t) && t === FENCE_MATCH[chOpen];
}

function writeFencedWithScript(children) {
  const chOpen = fenceOpenChar(children);
  const script = children[children.length - 1];
  const chClose = normalizeSpace(script.children[0].text);
  // WriteFencedContent：m:d（begChr/endChr 走 CreateDelimProp，sepChr 显式空串）
  const ap = argProp(children[0] && children[0].parent ? children[0].parent : null);
  const content = `<m:d>${delimProps(chOpen, chClose, "")}<m:e>${ap}${processChildren(
    children.slice(1, -1), { fenced: true })}</m:e></m:d>`;
  const e = `<m:e>${content}</m:e>`;
  switch (script.name) {
    case "msup": return `<m:sSup>${e}<m:sup>${ap}${toOmml(script.children[1])}</m:sup></m:sSup>`;
    case "msub": return `<m:sSub>${e}<m:sub>${ap}${toOmml(script.children[1])}</m:sub></m:sSub>`;
    case "msubsup":
      return `<m:sSubSup>${e}<m:sub>${ap}${toOmml(script.children[1])}</m:sub><m:sup>${ap}${toOmml(script.children[2])}</m:sup></m:sSubSup>`;
    case "munder": return `<m:limLow>${e}<m:lim>${ap}${toOmml(script.children[1])}</m:lim></m:limLow>`;
    case "mover": return `<m:limUpp>${e}<m:lim>${ap}${toOmml(script.children[1])}</m:lim></m:limUpp>`;
    default: // munderover
      return `<m:limUpp><m:e><m:limLow><m:e>${content}</m:e><m:lim>${ap}${toOmml(script.children[2])}</m:lim></m:limLow></m:e><m:lim>${ap}${toOmml(script.children[3])}</m:lim></m:limUpp>`;
  }
}

// ── 5. n-ary ────────────────────────────────────────────────────────────────
// isNary：base（可能是 mrow/mstyle 链）的最后一个后代是 n-ary 运算符 mo
function isNary(base) {
  if (!base) return false;
  // 链上只允许 mo/mstyle/mrow
  for (let n = base; n; n = n.children[0]) {
    if (n.name !== "mo" && n.name !== "mstyle" && n.name !== "mrow") return false;
    if (n.children.length === 0) {
      // 最后一个节点必须是 mo 且为 n-ary 运算符
      if (n.name === "mo" && NARY_OPS.has(normalizeSpace(n.text))) {
        // 不能被标记为重音
        const p = base.parent;
        if (p && (String(p.attrs.accent || "").toLowerCase() === "true" ||
                  String(p.attrs.accentunder || "").toLowerCase() === "true")) return false;
        return true;
      }
      return false;
    }
    if (n.children.length > 1) return false;
  }
  return false;
}

// isNary 的 mo 文本（沿 mrow/mstyle 链取最后一个 mo）
function naryChr(base) {
  let n = base;
  while (n && n.children.length === 1 && n.children[0].name !== "mo") n = n.children[0];
  return normalizeSpace(n.text);
}

// FIsNaryArgument：某节点是否紧跟 nary 结构（其前一个兄弟是 nary 脚本）
function isNaryArgPreceding(prev) {
  if (!prev) return false;
  if (["munder", "mover", "munderover", "msub", "msup", "msubsup"].includes(prev.name)) {
    return isNary(prev.children[0]);
  }
  if (prev.name === "mstyle" && prev.children.length === 1 &&
      ["munder", "mover", "munderover", "msub", "msup", "msubsup"].includes(prev.children[0].name)) {
    return isNary(prev.children[0].children[0]);
  }
  return false;
}

// 结构与 XSLT 相同：nary 节点本身（或其单子 mstyle 父）的紧随兄弟
function firstFollowingSibling(node) {
  const parent = node.parent;
  if (!parent) return null;
  const idx = parent.children.indexOf(node);
  if (idx >= 0 && idx + 1 < parent.children.length) return parent.children[idx + 1];
  if (parent.name === "mstyle" && parent.children.length === 1 && parent.parent) {
    const pidx = parent.parent.children.indexOf(parent);
    if (pidx >= 0 && pidx + 1 < parent.parent.children.length) return parent.parent.children[pidx + 1];
  }
  return null;
}

function writeNary(node) {
  const kids = node.children;
  const chr = naryChr(kids[0]);
  const name = node.name;
  const underOver = name === "munder" || name === "mover" || name === "munderover";
  const stretchy = String(kids[0].attrs.stretchy || "").toLowerCase();
  const grow = stretchy === "true" ? "1" : stretchy === "false" ? "0" : NARY_GROW.has(chr) ? "1" : "0";
  const pr =
    `<m:naryPr><m:chr m:val="${esc(chr)}"/><m:limLoc m:val="${underOver ? "undOvr" : "subSup"}"/>` +
    `<m:grow m:val="${grow}"/>` +
    `<m:subHide m:val="${name === "mover" || name === "msup" ? "on" : "off"}"/>` +
    `<m:supHide m:val="${name === "munder" || name === "msub" ? "on" : "off"}"/></m:naryPr>`;
  let sub = "", sup = "";
  if (name === "msub" || name === "munder") sub = toOmml(kids[1]);
  else if (name === "msup" || name === "mover") sup = toOmml(kids[1]);
  else { sub = toOmml(kids[1]); sup = toOmml(kids[2]); }
  const e = naryHandle(firstFollowingSibling(node));
  // 空元素自闭合（与 lxml 序列化一致）
  const ap = argProp(node);
  const subXml = sub ? `<m:sub>${ap}${sub}</m:sub>` : "<m:sub/>";
  const supXml = sup ? `<m:sup>${ap}${sup}</m:sup>` : "<m:sup/>";
  const eXml = e ? `<m:e>${ap}${e}</m:e>` : "<m:e/>";
  return `<m:nary>${pr}${subXml}${supXml}${eXml}</m:nary>`;
}

// NaryHandleMrowMstyle：nary 的 m:e 内容（只处理紧随的第一个兄弟）
function naryHandle(node) {
  if (!node) return "";
  switch (node.name) {
    case "mrow":
      if (isLinearFrac(node)) return makeLinearFrac(node);
      if (isFunc(node)) return writeFunc(node);
      if (isFencedWithScript(node.children)) return writeFencedWithScript(node.children);
      if (isFenced(node.children)) return writeFenced(node.children);
      return processChildren(node.children, {});
    case "mstyle":
      return processChildren(node.children, {});
    case "mfrac": return mFrac(node);
    case "msub":
    case "msup":
    case "msubsup": return mScript(node);
    case "mroot": return mRoot(node);
    case "msqrt":
    case "menclose": return mEncloseMSqrt(node);
    case "mfenced": return mFenced(node);
    case "mpadded": return mPadded(node);
    case "mphantom": return mPhantom(node);
    case "munder":
    case "mover":
    case "munderover": return mUnderOver(node);
    case "mmultiscripts": return mMultiscripts(node);
    case "mtable": return mTable(node);
    default:
      if (isToken(node)) {
        // MNonGlyphToken 直接调用：只输出从参数开始的 token 块（不含后续兄弟）
        const parent = node.parent;
        if (parent && ["mrow", "mstyle", "msqrt", "menclose", "math", "mphantom", "mtd", "maction"].includes(parent.name)) {
          const idx = parent.children.indexOf(node);
          return tokenBlock(parent.children, idx, node).out;
        }
        return singleRun(node);
      }
      return processChildren(node.children, {});
  }
}

// ── 6. 结构映射 ─────────────────────────────────────────────────────────────
// FLinearFrac：mrow[a, /, b] → m:f lin
function isLinearFrac(node) {
  return (
    node.children.length === 3 &&
    node.children[1].name === "mo" &&
    normalizeSpace(node.children[1].text) === "/"
  );
}
function makeLinearFrac(node) {
  const ap = argProp(node);
  return `<m:f><m:fPr><m:type m:val="lin"/></m:fPr><m:num>${ap}${toOmml(node.children[0])}</m:num><m:den>${ap}${toOmml(node.children[2])}</m:den></m:f>`;
}

// FIsFunc：mrow[name, U+2061, arg] → m:func
function isFunc(node) {
  return (
    node.children.length === 3 &&
    node.children[1].name === "mo" &&
    normalizeSpace(node.children[1].text) === "\u2061"
  );
}
function writeFunc(node) {
  const ap = argProp(node);
  return `<m:func><m:fName>${ap}${toOmml(node.children[0])}</m:fName><m:e>${ap}${toOmml(node.children[2])}</m:e></m:func>`;
}

function mFrac(node) {
  const lt = node.attrs.linethickness;
  let type = "bar";
  if (lt !== undefined) {
    const lower = String(lt).toLowerCase();
    if (!(lower === "" || lower === "thin" || lower === "medium" || lower === "thick" || /\d*[1-9]\d*/.test(lower))) {
      type = "noBar";
    }
  }
  if (String(node.attrs.bevelled || "").toLowerCase() === "true") type = "skw";
  const ap = argProp(node);
  return `<m:f><m:fPr><m:type m:val="${type}"/></m:fPr><m:num>${ap}${toOmml(node.children[0])}</m:num><m:den>${ap}${toOmml(node.children[1])}</m:den></m:f>`;
}

function mScript(node) {
  const base = node.children[0];
  if (isNary(base)) return writeNary(node);
  const ap = argProp(node);
  const e = toOmml(base) ? `<m:e>${ap}${toOmml(base)}</m:e>` : "<m:e/>";
  const sub = node.children[1] ? `<m:sub>${ap}${toOmml(node.children[1])}</m:sub>` : "<m:sub/>";
  if (node.name === "msub") {
    return `<m:sSub>${e}${sub}</m:sSub>`;
  }
  if (node.name === "msup") {
    return `<m:sSup>${e}<m:sup>${ap}${toOmml(node.children[1])}</m:sup></m:sSup>`;
  }
  return `<m:sSubSup>${e}${sub}<m:sup>${ap}${toOmml(node.children[2])}</m:sup></m:sSubSup>`;
}

function mRoot(node) {
  const ap = argProp(node);
  const deg = ap + toOmml(node.children[1]);
  return `<m:rad><m:radPr><m:degHide m:val="off"/></m:radPr>${wrapEl("m:deg", deg)}<m:e>${ap}${toOmml(node.children[0])}</m:e></m:rad>`;
}

function mEncloseMSqrt(node) {
  const ap = argProp(node);
  const inner = `<m:e>${ap}${node.children.map(toOmml).join("")}</m:e>`;
  // 官方 msqrt/menclose(radical)：m:deg 内总调用 CreateArgProp（内容为空时 deg 自闭合）
  const radXml = (degHideVal) => `<m:rad><m:radPr><m:degHide m:val="${degHideVal}"/></m:radPr>${wrapEl("m:deg", ap)}${inner}</m:rad>`;
  if (node.name === "msqrt") {
    return radXml("on");
  }
  const notation = String(node.attrs.notation || "").toLowerCase();
  if (notation === "radical" || notation === "" || !node.attrs.notation) {
    return radXml("on");
  }
  if (notation === "actuarial" || notation === "longdiv") return "";
  // m:borderBox
  const fBox = /box|circle|roundedbox/.test(notation);
  const fTop = notation.includes("top");
  const fBot = notation.includes("bottom");
  const fLeft = notation.includes("left");
  const fRight = notation.includes("right");
  const fStrikeH = notation.includes("horizontalstrike");
  const fStrikeV = notation.includes("verticalstrike");
  const fStrikeBLTR = notation.includes("updiagonalstrike");
  const fStrikeTLBR = notation.includes("downdiagonalstrike");
  let pr = "";
  if (fStrikeH || fStrikeV || fStrikeBLTR || fStrikeTLBR || (fBox === 0 && !(fTop && fBot && fLeft && fRight))) {
    pr = "<m:borderBoxPr>";
    if (!fBox) {
      if (!fTop) pr += '<m:hideTop m:val="on"/>';
      if (!fBot) pr += '<m:hideBot m:val="on"/>';
      if (!fLeft) pr += '<m:hideLeft m:val="on"/>';
      if (!fRight) pr += '<m:hideRight m:val="on"/>';
    }
    if (fStrikeH) pr += '<m:strikeH m:val="on"/>';
    if (fStrikeV) pr += '<m:strikeV m:val="on"/>';
    if (fStrikeBLTR) pr += '<m:strikeBLTR m:val="on"/>';
    if (fStrikeTLBR) pr += '<m:strikeTLBR m:val="on"/>';
    pr += "</m:borderBoxPr>";
  }
  return `<m:borderBox>${pr}<m:e>${node.children.map(toOmml).join("")}</m:e></m:borderBox>`;
}

function mUnderOver(node) {
  const base = node.children[0];
  if (isNary(base)) return writeNary(node);
  const under = node.name === "munder";
  if (node.name === "munderover") {
    const ap = argProp(node);
    return `<m:limUpp><m:e><m:limLow><m:e>${ap}${toOmml(node.children[0])}</m:e><m:lim>${ap}${toOmml(node.children[1])}</m:lim></m:limLow></m:e><m:lim>${ap}${toOmml(node.children[2])}</m:lim></m:limUpp>`;
  }
  const accentAttr = under ? (node.attrs.accentunder || "") : (node.attrs.accent || "");
  const accent = String(accentAttr).toLowerCase();
  const op2 = node.children[1];
  // FIsBar
  if (accent !== "true" && op2 && op2.name === "mo") {
    const t = normalizeSpace(op2.text);
    const ap = argProp(node);
    if (under && (t === "\u0332" || t === "_")) {
      return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>${ap}${toOmml(node.children[0])}</m:e></m:bar>`;
    }
    if (!under && (t === "\u0305" || t === "\u00af")) {
      return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${ap}${toOmml(node.children[0])}</m:e></m:bar>`;
    }
  }
  // FIsAcc（仅 mover）
  if (!under) {
    const moAccent = String((op2 && op2.attrs.accent) || "").toLowerCase();
    const fAccent = moAccent === "true" || (moAccent === "" && accent === "true");
    if (fAccent && op2 && op2.name === "mo" && normalizeSpace(op2.text).length <= 1) {
      const ch = normalizeSpace(stringValue(op2));
      return `<m:acc><m:accPr><m:chr m:val="${esc(TO_UPPER_COMBINING[ch] || ch)}"/></m:accPr><m:e>${argProp(node)}${toOmml(node.children[0])}</m:e></m:acc>`;
    }
  }
  // FIsGroupChr
  if (accent === "false" && node.children.length === 2 &&
      ((node.children[0].name === "mrow" && op2.name === "mo") || (node.children[0].name === "mo" && op2.name === "mrow"))) {
    const mo = op2.name === "mo" ? op2 : node.children[0];
    const mrow = op2.name === "mrow" ? op2 : node.children[0];
    if (normalizeSpace(mo.text).length <= 1) {
      const pos = under ? (node.children[0].name === "mrow" ? "bot" : "top") : (node.children[0].name === "mrow" ? "top" : "bot");
      const vertJc = under ? "top" : "bot";
      return `<m:groupChr><m:groupChrPr><m:chr m:val="${esc(normalizeSpace(stringValue(mo)))}"/><m:pos m:val="${pos}"/><m:vertJc m:val="${vertJc}"/></m:groupChrPr><m:e>${argProp(node)}${processChildren(mrow.children, {})}</m:e></m:groupChr>`;
    }
  }
  // limLow / limUpp
  const ap = argProp(node);
  if (under) {
    return `<m:limLow><m:e>${ap}${toOmml(node.children[0])}</m:e><m:lim>${ap}${toOmml(node.children[1])}</m:lim></m:limLow>`;
  }
  return `<m:limUpp><m:e>${ap}${toOmml(node.children[0])}</m:e><m:lim>${ap}${toOmml(node.children[1])}</m:lim></m:limUpp>`;
}

function mFenced(node) {
  const hasOpen = node.attrs.open !== undefined;
  const hasClose = node.attrs.close !== undefined;
  const hasSep = node.attrs.separators !== undefined;
  const chOpen = hasOpen ? node.attrs.open : "";
  const chClose = hasClose ? node.attrs.close : "";
  const chSep = hasSep ? (node.attrs.separators.length > 0 ? node.attrs.separators[0] : "") : "";
  const dPr = delimProps(chOpen, chClose, hasSep ? chSep : "", hasOpen, hasClose, hasSep);
  return `<m:d>${dPr}${node.children.map((c) => `<m:e>${argProp(c)}${toOmml(c)}</m:e>`).join("")}</m:d>`;
}

function mPadded(node) {
  const width = node.attrs.width;
  const height = node.attrs.height;
  const depth = node.attrs.depth;
  // 官方 FFull：含非零数字 → full；数字全零 → zero（输出 zeroWid/zeroAsc/zeroDesc）；无数字 → full
  // （Word 只有 zero/full 两态：0em → zero，0.6em/+0.6em → full，"height" 等引用 → full）
  const fFull = (s) => {
    const str = String(s || "").toLowerCase();
    return /[1-9]/.test(str) || !/\d/.test(str);
  };
  let pr = "";
  if (!fFull(width) || !fFull(height) || !fFull(depth)) {
    pr = "<m:phantPr>";
    if (!fFull(width)) pr += '<m:zeroWid m:val="on"/>';
    if (!fFull(height)) pr += '<m:zeroAsc m:val="on"/>';
    if (!fFull(depth)) pr += '<m:zeroDesc m:val="on"/>';
    pr += "</m:phantPr>";
  }
  // 官方 MPadded：m:e 内不调 CreateArgProp（与 mroot/msqrt 不同），空内容自闭合
  return `<m:phant>${pr}${wrapEl("m:e", node.children.map(toOmml).join(""))}</m:phant>`;
}

function mPhantom(node) {
  return `<m:phant><m:phantPr><m:show m:val="off"/></m:phantPr><m:e>${argProp(node)}${node.children.map(toOmml).join("")}</m:e></m:phant>`;
}

// MMultiscripts（{}_a^b 等）
function mMultiscripts(node) {
  const kids = node.children;
  const mpIdx = kids.findIndex((c) => c.name === "mprescripts");
  const before = mpIdx === -1 ? kids.slice(1) : kids.slice(1, mpIdx); // scripts
  const after = mpIdx === -1 ? [] : kids.slice(mpIdx + 1);            // prescripts
  const cndSuper = before.filter((c, i) => (i + 1) % 2 === 1 && c.name !== "none").length;
  const cndSub = before.filter((c, i) => (i + 1) % 2 === 0 && c.name !== "none").length;
  const cndScriptStrict = cndSuper + cndSub;
  const cndPrescriptStrict = after.filter((c) => c.name !== "none").length;

  const ap = argProp(node);
  const splitScripts = (arr) => {
    let sub = "", sup = "";
    arr.forEach((c, i) => {
      if (c.name === "none") return;
      if ((i + 1) % 2 === 1) sub += toOmml(c);
      else sup += toOmml(c);
    });
    return `${wrapEl("m:sub", ap + sub)}${wrapEl("m:sup", ap + sup)}`;
  };

  if (cndPrescriptStrict <= 0 && cndScriptStrict <= 0) return toOmml(kids[0]);
  if (cndPrescriptStrict <= 0) {
    if (cndSuper > 0 && cndSub > 0) {
      return `<m:sSubSup><m:e>${toOmml(kids[0])}</m:e>${splitScripts(before)}</m:sSubSup>`;
    }
    if (cndSub > 0) {
      return `<m:sSub><m:e>${toOmml(kids[0])}</m:e><m:sub>${before.map(toOmml).join("")}</m:sub></m:sSub>`;
    }
    return `<m:sSup><m:e>${toOmml(kids[0])}</m:e><m:sup>${before.map(toOmml).join("")}</m:sup></m:sSup>`;
  }
  if (cndScriptStrict <= 0) {
    return `<m:sPre><m:e>${toOmml(kids[0])}</m:e>${splitScripts(after)}</m:sPre>`;
  }
  let inner;
  if (cndSuper > 0 && cndSub > 0) inner = `<m:sSubSup><m:e>${toOmml(kids[0])}</m:e>${splitScripts(before)}</m:sSubSup>`;
  else if (cndSub > 0) inner = `<m:sSub><m:e>${toOmml(kids[0])}</m:e><m:sub>${before.map(toOmml).join("")}</m:sub></m:sSub>`;
  else inner = `<m:sSup><m:e>${toOmml(kids[0])}</m:e><m:sup>${before.map(toOmml).join("")}</m:sup></m:sSup>`;
  return `<m:sPre><m:e>${inner}</m:e>${splitScripts(after)}</m:sPre>`;
}

// mtable：单列无框线 → m:eqArr；否则 m:m + m:mPr
function mTable(node) {
  const isEqArray =
    !node.attrs.frame || node.attrs.frame === "none"
      ? !node.attrs.columnlines || node.attrs.columnlines === "none"
        ? !node.attrs.rowlines || node.attrs.rowlines === "none"
          ? !node.children.some((c) => c.name === "mtr" && c.children.filter((t) => t.name === "mtd").length !== 1) &&
            !node.children.some((c) => c.name === "mlabeledtr")
          : false
        : false
      : false;

  if (isEqArray) {
    return `<m:eqArr>${node.children
      .filter((c) => c.name === "mtr" || c.name === "mlabeledtr")
      .map((tr) => {
        const tds = tr.name === "mlabeledtr" ? tr.children.slice(1) : tr.children;
        return `<m:e>${tds.map((td) => td.children.map(toOmml).join("")).join("")}</m:e>`;
      })
      .join("")}</m:eqArr>`;
  }

  const maxCells = Math.max(
    0,
    ...node.children.map((tr) =>
      tr.name === "mlabeledtr" ? tr.children.length - 1 : tr.children.filter((c) => c.name === "mtd").length
    )
  );
  const rows = node.children
    .map((tr) => {
      if (tr.name !== "mtr" && tr.name !== "mlabeledtr") {
        // 非 mtr 子元素（KaTeX 不产生）：单独一行一个格子
        return `<m:mr><m:e>${toOmml(tr)}</m:e>${"<m:e/>".repeat(Math.max(0, maxCells - 1))}</m:mr>`;
      }
      const cells = (tr.name === "mlabeledtr" ? tr.children.slice(1) : tr.children).filter((c) => c.name === "mtd");
      const inner = cells.map((td) => wrapEl("m:e", td.children.map(toOmml).join(""))).join("");
      const pad = "<m:e/>".repeat(Math.max(0, maxCells - cells.length));
      return `<m:mr>${inner}${pad}</m:mr>`;
    })
    .join("");
  return (
    `<m:m><m:mPr><m:baseJc m:val="center"/><m:plcHide m:val="on"/><m:mcs><m:mc><m:mcPr>` +
    `<m:count m:val="${maxCells}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>${rows}</m:m>`
  );
}

// ── 7. 主流程 ───────────────────────────────────────────────────────────────
function isNaryStructure(node) {
  return (
    node &&
    ["munder", "mover", "munderover", "msub", "msup", "msubsup"].includes(node.name) &&
    isNary(node.children[0])
  );
}

/**
 * token 块：从 i 开始的全部连续 token 一次处理（CreateRunWithSameProp 的递归收集）。
 * 按字体/mtext-ness 切成多个 m:r；fShouldCollect=0 的场景（fence 内、函数名、线性分数内）每个 token 独立 run。
 */
/**
 * XSLT match 模板的公共前置：当前节点是 nary 参数（前兄弟是 nary 结构）
 * → 已被 writeNary 消费，返回空（FIsNaryArgument=1 时模板直接不输出）。
 */
function isNaryArg(node) {
  const siblings = node.parent && node.parent.children;
  const idx = siblings ? siblings.indexOf(node) : -1;
  return isNaryArgPreceding(idx > 0 ? siblings[idx - 1] : null);
}

function tokenBlock(children, i, first) {
  const parent = first.parent;
  const collect =
    parent && ["mrow", "mstyle", "msqrt", "menclose", "math", "mphantom", "mtd", "maction"].includes(parent.name) &&
    !isLinearFrac(parent) && !isFunc(parent) && !isFenceOperatorToken(first);
  if (!collect) {
    let out = "";
    while (i < children.length && isToken(children[i])) {
      out += singleRun(children[i]);
      i++;
    }
    return { out, next: i };
  }
  let out = "";
  while (i < children.length && isToken(children[i])) {
    const r = collectRun(children, i);
    out += r.run;
    i = r.next;
  }
  return { out, next: i };
}

/**
 * 处理一组兄弟节点（mrow/mstyle/mtd 的内容）。
 * opts.fenced：父 mrow 是 fence → 所有 token 独立 run（官方 FFenceOperator）
 * opts.start：从指定下标开始（nary 参数 token 的 run 收集）
 */
function processChildren(children, opts = {}) {
  const start = opts.start || 0;
  const fenced = !!opts.fenced;
  let out = "";
  let i = start;
  while (i < children.length) {
    const c = children[i];
    const prev = i > 0 ? children[i - 1] : null;
    // nary 参数（或嵌套 nary 的参数）：已被 writeNary 消费，跳过（起点除外——起点本身就是参数）
    if (i > start && isNaryArgPreceding(prev)) {
      i++;
      continue;
    }
    // nary 结构：输出 m:nary 并跳过其参数（紧随的第一个兄弟）
    if (isNaryStructure(c)) {
      out += writeNary(c);
      i += 2;
      continue;
    }
    if (isToken(c)) {
      if (fenced) {
        out += singleRun(c);
        i++;
        continue;
      }
      // 前一个兄弟是 token → 已被前一个 token 块消费（含 nary 参数块）
      if (i > start && prev && isToken(prev)) {
        i++;
        continue;
      }
      const block = tokenBlock(children, i, c);
      out += block.out;
      i = block.next;
      continue;
    }
    out += toOmml(c);
    i++;
  }
  return out;
}

function toOmml(node) {
  switch (node.name) {
    case "mrow":
    case "mstyle": {
      // mrow 模板：nary 参数 → 跳过；线性分数 → 函数 → fenced 检查
      if (isNaryArg(node)) return "";
      if (node.name === "mrow") {
        if (isLinearFrac(node)) return makeLinearFrac(node);
        if (isFunc(node)) return writeFunc(node);
        if (isFencedWithScript(node.children)) return writeFencedWithScript(node.children);
        if (isFenced(node.children)) return writeFenced(node.children);
      }
      return processChildren(node.children, {});
    }
    case "mi":
    case "mn":
    case "mo":
    case "ms":
    case "mtext":
      // match 模板：nary 参数 → 跳过
      if (isNaryArg(node)) return "";
      {
        const parent = node.parent;
        const collect =
          parent && ["mrow", "mstyle", "msqrt", "menclose", "math", "mphantom", "mtd", "maction"].includes(parent.name) &&
          !isLinearFrac(node.parent) && !isFunc(node.parent) && !isFenceOperatorToken(node);
        if (!collect) return singleRun(node);
        const siblings = parent.children;
        const idx = siblings.indexOf(node);
        const prev = idx > 0 ? siblings[idx - 1] : null;
        if (prev && isToken(prev)) return ""; // 已并入前一个 run
        const r = collectRun(siblings, idx);
        return r.run;
      }
    case "mfrac":
      if (isNaryArg(node)) return "";
      return mFrac(node);
    case "mroot":
      if (isNaryArg(node)) return "";
      return mRoot(node);
    case "msqrt":
    case "menclose":
      if (isNaryArg(node)) return "";
      return mEncloseMSqrt(node);
    case "msub":
    case "msup":
    case "msubsup":
      if (isNaryArg(node)) return "";
      return mScript(node);
    case "munder":
    case "mover":
    case "munderover":
      if (isNaryArg(node)) return "";
      return mUnderOver(node);
    case "mfenced":
      if (isNaryArg(node)) return "";
      return mFenced(node);
    case "mtable":
      if (isNaryArg(node)) return "";
      return mTable(node);
    case "mmultiscripts":
      if (isNaryArg(node)) return "";
      return mMultiscripts(node);
    case "mpadded":
      if (isNaryArg(node)) return "";
      return mPadded(node);
    case "mphantom":
      if (isNaryArg(node)) return "";
      return mPhantom(node);
    case "mspace":
      return ""; // 官方直接丢弃
    case "mtd":
      return node.children.map(toOmml).join("");
    case "semantics":
    case "annotation-xml":
      return processChildren(node.children, {}); // XSLT 默认模板：透传子元素
    case "annotation":
    case "mprescripts":
    case "none":
    case "maligngroup":
    case "malignmark":
      return "";
    case "math":
      return `<m:oMath>${processChildren(node.children, {})}</m:oMath>`;
    default:
      // 未知元素：透传子元素（XSLT 默认模板）
      return processChildren(node.children, {});
  }
}

// FFenceOperator：token 是否位于 fenced mrow 内部（→ 独立 run）
function isFenceOperatorToken(node) {
  const parent = node.parent;
  if (!parent || parent.name !== "mrow") return false;
  const chOpen = fenceOpenChar(parent.children);
  const chClose = fenceCloseChar(parent.children);
  const sep = fenceSeparatorChar(parent.children);
  return isFenced(parent.children) &&
    (chOpen !== "" || chClose !== "" || sep !== "");
}

/** 入口：MathML 字符串 → <m:oMath>...</m:oMath> */
function mathmlToOmml(mathmlStr) {
  const tree = parseXml(mathmlStr);
  // 深度优先找 <math>（KaTeX 输出最外层包 <span class="katex">）
  function findMath(node) {
    if (node.name === "math") return node;
    for (const c of node.children) {
      const r = findMath(c);
      if (r) return r;
    }
    return null;
  }
  const math = findMath(tree);
  if (!math) throw new Error("未找到 <math> 根元素");
  return toOmml(math);
}

export { mathmlToOmml };
