// ============================================================================
// xml-parser.js — 轻量 XML 解析器（零依赖，针对 MathML 子集）
// ----------------------------------------------------------------------------
// 从 mathml2omml.js 拆出（原内嵌实现）：通用 XML → 节点树。
// 支持：元素/属性/文本/自闭合/注释跳过/实体解码（含数字实体）。
// 不做：CDATA、处理指令、DTD、命名空间（前缀剥离，节点名取冒号后部分）。
// 节点形态：{ name, attrs: {}, children: [], text: "", parent }
// 使用方：editor/core/mathml2omml.js（KaTeX MathML 解析）。
// ============================================================================

/** 解析 XML 字符串 → 根节点（#root，children 含顶层元素）。 */
export function parseXml(str) {
  let pos = 0;
  const root = { name: "#root", attrs: {}, children: [], text: "", parent: null };
  const stack = [root];

  const decodeEntities = (s) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, "\u00a0")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));

  while (pos < str.length) {
    const lt = str.indexOf("<", pos);
    if (lt === -1) {
      stack[stack.length - 1].text += decodeEntities(str.slice(pos));
      break;
    }
    if (lt > pos) {
      stack[stack.length - 1].text += decodeEntities(str.slice(pos, lt));
    }
    if (str.startsWith("</", lt)) {
      const end = str.indexOf(">", lt);
      stack.pop();
      pos = end + 1;
      continue;
    }
    if (str.startsWith("<!--", lt)) {
      const end = str.indexOf("-->", lt);
      pos = end + 3;
      continue;
    }
    // 开始标签
    const end = (() => {
      let i = lt + 1;
      let inQ = null;
      while (i < str.length) {
        const ch = str[i];
        if (inQ) {
          if (ch === inQ) inQ = null;
        } else if (ch === '"' || ch === "'") {
          inQ = ch;
        } else if (ch === ">") {
          return i;
        }
        i++;
      }
      return -1;
    })();
    const raw = str.slice(lt + 1, end);
    const selfClose = raw.endsWith("/");
    const tagBody = selfClose ? raw.slice(0, -1) : raw;
    const m = tagBody.match(/^([\w:.-]+)([\s\S]*)$/);
    if (!m) { pos = end + 1; continue; }
    const name = m[1].split(":").pop(); // 去命名空间前缀
    const node = { name, attrs: {}, children: [], text: "", parent: stack[stack.length - 1] };
    const attrRe = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let am;
    while ((am = attrRe.exec(m[2]))) {
      node.attrs[am[1].split(":").pop()] = decodeEntities(am[3] !== undefined ? am[3] : am[4]);
    }
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
    pos = end + 1;
  }
  return root;
}
