// ============================================================================
// mathml2omml.js — MathML -> OMML (PowerPoint native formulas); pure JS, zero dependencies
// ----------------------------------------------------------------------------
// Input: Presentation MathML produced by KaTeX (a <math>...</math> string)
// Output: an <m:oMath>...</m:oMath> string (without a namespace declaration, added on injection)
//
// v2 rewrite: reproduces the behavior of Microsoft's official MML2OMML.XSL item by item
// (byte-level comparison against the official XSLT output; regression: npm test, 204 cases
// against the fixed official references):
//   1. run merging: adjacent same-font mi/mn/mo/ms/mtext merge into one m:r (mtext merges only
//      with mtext; tokens inside a fence are forced to a single run and never merge — the
//      official fFenceOperator behavior)
//   2. nary scope: the m:e of ∑/∫/∏ absorbs only [the immediately following first sibling]
//      (mrow/mstyle are unwrapped and their children taken); the remaining siblings stay
//      outside the nary (the official NaryHandleMrowMstyle behavior)
//   3. fence: \left( \right) and (x)^2 (FFencedWithScript) -> m:d; begChr/endChr are omitted
//      when they are the defaults "("/")"; sepChr is omitted when it is "|", otherwise written
//      explicitly (including the empty string)
//   4. accents: the chr of m:acc goes through the ToUpperCombining mapping (^ -> U+0302 etc.)
//   5. a single-child mstyle wrapper produces no extra output; mspace is dropped outright;
//      a whitespace-only mtext gets no m:nor
// ============================================================================

import { parseXml } from "./xml-parser.js";
import { escText } from "./escape.js";

// -- 2. Helpers --------------------------------------------------------------
const esc = escText; // OMML text-node escaping (& < >; quotes need no escaping), single implementation in escape.js

// XSLT string value: all descendant text concatenated in document order (a token with child
// elements is flattened straight to text in the official output)
function stringValue(node) {
  if (!node.children.length) return node.text;
  let s = node.text;
  for (const c of node.children) s += stringValue(c);
  return s;
}

// CreateArgProp: scriptlevel ∈ {0,1,2} of the nearest ancestor-or-self mstyle -> m:argPr
function argProp(node) {
  for (let n = node; n; n = n.parent) {
    if (n.name === "mstyle" && ["0", "1", "2"].includes(n.attrs.scriptlevel)) {
      return `<m:argPr><m:scrLvl m:val="${esc(n.attrs.scriptlevel)}"/></m:argPr>`;
    }
  }
  return "";
}

// XSLT normalize-space: only ASCII whitespace (#x20 #x9 #xD #xA) is collapsed, NBSP is preserved
const normalizeSpace = (s) => (s || "").replace(/[\t\r\n ]+/g, " ").replace(/^ | $/g, "");

const isToken = (n) =>
  n && (n.name === "mi" || n.name === "mn" || n.name === "mo" || n.name === "ms" || n.name === "mtext");

const isNumeric = (t) => t !== "" && !isNaN(Number(t));

// Math default font (the default branch of GetFontCur; KaTeX emits no fontstyle/fontweight)
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
  return "normal"; // multi-char mi, non-numeric mn, ms, mtext
}

// FNor: mtext -> m:nor (except when the content is whitespace only, NBSP included)
function fNor(node) {
  if (node.name !== "mtext") return 0;
  return normalizeSpace(stringValue(node).replace(/\u00a0/g, " ")) === "" ? 0 : 1;
}

// CreateMathScrStyProp: font -> m:scr / m:sty mapping
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

// lxml serialization rule: empty elements are always self-closed (official output behavior, see KNOWN-DIFFS pitfall 6)
const wrapEl = (name, inner) => (inner ? `<${name}>${inner}</${name}>` : `<${name}/>`);

// CreateRunProp: emit m:rPr when fNor=1 or the font is not italic/empty
function runProps(font, nor) {
  if (!(nor === 1 || (font !== "italic" && font !== ""))) return "";
  return `<m:rPr>${nor === 1 ? "<m:nor/>" : ""}${mathScrSty(font, nor)}</m:rPr>`;
}

/** Single token -> an independent m:r (the fShouldCollect=0 path: inside a fence, a function name, inside a linear fraction) */
function singleRun(node) {
  return `<m:r>${runProps(getFontCur(node), fNor(node))}<m:t>${esc(normalizeSpace(stringValue(node)))}</m:t></m:r>`;
}

// CreateRunWithSameProp merge test: can token t join the current run of font `font`
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
      // bold / bi / script / double-struck … merge only when the explicit mathvariant matches (KaTeX always gives it explicitly)
      return false;
  }
}

