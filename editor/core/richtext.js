// ============================================================================
// richtext.js — 统一富文本 DSL 解析（渲染器与 writer 共享）
// ----------------------------------------------------------------------------
// 输入：PPTD 富文本 DSL（<p>/<span style>/<strong>/<em>/<u>/<s>/<sup>/<sub>/
//       <a href>/<ul>/<ol>/<li>/<br>，style 属性支持常用子集）
// 输出：{ paragraphs: [ { style, listType, runs: [ { text, style, href } ] } ] }
// 样式字段"未设置即省略"，继承链在消费端（渲染/导出）统一处理。
// ============================================================================

const BLOCK_TAGS = new Set(["p", "li"]);
const LIST_TAGS = new Set(["ul", "ol"]);
const INLINE_TAGS = new Set(["span", "strong", "em", "u", "s", "sup", "sub", "a", "br"]);

// LaTeX 公式分隔符：\(...\)（官方 PPTD 富文本规范）。公式内不允许富文本标签，
// 且只继承 color / font-size 两种样式（官方规定）。
const FORMULA_RE = /\\\(([\s\S]*?)\\\)/g;

// 标签分支：<tag ...> / </tag> / <tag .../>；文本分支：(?:[^<]|<(?![a-zA-Z/]))+
// 允许孤立 < 作为文本（后跟空格/\数字等非标签起始字符时，如公式里的比较符
// "<"、普通文本 "a < b"）——否则 < 会被两个分支同时漏掉而静默丢失。
const TOKEN_RE = /<\/?([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\/?>|((?:[^<]|<(?![a-zA-Z\/]))+)/g;

/** HTML 实体解码（编辑器 DOM 回写时 escText 会把 < > & 转义为 &lt; &gt; &amp;）。
 * 公式里 cases 的 & 列分隔符（非实体名形式）原样保留。 */
function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (m, name) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[name]
  );
}

