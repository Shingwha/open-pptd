// ============================================================================
// app/project/source.js — 传输接缝（ProjectSource 契约 + 三个实现）
// ----------------------------------------------------------------------------
// 编辑器对"项目从哪里来、写到哪里去"只依赖这个鸭子类型接口（与 handle-io.js
// 的思路一致），不再出现 fetch("/api/save") 或 new EventSource("/events") 这类
// 根绝对路径字面量——宿主（同源 iframe / IPC / 内存）可注入自己的实现。
//
// ProjectSource（契约 v2，见 docs/specs/ref/integration-plan.md 附录 D.3）：
//   capabilities: { writable, liveWatch, binary }
//   read(hint?):  Promise<{ manifestText, pageFiles: Map, media?, missing? }>
//   write(files): Promise<number>   files: [{ path, text? , bytes? }]
//   readMedia?(path): Promise<Uint8Array|null>
//   watch?(cb, hooks?): () => void  返回退订函数
//
// 引擎内置三个实现（httpSource / directoryHandleSource / memorySource）；
// 适配仓的 dshSource 在仓外实现，同一套用例。
//
// 另导出 applyDeck(deckData, ctx)：把读取结果应用到编辑器状态
// （loader.js 与外部装配共用同一份逻辑）。
// ============================================================================

import * as yaml from "../../../packages/model/vendor/js-yaml.mjs";
import { parseDeck } from "../../../packages/model/pptd-io.js";
import { resolveTheme, DEFAULT_THEME } from "../../../packages/model/theme.js";
import { syncElementId } from "../../../packages/model/model.js";
import { bytesToBase64, base64ToBytes } from "../../../packages/model/bytes.js";
import { extToMime } from "../../../packages/writer/util.js";
import { createHistory } from "../../interaction/history.js";
import { fetchProjectTexts } from "./project-cache.js";
import { readProject, writeFiles, fingerprint, readImageAsDataUrl } from "./handle-io.js";

// 编辑器站点根（本文件位于 <root>/editor/app/project/，../../../ 即 editor/）
const EDITOR_BASE = new URL("../../", import.meta.url).href;

/** deckUrl 归一为绝对 URL（http(s) 原样；否则相对 base 或编辑器站点根解析）。 */
function resolveDeckUrl(deckUrl, base = "") {
  if (!deckUrl) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(deckUrl)) return deckUrl; // 已是绝对 URL
  if (base) {
    try {
      return new URL(deckUrl, new URL(base, document.baseURI || EDITOR_BASE)).href;
    } catch {
      /* 落到编辑器站点根 */
    }
  }
  return new URL(deckUrl, EDITOR_BASE).href;
}

/** 相对路径挂到 base 前缀（base 为空时原样返回，行为等于此前的根绝对路径）。 */
function withBase(base, path) {
  if (!path) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return `${base}${path}`;
}

// ----------------------------------------------------------------------------
// 实现 1：httpSource —— 现有 serve 的 fetch / SSE 模式（base 参数化）
// ----------------------------------------------------------------------------
/**
 * @param {{ base?: string, deckUrl?: string }} [opts]
 *   base    站点前缀（默认 ""，即当前 serve 行为的根绝对路径）
 *   deckUrl 项目 manifest 位置（绝对 URL、相对 base 的路径，或 () => string）
 */