/** Collect consecutive same-font tokens starting at siblings[start]; returns {run, next} */
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

// -- 3. Constant tables (all copied straight from the official XSLT; do not change — any change requires re-running npm test) --
// This block holds 6 tables: NARY_OPS / NARY_GROW / OPEN_CHARS / CLOSE_CHARS /
// FENCE_MATCH / TO_UPPER_COMBINING. Matching XSLT variables: IsNaryOper,
// NaryGrowDefault, OpenChars, CloseChars, FENCE_MATCH, ToUpperCombining.
// isNaryOper: the n-ary operator character set
const NARY_OPS = new Set(
  "∫∬∭∮∯∰∲∳∱∩∪∏∐∑⋀⋁⋂⋃℀⅋⨀⨂⨉⋏⋎⨓⨔⨄⨅⨌⨍⨎⨏⨐⨑⨒⨓⨔⨕⨖⨗⨘⨙⨚⨛⨜".split("")
);

// The grow default table of CreateNaryProp
const NARY_GROW = new Set("∫∮∯∲∳∩∪∏∑⋀⋁⋂⋃".split(""));

// OpenChars / CloseChars (fence detection character tables)
const OPEN_CHARS = "([{<\u230a\u2308\u27e6]|\u2016";
const CLOSE_CHARS = ")]}>\u230b\u2309\u27e7[|\u2016";
const FENCE_MATCH = {
  "(": ")", "[": "]", "{": "}", "<": ">",
  "\u230a": "\u230b", "\u2308": "\u2309", "\u27e6": "\u27e7",
  ")": "(", "]": "[", "}": "{", ">": "<",
  "\u230b": "\u230a", "\u2309": "\u2308", "\u27e7": "\u27e6",
  "|": "|", "\u2016": "\u2016",
};

// ToUpperCombining: spacing accent -> combining accent
const TO_UPPER_COMBINING = {
  "\u02d8": "\u0306", "\u00b8": "\u0312", "\u0060": "\u0300",
  "\u002d": "\u0305", "\u2212": "\u0305", "\u002e": "\u0307",
  "\u02d9": "\u0307", "\u02dd": "\u030b", "\u00b4": "\u0301",
  "\u007e": "\u0303", "\u02dc": "\u0303", "\u00a8": "\u0308",
  "\u02c7": "\u030c", "\u005e": "\u0302", "\u00af": "\u0305",
  "\u2192": "\u20d7", "\u27f6": "\u20d7", "\u2190": "\u20d6",
};

// -- 4. Fence detection and m:d ----------------------------------------------------
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

// CreateDelimProp: omitted when begChr is "(", endChr is ")" or sepChr is "|" (every other value — including the empty string — is written explicitly)
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

// WriteFenced: mrow whose first and last children are a matching fence pair -> m:d (split into several m:e by the separator)
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

// FFencedWithScript: the (x)^2 pattern — the closing fence is the base of the last script element
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
  // WriteFencedContent: m:d (begChr/endChr go through CreateDelimProp, sepChr explicitly empty)
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

