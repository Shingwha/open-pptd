// ============================================================================
// app/project/font-manager.js — 编辑器字体库（本地文件 / 网络 URL / 内置库）
// ----------------------------------------------------------------------------
// 职责：
//   - 添加字体（<input type=file> 读字节 / fetch URL / 内置注册表）→ parseFontInfo
//     取名 → FontFace 注册（预览立即生效，渲染器 CSS font-family 自动匹配）
//   - 删除 / 嵌入勾选 / 子集化勾选
//   - 保存项目时同步到 deck.fonts 资源表（key = family，带 file/url/subset）
//   - 加载项目时从资源表恢复：url 字体自动 fetch 注册；file 字体待用户重新选择
//   - 导出时按「嵌入勾选」生成 options.fontFiles
// 管理界面（浮层）见 interaction/font-panel.js，本模块只承担数据层。
//
// PPTD 格式（见 references/pptd-format.md）：
//   fonts:
//     站酷小薇: { family: ZCOOL XiaoWei, file: fonts/xxx.ttf, subset: true }   # 资源表
//     title: 站酷小薇                                                          # 组件槽引用
// ============================================================================

import { parseFontInfo } from "../../core/font.js";
import { parseFontResources } from "../../core/theme.js";
import { loadFontRegistry, findFont, fontFileUrl, fetchFontBytes } from "../../core/font-registry.js";
import { showToast } from "../toast.js";

/** 系统字体池（styles.md 0.5 节；元素 fontFamily 下拉兜底选项）。 */
export const SYSTEM_FONTS = ["Microsoft YaHei", "KaiTi", "SimSun", "SimHei", "FangSong", "YouYuan"];

export function createFontManager(state) {
  /** FontFace 注册：family 必须与渲染器 CSS font-family 完全一致（parseFontInfo 取 name 表）。 */
  async function registerFace(family, bytes) {
    const face = new FontFace(family, bytes);
    await face.load();
    document.fonts.add(face);
  }

  /** 添加本地字体文件 → 返回 family；失败抛错。 */
  async function addLocalFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    state.fontLibrary[info.family] = {
      bytes, source: "local", file: null, url: null,
      subset: true, embed: true, size: bytes.length,
    };
    return info.family;
  }

  /** 添加网络字体 URL → 返回 family；失败抛错。 */
  async function addUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    state.fontLibrary[info.family] = {
      bytes, source: "url", file: null, url,
      subset: true, embed: true, size: bytes.length,
    };
    return info.family;
  }

  /** 内置字体库：从 assets/fonts/ 加载注册表字体 → FontFace 注册 + 加入库。 */
  async function addRegistryFont(keyOrFamily) {
    const registry = await loadFontRegistry();
    const hit = findFont(registry, keyOrFamily);
    if (!hit) throw new Error(`注册表未找到: ${keyOrFamily}`);
    if (state.fontLibrary[hit.family]) return hit.family; // 已加载
    const bytes = await fetchFontBytes(hit);
    if (!bytes) throw new Error(`字体文件不可用: ${hit.family}（本地缺失且线上源不可达）`);
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    state.fontLibrary[info.family] = {
      bytes, source: "registry", file: hit.file, url: null,
      subset: true, embed: true, size: bytes.length,
    };
    return info.family;
  }

  /** 重新加载本地文件到已有条目（file 字体打开项目后 bytes 缺失时）。 */
  async function reloadLocalFile(family, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    const prev = state.fontLibrary[family] || {};
    state.fontLibrary[family] = { ...prev, bytes, source: "local", size: bytes.length };
  }

  function removeFont(family) {
    delete state.fontLibrary[family];
  }

  /** 导出用：嵌入勾选的字体字节（key = family）。 */
  function exportFontFiles() {
    const files = {};
    for (const [family, f] of Object.entries(state.fontLibrary)) {
      if (f.embed && f.bytes) files[family] = f.bytes;
    }
    return files;
  }

  /** 元素 fontFamily 下拉选项：资源表 key + 库字体 + 系统字体池。 */
  function fontOptions() {
    const opts = [["", "默认"]];
    for (const [key] of Object.entries(state.theme?.fontResources || {})) {
      opts.push([key, `${key}（资源）`]);
    }
    for (const family of Object.keys(state.fontLibrary)) {
      if (!opts.some(([v]) => v === family)) opts.push([family, `${family}（已嵌入）`]);
    }
    for (const f of SYSTEM_FONTS) {
      if (!opts.some(([v]) => v === f)) opts.push([f, f]);
    }
    return opts;
  }

  /** 保存项目：嵌入勾选的字体 → deck.fonts 资源表（key = family）。
   *  注册表字体只写 {family, subset}（无 file/url，导出自动从内置库取字）；
   *  url 字体写 url；本地文件写 file（仅编辑器内可用，CLI 导出需注册表或 url）。 */
  function syncToDeck() {
    const fonts = state.deck.fonts || (state.deck.fonts = {});
    // 资源表只保留合法声明（对象 + family 字段）；清理 v1 组件槽（字符串值）等杂物
    for (const key of Object.keys(fonts)) {
      const v = fonts[key];
      if (!v || typeof v !== "object" || !(v.family || v.name)) delete fonts[key];
    }
    for (const [family, f] of Object.entries(state.fontLibrary)) {
      if (!f.embed) continue;
      const entry = { family, subset: !!f.subset };
      if (f.source === "url" && f.url) entry.url = f.url;
      else if (f.source === "local") entry.file = f.file || `fonts/${family.replace(/[\\/:*?"<>|]/g, "_")}.ttf`;
      fonts[family] = entry;
    }
  }

  /** 加载项目：从 deck.fonts 资源表恢复库条目（url 自动拉取；注册表 family 自动从内置库加载；file 待用户重选）。 */
  async function restoreFromDeck() {
    const resources = parseFontResources(state.deck?.fonts);
    let registry = null;
    try {
      registry = await loadFontRegistry();
    } catch {
      /* 注册表不可用时注册表引用字体跳过自动加载 */
    }
    for (const [key, res] of Object.entries(resources)) {
      const family = res.family || key;
      if (state.fontLibrary[family]) continue;
      const entry = { source: res.url ? "url" : "local", url: res.url, file: res.file, subset: res.subset, embed: true, bytes: null, size: 0 };
      state.fontLibrary[family] = entry;
      if (res.url) {
        try {
          const bytes = new Uint8Array(await (await fetch(res.url)).arrayBuffer());
          await registerFace(family, bytes);
          entry.bytes = bytes;
          entry.size = bytes.length;
        } catch {
          showToast(`网络字体加载失败: ${family}`, "danger");
        }
      } else if (registry && findFont(registry, family)) {
        // 注册表引用（{family: <注册名>}）：从内置字体库自动加载预览（本地缺失时线上回退）
        try {
          const hit = findFont(registry, family);
          const bytes = await fetchFontBytes(hit);
          if (!bytes) throw new Error("字体字节不可用");
          await registerFace(family, bytes);
          entry.bytes = bytes;
          entry.source = "registry";
          entry.size = bytes.length;
        } catch {
          showToast(`内置字体加载失败: ${family}`, "danger");
        }
      }
    }
  }

  return {
    registerFace, addLocalFile, addUrl, addRegistryFont, reloadLocalFile, removeFont,
    exportFontFiles, fontOptions, syncToDeck, restoreFromDeck,
  };
}
