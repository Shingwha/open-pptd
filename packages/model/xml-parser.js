// ============================================================================
// xml-parser.js — lightweight XML parser (zero dependencies, targeting a MathML subset)
// ----------------------------------------------------------------------------
// Split out of mathml2omml.js (previously an inline implementation): generic XML -> node tree.
// Supports: elements/attributes/text/self-closing tags/skipped comments/entity decoding
// (including numeric entities, see escape.js).
// Does not do: CDATA, processing instructions, DTD, namespaces (prefix stripped,
// node name is the part after the colon).
// Node shape: { name, attrs: {}, children: [], text: "", parent }
// Consumers: packages/model/mathml2omml.js (KaTeX MathML parsing).
// ============================================================================

import { decodeEntities } from "./escape.js";

/** Parse an XML string -> root node (#root, whose children are the top-level elements). */
export function parseXml(str) {
  let pos = 0;
  const root = { name: "#root", attrs: {}, children: [], text: "", parent: null };
  const stack = [root];

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
    // start tag
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
    const name = m[1].split(":").pop(); // strip namespace prefix
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