// -- 5. n-ary ------------------------------------------------------------------
// isNary: the last descendant of base (possibly an mrow/mstyle chain) is an n-ary operator mo
function isNary(base) {
  if (!base) return false;
  // only mo/mstyle/mrow are allowed along the chain
  for (let n = base; n; n = n.children[0]) {
    if (n.name !== "mo" && n.name !== "mstyle" && n.name !== "mrow") return false;
    if (n.children.length === 0) {
      // the last node must be an mo and an n-ary operator
      if (n.name === "mo" && NARY_OPS.has(normalizeSpace(n.text))) {
        // must not be marked as an accent
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

// The mo text of isNary (take the last mo along the mrow/mstyle chain)
function naryChr(base) {
  let n = base;
  while (n && n.children.length === 1 && n.children[0].name !== "mo") n = n.children[0];
  return normalizeSpace(n.text);
}

// FIsNaryArgument: whether a node immediately follows an n-ary structure (its preceding sibling is an n-ary script)
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

// Same structure as the XSLT: the sibling immediately following the nary node itself (or its single-child mstyle parent)
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
  // empty elements self-close (consistent with lxml serialization)
  const ap = argProp(node);
  const subXml = sub ? `<m:sub>${ap}${sub}</m:sub>` : "<m:sub/>";
  const supXml = sup ? `<m:sup>${ap}${sup}</m:sup>` : "<m:sup/>";
  const eXml = e ? `<m:e>${ap}${e}</m:e>` : "<m:e/>";
  return `<m:nary>${pr}${subXml}${supXml}${eXml}</m:nary>`;
}

// NaryHandleMrowMstyle: the m:e content of a nary (handles only the immediately following first sibling)
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
        // MNonGlyphToken called directly: it emits only the token block starting at the argument (excluding later siblings)
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

// -- 6. Structure mapping -------------------------------------------------------
// FLinearFrac: mrow[a, /, b] -> m:f lin
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

// FIsFunc: mrow[name, U+2061, arg] -> m:func
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
  // Official msqrt/menclose(radical): CreateArgProp is always called inside m:deg (deg self-closes when the content is empty)
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
  // FIsAcc (mover only)
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
  // Official FFull: contains a non-zero digit -> full; all digits zero -> zero (emits zeroWid/zeroAsc/zeroDesc); no digit -> full
  // (Word has only zero/full: 0em -> zero, 0.6em/+0.6em -> full, references like "height" -> full)
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
  // Official MPadded: CreateArgProp is not called inside m:e (unlike mroot/msqrt); empty content self-closes
  return `<m:phant>${pr}${wrapEl("m:e", node.children.map(toOmml).join(""))}</m:phant>`;
}

function mPhantom(node) {
  return `<m:phant><m:phantPr><m:show m:val="off"/></m:phantPr><m:e>${argProp(node)}${node.children.map(toOmml).join("")}</m:e></m:phant>`;
}

// MMultiscripts ({}_a^b etc.)
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

// mtable: a single borderless column -> m:eqArr; otherwise m:m + m:mPr
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
        // non-mtr child element (KaTeX never produces one): a row with a single cell
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

// -- 7. Main flow ---------------------------------------------------------------
function isNaryStructure(node) {
  return (
    node &&
    ["munder", "mover", "munderover", "msub", "msup", "msubsup"].includes(node.name) &&
    isNary(node.children[0])
  );
}

/**
 * Token block: all consecutive tokens starting at i are processed at once (the recursive
 * collection of CreateRunWithSameProp).
 * Split into several m:r by font/mtext-ness; in fShouldCollect=0 scenarios (inside a fence, a
 * function name, inside a linear fraction) each token becomes its own run.
 */
/**
 * Common prefix of the XSLT match templates: the current node is an nary argument (its
 * preceding sibling is an nary structure)
 * -> already consumed by writeNary, so return empty (with FIsNaryArgument=1 the template emits nothing).
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
 * Process a group of sibling nodes (the content of mrow/mstyle/mtd).
 * opts.fenced: the parent mrow is a fence -> every token becomes its own run (official FFenceOperator)
 * opts.start: start at the given index (run collection for nary-argument tokens)
 */
function processChildren(children, opts = {}) {
  const start = opts.start || 0;
  const fenced = !!opts.fenced;
  let out = "";
  let i = start;
  while (i < children.length) {
    const c = children[i];
    const prev = i > 0 ? children[i - 1] : null;
    // nary argument (or an argument of a nested nary): already consumed by writeNary, skip it
    // (except the start index — the start itself is the argument)
    if (i > start && isNaryArgPreceding(prev)) {
      i++;
      continue;
    }
    // nary structure: emit m:nary and skip its argument (the immediately following first sibling)
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
      // the preceding sibling is a token -> already consumed by the previous token block (including an nary argument block)
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
      // mrow template: nary argument -> skip; linear fraction -> function -> fence checks
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
      // match template: nary argument -> skip
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
        if (prev && isToken(prev)) return ""; // already merged into the previous run
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
      return ""; // dropped outright by the official spec
    case "mtd":
      return node.children.map(toOmml).join("");
    case "semantics":
    case "annotation-xml":
      return processChildren(node.children, {}); // XSLT default template: pass child elements through
    case "annotation":
    case "mprescripts":
    case "none":
    case "maligngroup":
    case "malignmark":
      return "";
    case "math":
      return `<m:oMath>${processChildren(node.children, {})}</m:oMath>`;
    default:
      // unknown element: pass child elements through (XSLT default template)
      return processChildren(node.children, {});
  }
}

// FFenceOperator: whether a token sits inside a fenced mrow (-> its own run)
function isFenceOperatorToken(node) {
  const parent = node.parent;
  if (!parent || parent.name !== "mrow") return false;
  const chOpen = fenceOpenChar(parent.children);
  const chClose = fenceCloseChar(parent.children);
  const sep = fenceSeparatorChar(parent.children);
  return isFenced(parent.children) &&
    (chOpen !== "" || chClose !== "" || sep !== "");
}

/** Entry: MathML string -> <m:oMath>...</m:oMath> */
function mathmlToOmml(mathmlStr) {
  const tree = parseXml(mathmlStr);
  // Depth-first search for <math> (KaTeX wraps its output in an outer <span class="katex">)
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
