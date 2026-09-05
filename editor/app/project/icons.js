// ============================================================================
// app/project/icons.js — FA 图标预读与按需加载（模式同 images.js 的 imageMap）
// ----------------------------------------------------------------------------
// state.iconMap: { [rawIconName]: {inner, w, h} }（normalizeIconSvg 产物）。
// 渲染端（renderer/icon.js 经 renderPage opts.iconMap）与导出端
// （saver → buildPptx options.iconDefs）共用同一份缓存。
//
// 模块级单例（编辑器单实例）：bindIconMap(state.iconMap) 由 io 装配时调用一次；
// preloadIcons(deck.pages) 在 deck 加载后预读全部图标（live-reload 自动补新）；
// ensureIcon(raw) 供选择器/新增元素按需取单个。
// ============================================================================

import { loadIconRegistry, resolveIconName, fetchIconSvg, normalizeIconSvg } from "../../../packages/model/icon-fa.js";

let iconMap = null; // bindIconMap 绑定后有效（= state.iconMap）
let registryPromise = null;
let registrySync = null; // getIconRegistry resolve 后的同步快照
const pending = new Map(); // raw → Promise（去重并发请求）

/** 绑定渲染缓存映射（io.js 装配时调用一次）。 */
export function bindIconMap(map) {
  iconMap = map;
}

/** 注册表（单例 Promise；resolve 后同步快照可用）。 */
export function getIconRegistry() {
  if (!registryPromise) {
    registryPromise = loadIconRegistry().then((reg) => {
      registrySync = reg;
      return reg;
    });
  }
  return registryPromise;
}

/** 注册表同步快照（已加载返回对象，未加载返回 null；props hint 等尽力而为场景）。 */
export function getIconRegistrySync() {
  return registrySync;
}

/** 取单个图标（命中缓存直接返回；失败返回 null 并记 console.warn）。map 缺省用绑定映射。 */
export async function ensureIcon(raw, map = iconMap) {
  if (!raw || !map) return null;
  if (map[raw]?.inner) return map[raw];
  if (pending.has(raw)) return pending.get(raw);
  const p = (async () => {
    try {
      const reg = await getIconRegistry();
      const hit = resolveIconName(raw, reg);
      if (!hit) return null;
      const text = await fetchIconSvg(hit, reg);
      const def = text ? normalizeIconSvg(text, hit) : null;
      if (def) map[raw] = def;
      return def;
    } catch (err) {
      console.warn(`[icons] ${raw} 加载失败:`, err?.message || err);
      return null;
    } finally {
      pending.delete(raw);
    }
  })();
  pending.set(raw, p);
  return p;
}

/** 页面集全量预读（loader finishLoad / live-reload 后调用；已有项自动跳过）。
 * 画廊等无编辑器 state 的场景传显式 map。 */
export async function preloadIcons(pages, map = iconMap) {
  if (!map || !Array.isArray(pages)) return;
  const names = new Set();
  const walk = (el) => {
    if (el?.elementType === "icon" && el.iconName) names.add(el.iconName);
    for (const child of el?.elements || []) walk(child);
  };
  for (const page of pages) for (const el of page?.elements || []) walk(el);
  await Promise.all([...names].map((raw) => ensureIcon(raw, map)));
}

/**
 * 图标目录查询（选择器对话框与添加面板共用）：关键词 + 分类过滤，按风格展开
 * （far 与 fas 并列为两个可选条目）。q 匹配 name/label/aliases/search terms。
 * @returns {{entries: Array<{raw,name,prefix,label}>, total: number}} total 为过滤后图标数（展开前）
 */
export function queryIconEntries(registry, { q = "", cat = null, cap = Infinity } = {}) {
  const kw = String(q || "").trim().toLowerCase();
  const match = (e) => {
    if (!kw) return true;
    return (
      e.name.includes(kw) ||
      (e.label && String(e.label).toLowerCase().includes(kw)) ||
      (e.aliases || []).some((a) => a.includes(kw)) ||
      (e.terms || []).some((t) => String(t).toLowerCase().includes(kw))
    );
  };
  const icons = registry.icons.filter((i) => (!cat || i.cat === cat) && match(i));
  const entries = [];
  for (const e of icons) {
    for (const prefix of e.styles) {
      entries.push({ raw: `${prefix}:${e.name}`, name: e.name, prefix, label: e.label || e.name });
      if (entries.length >= cap) return { entries, total: icons.length };
    }
  }
  return { entries, total: icons.length };
}