function extractAttr(attrStr, name) {
  const m = attrStr.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

/** 解析内联 style="..." 为样式对象（单位统一为 px/pt 数值，主题引用保留 $xxx）。 */
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
// Tokenize + 递归解析为节点树
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
      return { nodes, i: i + 1 }; // 消费闭合标签，避免重复返回
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
      // 未知标签：视为纯文本，不吞内容
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
// 节点树 → 段落/run 树
// ----------------------------------------------------------------------------
function mergeStyle(base, extra) {
  if (!extra) return base;
  return { ...base, ...extra };
}

function nodesToParagraphs(nodes) {
  const paragraphs = [];
  let para = null; // { style, listType, runs }
  const styleStack = [{}]; // 内联样式栈（合并链）
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
  /** 公式 run：只继承当前上下文的 color / font-size（官方规范），不参与 run 合并。 */
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
        // 跳过全空白文本节点（标签间换行/缩进），避免产生空段落
        if (!node.text.trim()) continue;
        // 文本中混排公式：\(...\) 拆分为 formula run（官方 PPTD 富文本规范）
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
      // 内联标签
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

  // 归一化段落末尾换行（保持预览与导出一致，修复导出文本框末尾多出空行）：
  // contenteditable/textarea 编辑结束时常在末尾遗留 <br/>、空 <p> 或以 \n 收尾；
  // 预览的 white-space:pre-line 会折叠段落末尾的换行，但导出时尾部 \n 会序列化为
  // <a:br/> + 空 run，PowerPoint 会渲染成多余空行。
  // 规则：每段去掉最后一个 run 尾部的 \n；末尾的空段（仅换行/空白）整段丢弃；
  // 文本中间独立的 <br/> 空行段原样保留（预览可见，导出一致）。
  for (const para of paragraphs) {
    const lastRun = para.runs[para.runs.length - 1];
    if (!lastRun || lastRun.formula) continue; // 公式 run 无 text，无尾部换行问题
    const stripped = lastRun.text.replace(/\n+$/, "");
    if (stripped === lastRun.text) continue; // 无尾部换行
    if (stripped === "" && para.runs.length === 1) continue; // 段内仅 <br/>（空行段）→ 保留原样
    lastRun.text = stripped;
    if (!lastRun.text) para.runs.pop(); // 末 run 去尾后变空 → 移除
  }
  while (paragraphs.length > 0) {
    const last = paragraphs[paragraphs.length - 1];
    if (last.runs.some((r) => (r.formula ? true : r.text.trim() !== ""))) break; // 有实际内容 → 停
    paragraphs.pop(); // 末尾空段 → 丢弃
  }
  return paragraphs;
}

/**
 * 解析富文本 DSL。
 * @param {string} input 富文本 DSL（纯文本也可）
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

/** 纯文本提取（公式以 \(...\) 源码形式保留，编辑/无障碍用）。 */
export function richTextPlainText(input) {
  return parseRichText(input)
    .paragraphs.map((p) =>
      p.runs.map((r) => (r.formula ? `\\(${r.latex}\\)` : r.text)).join("")
    )
    .join("\n");
}

// ============================================================================
// DOM → DSL（contenteditable 编辑后反向序列化）
// ============================================================================

function escText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** 段落级内联样式（text-align / line-height / margin-top...）→ style 属性字符串。 */
function pStyleAttr(el) {
  const s = el.style || {};
  const parts = [];
  if (s.textAlign) parts.push(`text-align:${s.textAlign}`);
  if (s.lineHeight && s.lineHeight !== "normal") {
    const n = parseFloat(s.lineHeight);
    if (s.lineHeight.endsWith("px")) parts.push(`line-height:${n}px`);
    else if (Number.isFinite(n)) parts.push(`line-height:${n}`);
  }
  if (s.marginTop && parseFloat(s.marginTop) > 0) parts.push(`margin-top:${parseFloat(s.marginTop)}px`);
  if (s.marginLeft && parseFloat(s.marginLeft) > 0) parts.push(`margin-left:${parseFloat(s.marginLeft)}px`);
  if (s.letterSpacing) parts.push(`letter-spacing:${parseFloat(s.letterSpacing)}px`);
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

/** run 级内联样式 → style 属性字符串。 */
function spanStyleAttr(el) {
  const s = el.style || {};
  const parts = [];
  if (s.color) parts.push(`color:${s.color}`);
  if (s.fontSize && s.fontSize !== "0.7em") parts.push(`font-size:${s.fontSize}`);
  if (s.fontWeight && s.fontWeight !== "normal") parts.push(`font-weight:${s.fontWeight}`);
  if (s.fontStyle && s.fontStyle !== "normal") parts.push(`font-style:${s.fontStyle}`);
  if (s.backgroundColor) parts.push(`background-color:${s.backgroundColor}`);
  if (s.textDecoration && s.textDecoration.includes("underline")) parts.push("text-decoration:underline");
  if (s.textDecoration && s.textDecoration.includes("line-through")) parts.push("text-decoration:line-through");
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

/** <font> 标签（execCommand 产物）→ span style。 */
function fontStyleAttr(el) {
  const parts = [];
  const color = el.getAttribute("color");
  if (color) parts.push(`color:${color}`);
  const size = el.getAttribute("size");
  if (size) {
    const px = { 1: 9, 2: 12, 3: 15, 4: 18, 5: 24, 6: 30, 7: 36 }[size];
    if (px) parts.push(`font-size:${px}px`);
  }
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

function nodeToDsl(node) {
  if (node.nodeType === 3) return escText(node.textContent);
  if (node.nodeType !== 1) return "";
  const el = node;
  const tag = el.tagName.toLowerCase();
  const kids = Array.from(el.childNodes).map(nodeToDsl).join("");
  switch (tag) {
    case "div":
    case "p":
      return `<p${pStyleAttr(el)}>${kids}</p>`;
    case "br":
      return "<br/>";
    case "ul":
      return `<ul>${kids}</ul>`;
    case "ol":
      return `<ol>${kids}</ol>`;
    case "li":
      return `<li${pStyleAttr(el)}>${kids}</li>`;
    case "strong":
    case "b":
      return `<strong>${kids}</strong>`;
    case "em":
    case "i":
      return `<em>${kids}</em>`;
    case "u":
      return `<u>${kids}</u>`;
    case "s":
    case "strike":
    case "del":
      return `<s>${kids}</s>`;
    case "a":
      return `<a href="${escAttr(el.getAttribute("href") || "")}">${kids}</a>`;
    case "span":
      return `<span${spanStyleAttr(el)}>${kids}</span>`;
    case "font":
      return `<span${fontStyleAttr(el)}>${kids}</span>`;
    default:
      return kids;
  }
}

/**
 * 把 contenteditable 的 DOM 转回富文本 DSL。
 * @param {HTMLElement} root contenteditable 容器
 * @returns {string} DSL 字符串
 */
export function domToRichText(root) {
  let out = "";
  for (const node of root.childNodes) out += nodeToDsl(node);
  return out;
}
