// ============================================================================
// richtext.js — unified rich-text DSL parsing (shared by renderer and writer)
// ----------------------------------------------------------------------------
// Input: PPTD rich-text DSL (<p>/<span style>/<strong>/<em>/<u>/<s>/<sup>/<sub>/
//        <a href>/<ul>/<ol>/<li>/<br>, with a common subset supported in the style attribute)
// Output: { paragraphs: [ { style, listType, runs: [ { text, style, href } ] } ] }
// Style fields are "omitted when unset"; the inheritance chain is handled uniformly on
// the consumer side (render/export).
// ============================================================================

import { decodeEntities } from "./escape.js";

const BLOCK_TAGS = new Set(["p", "li"]);
const LIST_TAGS = new Set(["ul", "ol"]);
const INLINE_TAGS = new Set(["span", "strong", "em", "u", "s", "sup", "sub", "a", "br"]);

// LaTeX formula delimiters: \(...\) (official PPTD rich-text spec). Rich-text tags are not
// allowed inside a formula, and only color / font-size styles are inherited (official rule).
const FORMULA_RE = /\\\(([\s\S]*?)\\\)/g;

// Tag branch: <tag ...> / </tag> / <tag .../>; text branch: (?:[^<]|<(?![a-zA-Z/]))+
// A lone < is allowed as text (when followed by a space/digit or another non-tag-start
// character, e.g. the comparison operator "<" in a formula or plain prose "a < b") —
// otherwise < would fall through both branches and be lost silently.
const TOKEN_RE = /<\/?([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\/?>|((?:[^<]|<(?![a-zA-Z\/]))+)/g;

function extractAttr(attrStr, name) {
  const m = attrStr.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

/** Parse an inline style="..." into a style object (units normalized to px/pt numbers, theme references kept as $xxx). */
function parseCss(styleStr) {
  const out = {};
  if (!styleStr) return out;
  for (const decl of styleStr.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const key = decl.slice(0, idx).trim().toLowerCase();
    let value = decl.slice(idx + 1).trim();
    if (!value) continue;
    switch (key) {
      case "font-size": {
        const n = parseFloat(value);
        if (Number.isFinite(n)) out.fontSize = n;
        break;
      }
      case "color":
        out.color = value;
        break;
      case "font-family":
        out.fontFamily = value.replace(/['"]/g, "");
        break;
      case "background-color":
        out.backgroundColor = value;
        break;
      case "font-weight":
        if (/^(bold|bolder|[6-9]00)$/i.test(value)) out.bold = true;
        else if (/^normal$/i.test(value)) out.bold = false;
        break;
      case "font-style":
        if (/^italic$/i.test(value)) out.italic = true;
        else if (/^normal$/i.test(value)) out.italic = false;
        break;
      case "text-decoration":
        if (value === "underline") out.underline = true;
        if (value === "line-through") out.strike = true;
        break;
      case "text-align":
        out.textAlign = value;
        break;
      case "line-height": {
        const n = parseFloat(value);
        if (Number.isFinite(n)) {
          if (value.endsWith("px")) out.lineHeightPx = n;
          else out.lineHeight = n;
        }
        break;
      }
      case "margin-top": {
        const n = parseFloat(value);
        if (Number.isFinite(n)) out.marginTop = n;
        break;
      }
      case "margin-left": {
        const n = parseFloat(value);
        if (Number.isFinite(n)) out.marginLeft = n;
        break;
      }
      case "margin-right": {
        const n = parseFloat(value);
        if (Number.isFinite(n)) out.marginRight = n;
        break;
      }
      case "letter-spacing": {
        const n = parseFloat(value);
        if (Number.isFinite(n)) out.letterSpacing = n;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// Tokenize + recursively parse into a node tree
// ----------------------------------------------------------------------------
function tokenize(input) {
  const tokens = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(input)) !== null) {
    if (m[3] !== undefined) {
      tokens.push({ type: "text", text: decodeEntities(m[3]) });
    } else {
      const name = m[1].toLowerCase();
      const attrs = m[2] || "";
      const isClose = m[0].startsWith("</");
      tokens.push({ type: "tag", name, attrs, isClose, selfClose: m[0].endsWith("/>") });
    }
  }
  return tokens;
}

function parseNodes(tokens, i, stack) {
  const nodes = [];
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === "text") {
      nodes.push({ type: "text", text: tok.text });
      i += 1;
      continue;
    }
    if (tok.isClose) {
      return { nodes, i: i + 1 }; // consume the closing tag so it is not returned twice
    }
    // open tag
    const tagStyle = parseCss(extractAttr(tok.attrs, "style") || "");
    const node = {
      type: "tag",
      name: tok.name,
      style: tagStyle,
      href: extractAttr(tok.attrs, "href"),
      children: [],
      selfClose: tok.selfClose,
    };
    if (!INLINE_TAGS.has(tok.name) && !BLOCK_TAGS.has(tok.name) && !LIST_TAGS.has(tok.name)) {
      // unknown tag: treated as plain text, does not swallow the content
      i += 1;
      continue;
    }
    i += 1;
    if (tok.selfClose || tok.name === "br") {
      nodes.push(node);
      continue;
    }
    const inner = parseNodes(tokens, i, stack);
    node.children = inner.nodes;
    i = inner.i;
    nodes.push(node);
  }
  return { nodes, i };
}

// ----------------------------------------------------------------------------
// Node tree -> paragraph/run tree
// ----------------------------------------------------------------------------
function mergeStyle(base, extra) {
  if (!extra) return base;
  return { ...base, ...extra };
}

function nodesToParagraphs(nodes) {
  const paragraphs = [];
  let para = null; // { style, listType, runs }
  const styleStack = [{}]; // inline style stack (merge chain)
  let listType = null; // ul | ol | null

  const flushPara = () => {
    if (para && para.runs.length > 0) paragraphs.push(para);
    if (para) para = null;
  };
  const ensurePara = () => {
    if (!para) {
      para = { style: {}, listType, runs: [] };
    }
  };
  const pushRun = (text, extraStyle, href) => {
    ensurePara();
    const merged = mergeStyle(styleStack[styleStack.length - 1], extraStyle);
    const h = href || merged.href || null;
    const style = { ...merged };
    delete style.href;
    const last = para.runs[para.runs.length - 1];
    if (last && last.href === h && sameStyle(last.style, style)) {
      last.text += text;
    } else {
      para.runs.push({ text, style, href: h });
    }
  };
  /** Formula run: inherits only color / font-size from the current context (official spec), takes no part in run merging. */
  const pushFormula = (latex, extraStyle) => {
    ensurePara();
    const merged = mergeStyle(styleStack[styleStack.length - 1], extraStyle);
    const style = {};
    if (merged.color) style.color = merged.color;
    if (merged.fontSize) style.fontSize = merged.fontSize;
    para.runs.push({ formula: true, latex, style });
  };
  const sameStyle = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const walk = (nodeList) => {
    for (const node of nodeList) {
      if (node.type === "text") {
        // skip all-whitespace text nodes (newlines/indentation between tags) to avoid empty paragraphs
        if (!node.text.trim()) continue;
        // Formulas mixed into text: split \(...\) into formula runs (official PPTD rich-text spec)
        let last = 0;
        let m;
        FORMULA_RE.lastIndex = 0;
        while ((m = FORMULA_RE.exec(node.text)) !== null) {
          if (m.index > last) pushRun(node.text.slice(last, m.index), null, null);
          pushFormula(m[1], null);
          last = m.index + m[0].length;
        }
        if (last === 0) {
          pushRun(node.text, null, null);
        } else if (last < node.text.length) {
          pushRun(node.text.slice(last), null, null);
        }
        continue;
      }
      const name = node.name;
      if (name === "br") {
        pushRun("\n", null, null);
        continue;
      }
      if (name === "p") {
        flushPara();
        ensurePara();
        para.style = { ...para.style, ...node.style };
        if (node.children.length) walk(node.children);
        flushPara();
        continue;
      }
      if (name === "li") {
        flushPara();
        ensurePara();
        para.listType = listType;
        para.style = { ...para.style, ...node.style };
        if (node.children.length) walk(node.children);
        flushPara();
        continue;
      }
      if (name === "ul" || name === "ol") {
        const prev = listType;
        listType = name;
        walk(node.children);
        listType = prev;
        continue;
      }
      // inline tag
      if (name === "strong") styleStack.push({ bold: true });
      else if (name === "em") styleStack.push({ italic: true });
      else if (name === "u") styleStack.push({ underline: true });
      else if (name === "s") styleStack.push({ strike: true });
      else if (name === "sup") styleStack.push({ verticalAlign: "superscript" });
      else if (name === "sub") styleStack.push({ verticalAlign: "subscript" });
      else if (name === "span") styleStack.push(node.style);
      else if (name === "a") styleStack.push({ color: "#0563C1", underline: true, href: node.href });
      walk(node.children);
      styleStack.pop();
    }
  };

  walk(nodes);
  flushPara();

  // Normalize trailing newlines in paragraphs (keeps preview and export aligned; fixes an
  // extra empty line at the end of an exported text box):
  // a contenteditable/textarea edit often leaves a trailing <br/>, empty <p> or a trailing \n.
  // The preview's white-space:pre-line collapses a trailing newline, but on export a trailing \n
  // serializes to <a:br/> plus an empty run, which PowerPoint renders as a redundant blank line.
  // Rule: strip trailing \n from each paragraph's last run; drop an entirely empty trailing
  // paragraph (newline/whitespace only); keep a standalone <br/> blank-line paragraph in the
  // middle of the text as is (visible in the preview, identical in the export).
  for (const para of paragraphs) {
    const lastRun = para.runs[para.runs.length - 1];
    if (!lastRun || lastRun.formula) continue; // a formula run has no text, so no trailing-newline issue
    const stripped = lastRun.text.replace(/\n+$/, "");
    if (stripped === lastRun.text) continue; // no trailing newline
    if (stripped === "" && para.runs.length === 1) continue; // a paragraph holding only <br/> (blank line) -> keep as is
    lastRun.text = stripped;
    if (!lastRun.text) para.runs.pop(); // the last run became empty after stripping -> remove it
  }
  while (paragraphs.length > 0) {
    const last = paragraphs[paragraphs.length - 1];
    if (last.runs.some((r) => (r.formula ? true : r.text.trim() !== ""))) break; // has real content -> stop
    paragraphs.pop(); // trailing empty paragraph -> drop
  }
  return paragraphs;
}

/**
 * Parse the rich-text DSL.
 * @param {string} input rich-text DSL (plain text also works)
 * @returns {{paragraphs: Array}}
 */
export function parseRichText(input) {
  if (input == null) return { paragraphs: [] };
  const tokens = tokenize(String(input));
  const { nodes } = parseNodes(tokens, 0, null);
  const paragraphs = nodesToParagraphs(nodes);
  if (paragraphs.length === 0) {
    paragraphs.push({ style: {}, runs: [{ text: "", style: {}, href: null }] });
  }
  return { paragraphs };
}