export function httpSource({ base = "", deckUrl = null } = {}) {
  const deckUrlOf = () => (typeof deckUrl === "function" ? deckUrl() : deckUrl);

  return {
    capabilities: { writable: true, liveWatch: true, binary: true },

    /** hint 指定本次读取的项目 URL（可省，默认用构造时的 deckUrl）。 */
    async read(hint) {
      const manifestUrl = resolveDeckUrl(hint || deckUrlOf(), base);
      if (!manifestUrl) throw new Error("httpSource 未指定 deckUrl");
      const { manifestText, pageTexts, missing = 0 } = await fetchProjectTexts(manifestUrl, yaml.load);
      return { manifestText, pageFiles: pageTexts, missing, manifestPath: manifestUrl };
    },

    /** 批量写回（POST /api/save；body 口径与既有服务端一致：文本 content / 图片 b64）。 */
    async write(files) {
      const res = await fetch(withBase(base, "/api/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) =>
            f.bytes != null ? { path: f.path, b64: bytesToBase64(f.bytes) } : { path: f.path, content: f.text ?? "" }
          ),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      return data.count ?? files.length;
    },

    async readMedia(path) {
      try {
        const res = await fetch(withBase(base, path));
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    },

    /**
     * 订阅服务端变更推送（SSE）。
     * @param {() => void} cb 收到变更推送
     * @param {{ onOpen?: () => void, onError?: () => void }} [hooks]
     * @returns {() => void} 退订函数
     */
    watch(cb, hooks = {}) {
      let es = null;
      try {
        es = new EventSource(withBase(base, "/events"));
      } catch {
        return () => {}; // 无 /events 端点（部署模式）或异常环境：不启用
      }
      let opened = false;
      es.onopen = () => {
        opened = true;
        hooks.onOpen?.();
      };
      es.onerror = () => {
        // 部署模式：/events 404 → 未打开过则放弃（本地 serve 断线由 EventSource 自动重连）
        if (!opened && es) {
          es.close();
          es = null;
          hooks.onError?.();
        }
      };
      es.onmessage = () => cb();
      return () => {
        es?.close();
        es = null;
      };
    },
  };
}

// ----------------------------------------------------------------------------
// 实现 2：directoryHandleSource —— 浏览器 File System Access 句柄模式
// ----------------------------------------------------------------------------
/**
 * 包装 editor/app/project/handle-io.js（该文件本身不改，鸭子类型设计已正确）。
 * File System Access 无推送通道 → liveWatch=false，由 live-reload 回退指纹轮询。
 */
export function directoryHandleSource(handle) {
  const dir = handle;
  return {
    capabilities: { writable: true, liveWatch: false, binary: true },

    async read() {
      const { manifestText, pageTexts, missing = 0 } = await readProject(dir);
      return { manifestText, pageFiles: pageTexts, missing };
    },

    async write(files) {
      return writeFiles(
        dir,
        files.map((f) =>
          f.bytes != null ? { path: f.path, b64: bytesToBase64(f.bytes) } : { path: f.path, content: f.text ?? "" }
        )
      );
    },

    async readMedia(path) {
      const mime = extToMime(/\.([a-z0-9]+)$/i.exec(path)?.[1]);
      if (!mime) return null;
      const dataUrl = await readImageAsDataUrl(dir, path, mime);
      if (!dataUrl) return null;
      const comma = dataUrl.indexOf(",");
      return comma < 0 ? null : base64ToBytes(dataUrl.slice(comma + 1));
    },

    /** 指纹（live-reload 轮询用；语义同 handle-io.fingerprint）。 */
    fingerprint() {
      return fingerprint(dir);
    },
  };
}

// ----------------------------------------------------------------------------
// 实现 3：memorySource —— 测试与嵌入（无 IO）
// ----------------------------------------------------------------------------
/**
 * @param {{ files?: Record<string, string|Uint8Array>, writable?: boolean }} [opts]
 *   files 以路径为键的内存项目（"deck.pptd" + "pages/*.page" + 二进制媒体）
 */
export function memorySource({ files = {}, writable = true } = {}) {
  const store = new Map();
  for (const [path, value] of Object.entries(files)) store.set(path, value);

  const textOf = (v) => (typeof v === "string" ? v : new TextDecoder().decode(v));
  const manifestPath = () => {
    if (store.has("deck.pptd")) return "deck.pptd";
    for (const key of store.keys()) if (/\.pptd$/i.test(key)) return key;
    return "deck.pptd";
  };

  return {
    capabilities: { writable, liveWatch: false, binary: true },

    async read() {
      const mPath = manifestPath();
      const manifestText = store.has(mPath) ? textOf(store.get(mPath)) : "";
      const pageFiles = new Map();
      const media = new Map();
      for (const [path, value] of store.entries()) {
        if (path === mPath) continue;
        if (typeof value === "string") pageFiles.set(path, value);
        else media.set(path, value);
      }
      return { manifestText, pageFiles, media: media.size ? media : undefined };
    },

    async write(files) {
      for (const f of files) store.set(f.path, f.bytes != null ? f.bytes : f.text ?? "");
      return files.length;
    },

    async readMedia(path) {
      const v = store.get(path);
      if (v == null) return null;
      return typeof v === "string" ? new TextEncoder().encode(v) : v;
    },
  };
}

// ----------------------------------------------------------------------------
// 读取结果 → 编辑器状态（loader 与外部装配共用）
// ----------------------------------------------------------------------------
/**
 * 把一份已读取的项目应用到编辑器状态：重置历史/选中/页面/图片映射/id 计数器并
 * 渲染状态栏（loadDeck 与手动刷新共用）。
 * @param {{ manifestText, pageFiles, manifestPath?, handle?, projectName? }} deckData
 * @param {{ state, images, renderStatusBar, setBrandFile, applyTheme? }} ctx
 *        依赖注入的编辑器上下文（images.rebuildImageMap / 顶栏品牌 / 状态栏）
 */
export function applyDeck(deckData, ctx) {
  const { state, images, renderStatusBar, setBrandFile } = ctx;
  const { manifestText, pageFiles, manifestPath = "", handle = null, projectName = "" } = deckData;
  state.deck = parseDeck(manifestText, pageFiles);
  state.manifestPath = manifestPath;
  state.projectHandle = handle;
  state.projectName = projectName;
  setBrandFile(handle ? projectName : manifestPath);
  // 主题：loader 的 applyTheme 优先（保持单一实现）；外部调用方无此依赖时用内联等价实现
  if (typeof ctx.applyTheme === "function") {
    ctx.applyTheme(state.deck.theme || DEFAULT_THEME);
  } else {
    const themeInput = state.deck.theme || DEFAULT_THEME;
    state.deck.theme =
      themeInput && typeof themeInput === "object"
        ? JSON.parse(JSON.stringify(themeInput))
        : JSON.parse(JSON.stringify(DEFAULT_THEME));
    state.theme = resolveTheme(state.deck);
  }
  state.currentPage = 0;
  state.selectedId = null;
  state.history = createHistory();
  state.savedDeck = structuredClone(state.deck); // 保存基线：撤销/重做回它即视为无未保存修改
  state.dirty = false; // 刚从磁盘/服务器加载，无未保存修改
  syncElementId(state.deck);
  images.rebuildImageMap();
  renderStatusBar();
}

/**
 * 委托源：把读写路由到"当前项目来源"（句柄模式优先，否则用装配时注入的源）。
 * createIo 用它把 standalone 的「URL 项目 ↔ 本地句柄项目」双来源收敛到一个
 * ProjectSource 外观上，loader/saver/live-reload 只认这个外观。
 */
export function delegatingSource({ base, handleSource, currentHandle }) {
  const chosen = () => (currentHandle() ? handleSource(currentHandle()) : base);
  return {
    get capabilities() {
      return chosen()?.capabilities || { writable: false, liveWatch: false, binary: false };
    },
    read: (hint) => chosen().read(hint),
    write: (files) => chosen().write(files),
    readMedia: (path) => chosen().readMedia?.(path) ?? Promise.resolve(null),
    watch: (cb, hooks) => chosen().watch?.(cb, hooks) ?? (() => {}),
    fingerprint: () => chosen().fingerprint?.() ?? Promise.resolve(null),
    /** 句柄项目读取（loader.loadDeckFromHandle 用；无句柄则回退普通 read）。 */
    readFromHandle: (handle) => handleSource(handle).read(),
  };
}
