// ============================================================================
// writer/font.js — 字体嵌入装配（deck 声明 → fntdata 部件 + XML 注册片段）
// ----------------------------------------------------------------------------
// 流程：collectFontSpecs 收集声明（资源表 + 组件槽内联）→ loadFontBytes 加载
// → fontToFntdata（fsType 校验 / 子集化 / EOT 封装）→ 输出 fntdata 部件 +
// embeddedFontLst XML + font 关系。4 处注册由 parts.js / pptx.js 完成。
//
// 字体字节来源（双端）：
//   - options.fontFiles[family]：预读缓存（Node 导出层 / 浏览器编辑器）
//   - spec.url：fetch（CDN，需 CORS；Node 18+ 全局 fetch）
//   - spec.file：仅 Node 端由调用方预读为 fontFiles（pptd-export.js）
// ============================================================================

import { parseFontInfo, checkEmbeddable, buildEot, subsetTtf } from "../core/font.js";
import { parseFontResources } from "../core/theme.js";

const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * 从 deck.fonts 收集嵌入字体规格（按 family 去重）：
 *   - 字体资源表项（除组件槽外的任意键，带 file/url）
 *   - 组件槽内联对象（{ family, file/url, subset }）
 * 组件槽字符串（系统字体名或资源 key）不产生嵌入。
 */
export function collectFontSpecs(deck) {
  const fonts = deck?.fonts;
  if (!fonts || typeof fonts !== "object") return [];
  const specs = [];
  const seen = new Set();
  const push = (v) => {
    if (!v || typeof v !== "object") return;
    const family = v.family || v.name;
    if (!family || !(v.file || v.url) || seen.has(family)) return;
    seen.add(family);
    specs.push({ family, file: v.file || null, url: v.url || null, subset: !!v.subset });
  };
  for (const res of Object.values(parseFontResources(fonts))) push(res); // 资源表（扩展字段）
  return specs;
}

/** 收集 deck 全部文本字符（text / table 元素；chart 标题后续），子集化用。 */
export function collectTextChars(deck) {
  const chars = new Set();
  const add = (s) => {
    if (typeof s !== "string" || !s) return;
    for (const ch of s) chars.add(ch.codePointAt(0));
  };
  for (const page of deck?.pages || []) {
    for (const el of page?.elements || []) {
      if (el.elementType === "text") {
        add(el.content?.text);
      } else if (el.elementType === "table") {
        for (const row of el.content?.rows || []) {
          for (const cell of row) {
            if (typeof cell === "string") add(cell);
            else add(cell?.text);
          }
        }
      }
    }
  }
  return chars;
}

/** 加载字体字节：fontFiles 预读 > url（fetch，双端）。失败返回 null。 */
export async function loadFontBytes(spec, options = {}) {
  if (options.fontFiles?.[spec.family]) return new Uint8Array(options.fontFiles[spec.family]);
  if (spec.url) {
    try {
      const res = await fetch(spec.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.warn(`[font] 网络字体拉取失败: ${spec.url}（${e.message}）`);
      return null;
    }
  }
  return null;
}

/**
 * 单个字体 → fntdata EOT 字节：子集化（TrueType）或全量（CFF 回退）。
 * @returns {{ bytes: Uint8Array, subset: boolean, info: object }}
 */
export function fontToFntdata(bytes, chars, wantSubset) {
  const info = parseFontInfo(bytes);
  if (wantSubset) {
    try {
      const subset = subsetTtf(bytes, chars);
      return { bytes: buildEot(subset, parseFontInfo(subset), 0x1), subset: true, info };
    } catch (e) {
      console.warn(`[font] ${info.family} 子集化不可用（${e.message}），回退全量嵌入`);
    }
  }
  return { bytes: buildEot(bytes, info, 0), subset: false, info };
}

/**
 * 装配嵌入字体：收集 → 加载 → 校验 → 子集化/EOT → 部件 + XML 片段。
 * @param {object} options embedFonts=false 时跳过嵌入（声明保留，仅本次导出不嵌）
 * @returns {Promise<{ parts: {path,bytes}[], lstXml: string, rels: {id,target}[],
 *                     subsetMode: boolean }>}
 */
export async function buildEmbeddedFonts(deck, options = {}) {
  const empty = { parts: [], lstXml: "", rels: [], subsetMode: false };
  if (options.embedFonts === false) return empty;
  const specs = collectFontSpecs(deck);
  if (!specs.length) return empty;

  const charText = [...collectTextChars(deck)].map((c) => String.fromCodePoint(c)).join("");
  const parts = [];
  const rels = [];
  const lstItems = [];
  let subsetMode = false;

  for (const spec of specs) {
    const bytes = await loadFontBytes(spec, options);
    if (!bytes) continue;
    let result;
    try {
      result = fontToFntdata(bytes, charText, spec.subset);
    } catch (e) {
      console.warn(`[font] 字体「${spec.family}」嵌入失败: ${e.message}`);
      continue;
    }
    const check = checkEmbeddable(result.info.fsType);
    if (!check.ok) {
      console.warn(`[font] 跳过「${spec.family}」: ${check.reason}`);
      continue;
    }
    const n = parts.length + 1;
    const slot = result.info.weight >= 700 ? "bold" : result.info.italic ? "italic" : "regular"; // weight→bold / italic→italic / 否则 regular
    parts.push({ path: `ppt/fonts/font${n}.fntdata`, bytes: result.bytes });
    rels.push({ id: `rIdFont${n}`, target: `fonts/font${n}.fntdata` });
    lstItems.push(
      `<p:embeddedFont><p:font typeface="${escAttr(result.info.family)}"/>` +
      `<p:${slot} r:id="rIdFont${n}"/></p:embeddedFont>`
    );
    if (result.subset) subsetMode = true;
    console.log(`[font] 嵌入 ${result.info.family}（${slot}）: ${bytes.length}B → ${result.bytes.length}B${result.subset ? "（子集化）" : ""}`);
  }
  return {
    parts,
    lstXml: lstItems.length ? `<p:embeddedFontLst>${lstItems.join("")}</p:embeddedFontLst>` : "",
    rels,
    subsetMode,
  };
}
